-- =====================================================================
-- MARKETING LEADER
-- Karyawan Marketing yang dicentang "Marketing leader":
--   - tidak punya atasan
--   - bisa membawahi karyawan Marketing lain (sama seperti Business Manager)
-- Ikut diperbarui: nama tim di Layar Presensi, running text, dan slip allowance.
-- Jalankan sekali di Supabase SQL Editor (setelah 20261015b).
-- =====================================================================
BEGIN;

ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS marketing_leader boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION fn_karyawan_validasi_struktur() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dept text; v_jabatan_dept text; v_atasan_ok boolean; v_bawahan int; v_bisa_membawahi boolean;
BEGIN
  -- Tanggal nonaktif
  IF NEW.is_aktif IS FALSE AND (TG_OP = 'INSERT' OR OLD.is_aktif IS TRUE) THEN NEW.nonaktif_at := now(); END IF;
  IF NEW.is_aktif IS TRUE THEN NEW.nonaktif_at := NULL; END IF;

  SELECT nama_departemen INTO v_dept FROM master_departemen WHERE id = NEW.id_departemen;
  -- Hanya Marketing yang bisa jadi Marketing leader
  IF v_dept IS DISTINCT FROM 'Marketing' THEN NEW.marketing_leader := false; END IF;

  -- Yang masih punya bawahan aktif tidak boleh dinonaktifkan / kehilangan hak membawahi
  IF TG_OP = 'UPDATE' THEN
    SELECT count(*) INTO v_bawahan FROM karyawan WHERE id_atasan = NEW.id AND is_aktif;
    v_bisa_membawahi :=
      (v_dept = 'Backoffice' AND EXISTS (SELECT 1 FROM master_jabatan WHERE nama = NEW.jabatan AND bisa_jadi_atasan))
      OR (v_dept = 'Marketing' AND NEW.marketing_leader);
    IF v_bawahan > 0 AND (NEW.is_aktif IS FALSE OR NOT v_bisa_membawahi) THEN
      RAISE EXCEPTION 'Masih membawahi % Marketing. Transfer bawahan ke atasan lain terlebih dahulu.', v_bawahan;
    END IF;
  END IF;

  -- Karyawan nonaktif tidak divalidasi strukturnya
  IF NEW.is_aktif IS FALSE THEN RETURN NEW; END IF;

  IF NEW.jabatan IS NULL AND v_dept = 'Marketing' THEN NEW.jabatan := 'Marketing'; END IF;

  SELECT d.nama_departemen INTO v_jabatan_dept
  FROM master_jabatan j JOIN master_departemen d ON d.id = j.id_departemen WHERE j.nama = NEW.jabatan;
  IF v_dept IS NOT NULL AND v_jabatan_dept IS DISTINCT FROM v_dept THEN
    RAISE EXCEPTION 'Job role % bukan milik departemen %.', COALESCE(NEW.jabatan, '(kosong)'), v_dept;
  END IF;

  IF v_dept = 'Marketing' THEN
    IF NEW.marketing_leader THEN
      -- Marketing leader tidak punya atasan
      NEW.id_atasan := NULL;
    ELSE
      IF NEW.id_atasan IS NULL THEN
        RAISE EXCEPTION 'Marketing wajib memiliki 1 atasan (Business Manager atau Marketing leader).';
      END IF;
      IF NEW.id_atasan = NEW.id THEN
        RAISE EXCEPTION 'Atasan Marketing harus orang lain.';
      END IF;
      SELECT a.is_aktif AND (
               (d.nama_departemen = 'Backoffice' AND j.bisa_jadi_atasan)
               OR (d.nama_departemen = 'Marketing' AND a.marketing_leader))
      INTO v_atasan_ok
      FROM karyawan a
      JOIN master_departemen d ON d.id = a.id_departemen
      JOIN master_jabatan j ON j.nama = a.jabatan
      WHERE a.id = NEW.id_atasan;
      IF v_atasan_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'Atasan Marketing harus Business Manager (Backoffice) atau Marketing leader yang aktif.';
      END IF;
    END IF;
  ELSIF v_dept = 'Backoffice' THEN
    NEW.id_atasan := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_karyawan_20_validasi_struktur ON karyawan;
