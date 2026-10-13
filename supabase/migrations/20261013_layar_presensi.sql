-- =====================================================================
-- LAYAR PRESENSI (TV): log scan per lokasi, 5 absen pertama hari ini,
-- leaderboard paling pagi bulan ini.
-- Jalankan sekali di Supabase SQL Editor (setelah migrasi 20261012).
-- =====================================================================
BEGIN;

-- ---------- 1. Log setiap scan berhasil (sumber bubble notifikasi) ----------
-- Dicatat per lokasi QR yang dipindai, jadi layar Malang dan Surabaya
-- hanya menerima scan dari lokasinya sendiri. Input manual admin tidak masuk log.
CREATE TABLE IF NOT EXISTS log_scan (
  id           bigserial PRIMARY KEY,
  id_karyawan  uuid NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  id_lokasi    uuid NOT NULL REFERENCES master_lokasi(id) ON DELETE CASCADE,
  jenis        text NOT NULL CHECK (jenis IN ('MASUK', 'KELUAR')),
  waktu        timestamptz NOT NULL DEFAULT now(),
  status       text,
  telat_menit  integer
);
CREATE INDEX IF NOT EXISTS ix_log_scan_lokasi ON log_scan (id_lokasi, id);

-- Hanya bisa dibaca lewat RPC di bawah
ALTER TABLE log_scan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON log_scan FROM anon, authenticated;
REVOKE ALL ON SEQUENCE log_scan_id_seq FROM anon, authenticated;

