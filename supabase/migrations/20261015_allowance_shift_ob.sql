-- =====================================================================
-- ALLOWANCE + TANDA TANGAN + SHIFT OB
-- Jalankan sekali di Supabase SQL Editor (setelah migrasi 20261014).
--
-- 1. Allowance default per job role, allowance khusus per karyawan
-- 2. Tanda tangan karyawan (gambar kecil, disimpan sebagai teks base64)
-- 3. Tabel allowance per bulan: DRAFT -> TERKIRIM -> DISETUJUI -> FINAL
-- 4. Shift untuk job role OB: Shift 1 07.00-15.00, Shift 2 12.00-20.00
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Allowance default per job role + penanda job role yang pakai shift
-- ---------------------------------------------------------------------
ALTER TABLE master_jabatan ADD COLUMN IF NOT EXISTS allowance bigint NOT NULL DEFAULT 0 CHECK (allowance >= 0);
ALTER TABLE master_jabatan ADD COLUMN IF NOT EXISTS pakai_shift boolean NOT NULL DEFAULT false;

-- Job role OB (Backoffice) dengan shift
INSERT INTO master_jabatan (nama, id_departemen, bisa_jadi_atasan, pakai_shift)
SELECT 'OB', d.id, false, true
FROM master_departemen d WHERE d.nama_departemen = 'Backoffice'
ORDER BY d.id LIMIT 1
ON CONFLICT (nama) DO UPDATE SET pakai_shift = true;

-- Allowance khusus: NULL = ikut allowance job role
ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS allowance_khusus bigint CHECK (allowance_khusus >= 0);

-- ---------------------------------------------------------------------
-- 2. Tanda tangan (PNG kecil base64, maks ~60 KB). Tidak dibuka lewat API langsung.
-- ---------------------------------------------------------------------
ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS ttd text;
ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS ttd_diubah_at timestamptz;