CREATE TRIGGER trg_karyawan_20_validasi_struktur
BEFORE INSERT OR UPDATE OF id_departemen, jabatan, id_atasan, is_aktif, marketing_leader ON karyawan
FOR EACH ROW EXECUTE FUNCTION fn_karyawan_validasi_struktur();

CREATE OR REPLACE FUNCTION fn_allowance_info(p_id_karyawan uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('nama', k.nama_lengkap, 'nip', k.nip, 'jabatan', k.jabatan,
           'departemen', d.nama_departemen,
           'tim', CASE WHEN d.nama_departemen = 'Marketing' THEN COALESCE(ats.nama_lengkap, k.nama_lengkap) ELSE d.nama_departemen END,
           'lokasi', l.nama_cabang)
  FROM karyawan k
  LEFT JOIN master_departemen d ON d.id = k.id_departemen
  LEFT JOIN karyawan ats ON ats.id = k.id_atasan
  LEFT JOIN master_lokasi l ON l.id = k.id_lokasi
  WHERE k.id = p_id_karyawan
$$;

CREATE OR REPLACE FUNCTION fn_allowance_daftar(p_periode date) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_periode date := date_trunc('month', p_periode)::date; r json;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT COALESCE(json_agg(x ORDER BY x.departemen DESC, x.tim, x.nama), '[]'::json) INTO r FROM (
    SELECT k.id AS id_karyawan, k.nama_lengkap AS nama, k.nip, k.jabatan,
           d.nama_departemen AS departemen,
           CASE WHEN d.nama_departemen = 'Marketing' THEN COALESCE(ats.nama_lengkap, k.nama_lengkap) ELSE d.nama_departemen END AS tim,
           l.nama_cabang AS lokasi,
           j.allowance AS allowance_jabatan, k.allowance_khusus,
           COALESCE(k.allowance_khusus, j.allowance, 0) AS nominal_sekarang,
           fn_allowance_tanpa_komisi(k.id, v_periode) AS tanpa_komisi_2_bulan, a.allowance_hangus,
           a.id, a.nominal, a.potongan, a.komisi, a.total, a.catatan, COALESCE(a.status, 'BARU') AS status, a.versi,
           a.info, a.dikirim_at, a.disetujui_at, a.final_at,
           CASE WHEN a.status IN ('DISETUJUI', 'FINAL') THEN a.ttd END AS ttd,
           k.ttd IS NOT NULL AS punya_ttd, k.is_aktif
    FROM karyawan k
    LEFT JOIN allowance a ON a.id_karyawan = k.id AND a.periode = v_periode
    LEFT JOIN master_jabatan j ON j.nama = k.jabatan
    LEFT JOIN master_departemen d ON d.id = k.id_departemen
    LEFT JOIN karyawan ats ON ats.id = k.id_atasan
    LEFT JOIN master_lokasi l ON l.id = k.id_lokasi
    WHERE k.is_approved AND (k.is_aktif OR a.id IS NOT NULL)
  ) x;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION fn_layar_papan(p_id_lokasi uuid) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_hari_ini date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_awal date := date_trunc('month', (now() AT TIME ZONE 'Asia/Jakarta'))::date;
  v_hari_kerja int; v_top json; v_papan json; v_tim json; v_ob json;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;

  -- 5 scan terakhir hari ini di lokasi ini (masuk & pulang), terbaru di atas
  SELECT json_agg(t ORDER BY t.id DESC) INTO v_top FROM (
    SELECT l.id, k.nama_lengkap AS nama,
           CASE WHEN md.nama_departemen = 'Marketing' THEN 'Tim ' || split_part(COALESCE(ats.nama_lengkap, k.nama_lengkap), ' ', 1) ELSE k.jabatan END AS keterangan,
           l.jenis, l.waktu, l.status, l.telat_menit
    FROM log_scan l
    JOIN karyawan k ON k.id = l.id_karyawan
    LEFT JOIN master_departemen md ON md.id = k.id_departemen
    LEFT JOIN karyawan ats ON ats.id = k.id_atasan
    WHERE l.id_lokasi = p_id_lokasi AND k.is_aktif
      AND (l.waktu AT TIME ZONE 'Asia/Jakarta')::date = v_hari_ini
    ORDER BY l.id DESC
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
           CASE WHEN md.nama_departemen = 'Marketing' THEN 'Tim ' || split_part(COALESCE(ats.nama_lengkap, k.nama_lengkap), ' ', 1) ELSE k.jabatan END AS keterangan,
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

  -- Kehadiran per tim hari ini (karyawan aktif yang lokasi kerjanya di sini).
  -- Hadir = sudah scan/absen masuk hari ini. Backoffice dihitung satu grup "BO".
  WITH anggota AS (
    SELECT k.id, d.nama_departemen AS dept,
           -- kepala tim: atasan langsung, atau dirinya sendiri kalau Marketing leader
           CASE WHEN d.nama_departemen = 'Marketing' AND k.marketing_leader THEN k.id ELSE k.id_atasan END AS id_atasan
    FROM karyawan k JOIN master_departemen d ON d.id = k.id_departemen
    WHERE k.is_aktif AND k.is_approved AND k.id_lokasi = p_id_lokasi
  ), hadir AS (
    SELECT DISTINCT id_karyawan FROM absensi WHERE tanggal = v_hari_ini AND waktu_masuk IS NOT NULL
  ), grup AS (
    SELECT 'BO' AS nama, 0 AS urut, count(*)::int AS total, count(h.id_karyawan)::int AS hadir
    FROM anggota a LEFT JOIN hadir h ON h.id_karyawan = a.id WHERE a.dept = 'Backoffice'
    HAVING count(*) > 0
    UNION ALL
    SELECT 'Tim ' || split_part(l.nama_lengkap, ' ', 1), 1, count(*)::int, count(h.id_karyawan)::int
    FROM anggota a JOIN karyawan l ON l.id = a.id_atasan LEFT JOIN hadir h ON h.id_karyawan = a.id
    WHERE a.dept = 'Marketing'
    GROUP BY l.id, l.nama_lengkap
  )
  SELECT json_agg(json_build_object('nama', nama, 'hadir', hadir, 'total', total,
           'persen', round(100.0 * hadir / NULLIF(total, 0))::int) ORDER BY urut, nama)
  INTO v_tim FROM grup;

  -- OB (job role pakai shift) yang sedang bertugas: sudah masuk hari ini di lokasi ini & belum pulang
  SELECT json_agg(json_build_object('nama', k.nama_lengkap, 'shift', s.nama,
           'jam', to_char(s.jam_masuk, 'HH24.MI') || '–' || to_char(s.jam_pulang, 'HH24.MI'),
           'masuk', a.waktu_masuk) ORDER BY s.no, a.waktu_masuk)
  INTO v_ob
  FROM absensi a
  JOIN karyawan k ON k.id = a.id_karyawan
  JOIN master_shift s ON s.no = a.shift
  WHERE a.tanggal = v_hari_ini AND a.id_lokasi = p_id_lokasi
    AND a.waktu_masuk IS NOT NULL AND a.waktu_keluar IS NULL AND k.is_aktif;

  RETURN json_build_object(
    'tim', COALESCE(v_tim, '[]'::json),
    'ob', COALESCE(v_ob, '[]'::json),
    'top', COALESCE(v_top, '[]'::json),
    'papan', COALESCE(v_papan, '[]'::json),
    'hari_kerja', v_hari_kerja);
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT (marketing_leader) ON karyawan TO anon, authenticated;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