-- ---------- 2. fn_absen: sama seperti sebelumnya + catat ke log_scan ----------
CREATE OR REPLACE FUNCTION fn_absen(p_qr text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_id uuid := fn_karyawan_sesi();
  b text[]; v_lokasi uuid; v_ms bigint; v_umur numeric;
  v_now timestamptz := now();
  v_jam int := extract(hour FROM (now() AT TIME ZONE 'Asia/Jakarta'));
  v_tgl date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  a absensi;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;

  b := string_to_array(COALESCE(p_qr, ''), '.');
  IF COALESCE(array_length(b, 1), 0) <> 4 OR b[1] <> 'ABSENSI-KR' THEN RAISE EXCEPTION 'QR_TIDAK_DIKENAL'; END IF;
  IF b[4] <> encode(hmac(b[2] || '.' || b[3], (SELECT nilai FROM rahasia_server WHERE kunci = 'qr_hmac'), 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'QR_TIDAK_DIKENAL';
  END IF;
  v_lokasi := b[2]::uuid;
  v_ms := b[3]::bigint;
  v_umur := extract(epoch FROM clock_timestamp()) * 1000 - v_ms;
  IF v_umur > 30000 OR v_umur < -10000 THEN RAISE EXCEPTION 'QR_KEDALUWARSA'; END IF;

  IF v_jam < 7 THEN RAISE EXCEPTION 'BELUM_BUKA'; END IF;

  SELECT * INTO a FROM absensi WHERE id_karyawan = v_id AND tanggal = v_tgl;

  IF v_jam < 12 THEN
    IF FOUND THEN RAISE EXCEPTION 'SUDAH_MASUK'; END IF;
    INSERT INTO absensi (id_karyawan, waktu_masuk, id_lokasi) VALUES (v_id, v_now, v_lokasi) RETURNING * INTO a;
    INSERT INTO log_scan (id_karyawan, id_lokasi, jenis, waktu, status, telat_menit)
    VALUES (v_id, v_lokasi, 'MASUK', a.waktu_masuk, a.status, a.durasi_telat_menit);
    RETURN json_build_object('jenis', 'MASUK', 'waktu', a.waktu_masuk, 'status', a.status, 'telat_menit', a.durasi_telat_menit);
  END IF;

  IF FOUND AND a.waktu_keluar IS NOT NULL THEN RAISE EXCEPTION 'SUDAH_PULANG'; END IF;
  IF FOUND THEN
    UPDATE absensi SET waktu_keluar = v_now WHERE id = a.id RETURNING * INTO a;
    INSERT INTO log_scan (id_karyawan, id_lokasi, jenis, waktu, status)
    VALUES (v_id, v_lokasi, 'KELUAR', a.waktu_keluar, a.status);
    RETURN json_build_object('jenis', 'KELUAR', 'waktu', a.waktu_keluar, 'tanpa_masuk', false);
  END IF;
  INSERT INTO absensi (id_karyawan, waktu_masuk, waktu_keluar, id_lokasi) VALUES (v_id, NULL, v_now, v_lokasi) RETURNING * INTO a;
  INSERT INTO log_scan (id_karyawan, id_lokasi, jenis, waktu, status)
  VALUES (v_id, v_lokasi, 'KELUAR', a.waktu_keluar, 'TANPA_MASUK');
  RETURN json_build_object('jenis', 'KELUAR', 'waktu', a.waktu_keluar, 'tanpa_masuk', true);
END $$;

-- ---------- 3. Scan baru untuk bubble notifikasi ----------
-- p_setelah NULL = baru buka layar: kembalikan kursor terakhir saja, tanpa scan lama.
CREATE OR REPLACE FUNCTION fn_layar_scan(p_id_lokasi uuid, p_setelah bigint DEFAULT NULL) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_kursor bigint;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  IF p_setelah IS NULL THEN
    SELECT COALESCE(max(id), 0) INTO v_kursor FROM log_scan WHERE id_lokasi = p_id_lokasi;
    RETURN json_build_object('kursor', v_kursor, 'scan', '[]'::json);
  END IF;
  RETURN (
    WITH baru AS (
      SELECT l.id, k.nama_lengkap AS nama, l.jenis, l.waktu, l.status, l.telat_menit
      FROM log_scan l JOIN karyawan k ON k.id = l.id_karyawan
      WHERE l.id_lokasi = p_id_lokasi AND l.id > p_setelah
      ORDER BY l.id
      LIMIT 50
    )
    SELECT json_build_object(
      'kursor', COALESCE((SELECT max(id) FROM baru), p_setelah),
      'scan', COALESCE((SELECT json_agg(baru ORDER BY id) FROM baru), '[]'::json))
  );
END $$;

-- ---------- 4. Papan: 5 absen pertama hari ini + leaderboard bulan ini ----------
-- Leaderboard: siapa yang paling sering jadi orang PERTAMA yang scan masuk di lokasi ini,
-- dalam persen dari hari kerja bulan berjalan (hari kerja = Senin-Jumat dengan minimal
-- 3 orang absen, sama dengan aturan libur di rekap). Reset otomatis tiap tanggal 1.
CREATE OR REPLACE FUNCTION fn_layar_papan(p_id_lokasi uuid) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_hari_ini date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_awal date := date_trunc('month', (now() AT TIME ZONE 'Asia/Jakarta'))::date;
  v_hari_kerja int; v_top json; v_papan json;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;

  SELECT json_agg(t ORDER BY t.waktu_masuk) INTO v_top FROM (
    SELECT k.nama_lengkap AS nama,
           CASE WHEN md.nama_departemen = 'Marketing' THEN 'Tim ' || split_part(ats.nama_lengkap, ' ', 1) ELSE k.jabatan END AS keterangan,
           a.waktu_masuk, a.status, a.durasi_telat_menit AS telat_menit
    FROM absensi a
    JOIN karyawan k ON k.id = a.id_karyawan
    LEFT JOIN master_departemen md ON md.id = k.id_departemen
    LEFT JOIN karyawan ats ON ats.id = k.id_atasan
    WHERE a.tanggal = v_hari_ini AND a.id_lokasi = p_id_lokasi AND a.waktu_masuk IS NOT NULL AND k.is_aktif
    ORDER BY a.waktu_masuk
    LIMIT 5
  ) t;

  SELECT count(*) INTO v_hari_kerja FROM (
    SELECT tanggal FROM absensi
    WHERE tanggal BETWEEN v_awal AND v_hari_ini AND extract(isodow FROM tanggal) < 6
    GROUP BY tanggal HAVING count(*) >= 3
  ) h;

  SELECT json_agg(p ORDER BY p.hari_pertama DESC, p.rata_detik) INTO v_papan FROM (
    WITH hari_kerja AS (
      SELECT tanggal FROM absensi
      WHERE tanggal BETWEEN v_awal AND v_hari_ini AND extract(isodow FROM tanggal) < 6
      GROUP BY tanggal HAVING count(*) >= 3
    )
    SELECT k.nama_lengkap AS nama,
           CASE WHEN md.nama_departemen = 'Marketing' THEN 'Tim ' || split_part(ats.nama_lengkap, ' ', 1) ELSE k.jabatan END AS keterangan,
           count(*)::int AS hari_pertama,
           round(100.0 * count(*) / GREATEST(v_hari_kerja, 1))::int AS persen,
           round(avg(extract(epoch FROM (f.waktu_masuk AT TIME ZONE 'Asia/Jakarta')::time)))::int AS rata_detik
    FROM (
      -- orang pertama yang scan masuk per hari kerja di lokasi ini
      SELECT DISTINCT ON (a.tanggal) a.tanggal, a.id_karyawan, a.waktu_masuk
      FROM absensi a
      JOIN hari_kerja h ON h.tanggal = a.tanggal
      JOIN karyawan kk ON kk.id = a.id_karyawan AND kk.is_aktif
      WHERE a.id_lokasi = p_id_lokasi AND a.waktu_masuk IS NOT NULL
      ORDER BY a.tanggal, a.waktu_masuk
    ) f
    JOIN karyawan k ON k.id = f.id_karyawan
    LEFT JOIN master_departemen md ON md.id = k.id_departemen
    LEFT JOIN karyawan ats ON ats.id = k.id_atasan
    GROUP BY k.id, k.nama_lengkap, md.nama_departemen, ats.nama_lengkap, k.jabatan
    ORDER BY hari_pertama DESC, rata_detik
    LIMIT 5
  ) p;

  RETURN json_build_object(
    'top', COALESCE(v_top, '[]'::json),
    'papan', COALESCE(v_papan, '[]'::json),
    'hari_kerja', v_hari_kerja);
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION fn_layar_scan(uuid, bigint), fn_layar_papan(uuid) FROM public;
    GRANT EXECUTE ON FUNCTION fn_layar_scan(uuid, bigint), fn_layar_papan(uuid), fn_absen(text) TO anon, authenticated;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