CREATE OR REPLACE FUNCTION fn_ttd_valid(p_ttd text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_ttd IS NULL OR (p_ttd ~ '^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$' AND length(p_ttd) <= 80000)
$$;

-- ---------------------------------------------------------------------
-- 3. Shift (OB)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_shift (
  no          smallint PRIMARY KEY,
  nama        text NOT NULL,
  jam_masuk   time NOT NULL,
  jam_pulang  time NOT NULL
);
INSERT INTO master_shift VALUES (1, 'Shift 1', '07:00', '15:00'), (2, 'Shift 2', '12:00', '20:00')
ON CONFLICT (no) DO UPDATE SET nama = EXCLUDED.nama, jam_masuk = EXCLUDED.jam_masuk, jam_pulang = EXCLUDED.jam_pulang;

ALTER TABLE absensi ADD COLUMN IF NOT EXISTS shift smallint REFERENCES master_shift(no);

-- Status telat: karyawan non-shift lewat 09.00, OB lewat jam masuk shift-nya
CREATE OR REPLACE FUNCTION fn_absensi_hitung() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_jam time; v_batas time := time '09:00';
BEGIN
  IF NEW.id_lokasi IS NULL THEN
    SELECT id_lokasi INTO NEW.id_lokasi FROM karyawan WHERE id = NEW.id_karyawan;
  END IF;
  IF NEW.shift IS NOT NULL THEN
    SELECT jam_masuk INTO v_batas FROM master_shift WHERE no = NEW.shift;
  END IF;
  IF NEW.waktu_masuk IS NULL THEN
    NEW.tanggal := (NEW.waktu_keluar AT TIME ZONE 'Asia/Jakarta')::date;
    NEW.status := 'Late';
    NEW.durasi_telat_menit := NULL;
  ELSE
    NEW.tanggal := (NEW.waktu_masuk AT TIME ZONE 'Asia/Jakarta')::date;
    v_jam := (NEW.waktu_masuk AT TIME ZONE 'Asia/Jakarta')::time;
    IF v_jam >= v_batas + interval '1 minute' THEN
      NEW.status := 'Late';
      NEW.durasi_telat_menit := floor(extract(epoch FROM (v_jam - v_batas)) / 60)::int;
    ELSE
      NEW.status := 'Hadir';
      NEW.durasi_telat_menit := 0;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- fn_absen: tambah pilihan shift. Karyawan non-shift tidak berubah.
-- OB: scan pertama hari itu = masuk (wajib pilih shift), scan berikutnya = pulang
--     (minimal 1 jam setelah masuk, supaya scan dobel tidak tercatat pulang).
DROP FUNCTION IF EXISTS fn_absen(text);
CREATE OR REPLACE FUNCTION fn_absen(p_qr text, p_shift integer DEFAULT NULL) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_id uuid := fn_karyawan_sesi();
  b text[]; v_lokasi uuid; v_ms bigint; v_umur numeric;
  v_now timestamptz := now();
  v_jam int := extract(hour FROM (now() AT TIME ZONE 'Asia/Jakarta'));
  v_tgl date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_pakai_shift boolean;
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

  SELECT COALESCE(j.pakai_shift, false) INTO v_pakai_shift
  FROM karyawan k LEFT JOIN master_jabatan j ON j.nama = k.jabatan WHERE k.id = v_id;

  SELECT * INTO a FROM absensi WHERE id_karyawan = v_id AND tanggal = v_tgl;

  -- ---------- Karyawan dengan shift (OB) ----------
  IF v_pakai_shift THEN
    IF v_jam < 6 THEN RAISE EXCEPTION 'BELUM_BUKA'; END IF;
    IF NOT FOUND THEN
      IF p_shift IS NULL OR NOT EXISTS (SELECT 1 FROM master_shift WHERE no = p_shift) THEN RAISE EXCEPTION 'PILIH_SHIFT'; END IF;
      INSERT INTO absensi (id_karyawan, waktu_masuk, id_lokasi, shift) VALUES (v_id, v_now, v_lokasi, p_shift) RETURNING * INTO a;
      INSERT INTO log_scan (id_karyawan, id_lokasi, jenis, waktu, status, telat_menit)
      VALUES (v_id, v_lokasi, 'MASUK', a.waktu_masuk, a.status, a.durasi_telat_menit);
      RETURN json_build_object('jenis', 'MASUK', 'waktu', a.waktu_masuk, 'status', a.status, 'telat_menit', a.durasi_telat_menit, 'shift', a.shift);
    END IF;
    IF a.waktu_keluar IS NOT NULL THEN RAISE EXCEPTION 'SUDAH_PULANG'; END IF;
    IF a.waktu_masuk IS NOT NULL AND v_now - a.waktu_masuk < interval '1 hour' THEN RAISE EXCEPTION 'SUDAH_MASUK'; END IF;
    UPDATE absensi SET waktu_keluar = v_now WHERE id = a.id RETURNING * INTO a;
    INSERT INTO log_scan (id_karyawan, id_lokasi, jenis, waktu, status)
    VALUES (v_id, v_lokasi, 'KELUAR', a.waktu_keluar, a.status);
    RETURN json_build_object('jenis', 'KELUAR', 'waktu', a.waktu_keluar, 'tanpa_masuk', a.waktu_masuk IS NULL);
  END IF;

  -- ---------- Karyawan biasa (sama seperti sebelumnya) ----------
  IF v_jam < 7 THEN RAISE EXCEPTION 'BELUM_BUKA'; END IF;

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

-- Data sesi HP: tambah info shift, tanda tangan, dan jumlah allowance yang menunggu
CREATE OR REPLACE FUNCTION fn_sesi_karyawan() RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid := fn_karyawan_sesi(); r json;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT json_build_object(
    'id', k.id, 'nama_lengkap', k.nama_lengkap, 'nip', k.nip, 'username', k.username, 'jabatan', k.jabatan,
    'pakai_shift', COALESCE(j.pakai_shift, false),
    'shift', COALESCE((SELECT json_agg(json_build_object('no', s.no, 'nama', s.nama,
               'jam_masuk', to_char(s.jam_masuk, 'HH24.MI'), 'jam_pulang', to_char(s.jam_pulang, 'HH24.MI')) ORDER BY s.no)
               FROM master_shift s), '[]'::json),
    'shift_hari_ini', (SELECT a.shift FROM absensi a WHERE a.id_karyawan = k.id
                       AND a.tanggal = (now() AT TIME ZONE 'Asia/Jakarta')::date),
    'punya_ttd', k.ttd IS NOT NULL)
  INTO r
  FROM karyawan k LEFT JOIN master_jabatan j ON j.nama = k.jabatan WHERE k.id = v_id;
  RETURN r;
END $$;

-- ---------------------------------------------------------------------
-- 4. Allowance per bulan
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS allowance (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periode       date NOT NULL CHECK (extract(day FROM periode) = 1),
  id_karyawan   uuid NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  nominal       bigint NOT NULL DEFAULT 0 CHECK (nominal >= 0),
  potongan      bigint NOT NULL DEFAULT 0 CHECK (potongan >= 0),
  komisi        bigint NOT NULL DEFAULT 0 CHECK (komisi >= 0),
  total         bigint GENERATED ALWAYS AS (nominal - potongan + komisi) STORED,
  catatan       text,
  status        text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'TERKIRIM', 'DISETUJUI', 'FINAL')),
  versi         integer NOT NULL DEFAULT 0,
  info          jsonb,          -- jabatan/tim/lokasi saat dikirim (untuk slip)
  dikirim_at    timestamptz,
  disetujui_at  timestamptz,
  final_at      timestamptz,
  ttd           text,           -- salinan tanda tangan saat karyawan menyetujui
  dibuat_at     timestamptz NOT NULL DEFAULT now(),
  diubah_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (periode, id_karyawan),
  CONSTRAINT ck_allowance_total CHECK (nominal - potongan + komisi >= 0)
);
ALTER TABLE allowance ENABLE ROW LEVEL SECURITY;  -- hanya lewat RPC di bawah
REVOKE ALL ON allowance FROM anon, authenticated;
-- Jam shift boleh dibaca siapa saja (untuk form admin), hanya admin yang boleh ubah
ALTER TABLE master_shift ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS baca_shift ON master_shift;
CREATE POLICY baca_shift ON master_shift FOR SELECT USING (true);
DROP POLICY IF EXISTS admin_akses_penuh ON master_shift;
CREATE POLICY admin_akses_penuh ON master_shift FOR ALL USING ((SELECT fn_admin_aktif())) WITH CHECK ((SELECT fn_admin_aktif()));

-- Nominal dasar saat ini: allowance khusus karyawan, kalau kosong ikut job role
CREATE OR REPLACE FUNCTION fn_allowance_dasar(p_id_karyawan uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(k.allowance_khusus, j.allowance, 0)
  FROM karyawan k LEFT JOIN master_jabatan j ON j.nama = k.jabatan WHERE k.id = p_id_karyawan
$$;

CREATE OR REPLACE FUNCTION fn_allowance_info(p_id_karyawan uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('nama', k.nama_lengkap, 'nip', k.nip, 'jabatan', k.jabatan,
           'departemen', d.nama_departemen,
           'tim', CASE WHEN d.nama_departemen = 'Marketing' THEN ats.nama_lengkap ELSE d.nama_departemen END,
           'lokasi', l.nama_cabang)
  FROM karyawan k
  LEFT JOIN master_departemen d ON d.id = k.id_departemen
  LEFT JOIN karyawan ats ON ats.id = k.id_atasan
  LEFT JOIN master_lokasi l ON l.id = k.id_lokasi
  WHERE k.id = p_id_karyawan
$$;

-- ---------- Admin: daftar allowance satu periode ----------
CREATE OR REPLACE FUNCTION fn_allowance_daftar(p_periode date) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_periode date := date_trunc('month', p_periode)::date; r json;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT COALESCE(json_agg(x ORDER BY x.departemen DESC, x.tim, x.nama), '[]'::json) INTO r FROM (
    SELECT k.id AS id_karyawan, k.nama_lengkap AS nama, k.nip, k.jabatan,
           d.nama_departemen AS departemen,
           CASE WHEN d.nama_departemen = 'Marketing' THEN ats.nama_lengkap ELSE d.nama_departemen END AS tim,
           l.nama_cabang AS lokasi,
           j.allowance AS allowance_jabatan, k.allowance_khusus,
           COALESCE(k.allowance_khusus, j.allowance, 0) AS nominal_sekarang,
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

-- ---------- Admin: simpan potongan/komisi ----------
-- p_data = [{"id_karyawan": "...", "potongan": 0, "komisi": 0, "catatan": "..."}]
-- Baris yang sudah TERKIRIM dan isinya berubah otomatis dikirim ulang (versi naik,
-- notifikasi lama di HP terganti). Baris DISETUJUI/FINAL dilewati.
CREATE OR REPLACE FUNCTION fn_allowance_simpan(p_periode date, p_data jsonb) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_periode date := date_trunc('month', p_periode)::date;
  e jsonb; v_id uuid; v_pot bigint; v_kom bigint; v_cat text; v_nom bigint; a allowance;
  n_simpan int := 0; n_ulang int := 0; v_lewat text[] := '{}';
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_data, '[]'::jsonb)) LOOP
    v_id  := (e->>'id_karyawan')::uuid;
    v_pot := COALESCE((e->>'potongan')::bigint, 0);
    v_kom := COALESCE((e->>'komisi')::bigint, 0);
    v_cat := NULLIF(trim(e->>'catatan'), '');
    v_nom := fn_allowance_dasar(v_id);
    IF v_pot < 0 OR v_kom < 0 THEN RAISE EXCEPTION 'NOMINAL_MINUS'; END IF;
    IF v_nom - v_pot + v_kom < 0 THEN RAISE EXCEPTION 'TOTAL_MINUS'; END IF;

    SELECT * INTO a FROM allowance WHERE periode = v_periode AND id_karyawan = v_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO allowance (periode, id_karyawan, nominal, potongan, komisi, catatan)
      VALUES (v_periode, v_id, v_nom, v_pot, v_kom, v_cat);
      n_simpan := n_simpan + 1;
    ELSIF a.status IN ('DISETUJUI', 'FINAL') THEN
      v_lewat := v_lewat || v_id::text;
    ELSIF a.potongan IS DISTINCT FROM v_pot OR a.komisi IS DISTINCT FROM v_kom
          OR a.nominal IS DISTINCT FROM v_nom OR a.catatan IS DISTINCT FROM v_cat THEN
      UPDATE allowance SET nominal = v_nom, potongan = v_pot, komisi = v_kom, catatan = v_cat, diubah_at = now(),
        versi = CASE WHEN status = 'TERKIRIM' THEN versi + 1 ELSE versi END,
        dikirim_at = CASE WHEN status = 'TERKIRIM' THEN now() ELSE dikirim_at END,
        info = CASE WHEN status = 'TERKIRIM' THEN fn_allowance_info(v_id) ELSE info END
      WHERE id = a.id;
      IF a.status = 'TERKIRIM' THEN n_ulang := n_ulang + 1; ELSE n_simpan := n_simpan + 1; END IF;
    END IF;
  END LOOP;
  RETURN json_build_object('disimpan', n_simpan, 'dikirim_ulang', n_ulang, 'dilewati', to_json(v_lewat));
END $$;

-- ---------- Admin: proses (kirim ke HP karyawan) ----------
CREATE OR REPLACE FUNCTION fn_allowance_kirim(p_periode date, p_id_karyawan uuid[]) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_periode date := date_trunc('month', p_periode)::date;
  v_id uuid; a allowance; v_nom bigint; n int := 0; v_lewat text[] := '{}';
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  FOREACH v_id IN ARRAY COALESCE(p_id_karyawan, '{}') LOOP
    v_nom := fn_allowance_dasar(v_id);
    SELECT * INTO a FROM allowance WHERE periode = v_periode AND id_karyawan = v_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO allowance (periode, id_karyawan, nominal) VALUES (v_periode, v_id, v_nom) RETURNING * INTO a;
    END IF;
    IF a.status IN ('DISETUJUI', 'FINAL') THEN v_lewat := v_lewat || v_id::text; CONTINUE; END IF;
    IF v_nom - a.potongan + a.komisi < 0 THEN v_lewat := v_lewat || v_id::text; CONTINUE; END IF;
    UPDATE allowance SET status = 'TERKIRIM', nominal = v_nom, versi = versi + 1, dikirim_at = now(),
      diubah_at = now(), info = fn_allowance_info(v_id)
    WHERE id = a.id;
    n := n + 1;
  END LOOP;
  RETURN json_build_object('dikirim', n, 'dilewati', to_json(v_lewat));
END $$;

-- ---------- Admin: finalisasi (hanya yang sudah disetujui karyawan) ----------
CREATE OR REPLACE FUNCTION fn_allowance_final(p_periode date, p_id_karyawan uuid[]) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_periode date := date_trunc('month', p_periode)::date; n int;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  UPDATE allowance SET status = 'FINAL', final_at = now(), diubah_at = now()
  WHERE periode = v_periode AND id_karyawan = ANY(COALESCE(p_id_karyawan, '{}')) AND status = 'DISETUJUI';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN json_build_object('final', n);
END $$;

-- ---------- Admin: tanda tangan karyawan ----------
CREATE OR REPLACE FUNCTION fn_ttd_karyawan(p_id_karyawan uuid) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r json;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT json_build_object('ttd', ttd, 'diubah_at', ttd_diubah_at) INTO r FROM karyawan WHERE id = p_id_karyawan;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION fn_ttd_karyawan_simpan(p_id_karyawan uuid, p_ttd text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  IF NOT fn_ttd_valid(p_ttd) THEN RAISE EXCEPTION 'TTD_TIDAK_VALID'; END IF;
  UPDATE karyawan SET ttd = p_ttd, ttd_diubah_at = now() WHERE id = p_id_karyawan;
END $$;

-- ---------- HP karyawan: tanda tangan sendiri ----------
CREATE OR REPLACE FUNCTION fn_ttd_saya() RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid := fn_karyawan_sesi(); r json;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT json_build_object('ttd', ttd, 'diubah_at', ttd_diubah_at) INTO r FROM karyawan WHERE id = v_id;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION fn_ttd_saya_simpan(p_ttd text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid := fn_karyawan_sesi();
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  IF p_ttd IS NULL OR NOT fn_ttd_valid(p_ttd) THEN RAISE EXCEPTION 'TTD_TIDAK_VALID'; END IF;
  UPDATE karyawan SET ttd = p_ttd, ttd_diubah_at = now() WHERE id = v_id;
END $$;

-- ---------- HP karyawan: notifikasi allowance ----------
CREATE OR REPLACE FUNCTION fn_allowance_saya() RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid := fn_karyawan_sesi(); r json;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT COALESCE(json_agg(json_build_object(
           'id', a.id, 'periode', a.periode, 'nominal', a.nominal, 'potongan', a.potongan, 'komisi', a.komisi,
           'total', a.total, 'catatan', a.catatan, 'status', a.status, 'versi', a.versi, 'info', a.info,
           'dikirim_at', a.dikirim_at, 'disetujui_at', a.disetujui_at, 'final_at', a.final_at,
           'ttd', CASE WHEN a.status IN ('DISETUJUI', 'FINAL') THEN a.ttd END)
         ORDER BY a.periode DESC), '[]'::json)
  INTO r
  FROM allowance a
  WHERE a.id_karyawan = v_id AND a.status IN ('TERKIRIM', 'DISETUJUI', 'FINAL');
  RETURN r;
END $$;

-- Approve: tanda tangan karyawan otomatis menempel di slip.
-- p_versi mencegah menyetujui angka lama kalau admin baru saja mengubah & mengirim ulang.
CREATE OR REPLACE FUNCTION fn_allowance_setujui(p_id uuid, p_versi integer) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid := fn_karyawan_sesi(); a allowance; v_ttd text;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT * INTO a FROM allowance WHERE id = p_id AND id_karyawan = v_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLOWANCE_TIDAK_ADA'; END IF;
  IF a.status IN ('DISETUJUI', 'FINAL') THEN RAISE EXCEPTION 'SUDAH_DISETUJUI'; END IF;
  IF a.status <> 'TERKIRIM' THEN RAISE EXCEPTION 'ALLOWANCE_DITARIK'; END IF;
  IF a.versi <> p_versi THEN RAISE EXCEPTION 'VERSI_BERUBAH'; END IF;
  SELECT ttd INTO v_ttd FROM karyawan WHERE id = v_id;
  IF v_ttd IS NULL THEN RAISE EXCEPTION 'TTD_BELUM_ADA'; END IF;
  UPDATE allowance SET status = 'DISETUJUI', disetujui_at = now(), ttd = v_ttd, diubah_at = now()
  WHERE id = a.id RETURNING * INTO a;
  RETURN json_build_object('disetujui_at', a.disetujui_at);
END $$;

-- ---------------------------------------------------------------------
-- 5. Hak akses API
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    -- allowance_khusus bisa dibaca admin lewat tabel karyawan; ttd hanya lewat RPC
    GRANT SELECT (allowance_khusus) ON karyawan TO anon, authenticated;
    GRANT SELECT ON master_shift TO anon, authenticated;
    REVOKE ALL ON FUNCTION fn_ttd_valid(text), fn_allowance_dasar(uuid), fn_allowance_info(uuid) FROM public, anon, authenticated;
    GRANT EXECUTE ON FUNCTION
      fn_absen(text, integer), fn_sesi_karyawan(),
      fn_allowance_daftar(date), fn_allowance_simpan(date, jsonb), fn_allowance_kirim(date, uuid[]),
      fn_allowance_final(date, uuid[]), fn_ttd_karyawan(uuid), fn_ttd_karyawan_simpan(uuid, text),
      fn_ttd_saya(), fn_ttd_saya_simpan(text), fn_allowance_saya(), fn_allowance_setujui(uuid, integer)
      TO anon, authenticated;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
