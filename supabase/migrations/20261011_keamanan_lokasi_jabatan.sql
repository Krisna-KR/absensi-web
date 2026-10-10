-- =====================================================================
-- Migrasi 3: keamanan sesi, nonaktif karyawan, lokasi, job role, aturan libur
-- Jalankan SEKALI di Supabase SQL Editor (setelah migrasi 1 dan 2).
--
-- Ringkasan:
--  1. Sandi karyawan & admin di-hash (bcrypt). Login web default: admin / admin123
--  2. Sesi token disimpan di tabel `sesi`. Aplikasi mengirim token lewat header
--     x-sesi-admin / x-sesi-karyawan. RLS hanya membuka tabel untuk sesi admin.
--  3. HP karyawan memakai fungsi RPC (login, absen, rekap sendiri, daftar).
--  4. QR kiosk ditandatangani server (HMAC) dan membawa lokasi.
--  5. Karyawan bisa dinonaktifkan: tidak tampil, tidak bisa login, sesi putus.
--  6. Master lokasi (Malang, Surabaya) dan master job role.
--  7. Libur = Sabtu/Minggu, atau hari kerja dengan absen kurang dari 3 orang.
-- =====================================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- =====================================================================
-- 1. LOKASI
-- =====================================================================
INSERT INTO master_lokasi (nama_cabang)
SELECT v.n FROM (VALUES ('Malang'), ('Surabaya')) v(n)
WHERE NOT EXISTS (SELECT 1 FROM master_lokasi l WHERE l.nama_cabang = v.n);
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_lokasi_nama ON master_lokasi (nama_cabang);

ALTER TABLE karyawan ADD COLUMN id_lokasi uuid REFERENCES master_lokasi(id) ON DELETE RESTRICT;
UPDATE karyawan SET id_lokasi = (SELECT id FROM master_lokasi WHERE nama_cabang = 'Malang') WHERE id_lokasi IS NULL;
ALTER TABLE karyawan ALTER COLUMN id_lokasi SET NOT NULL;

UPDATE absensi a SET id_lokasi = k.id_lokasi FROM karyawan k WHERE k.id = a.id_karyawan AND a.id_lokasi IS NULL;

-- =====================================================================
-- 2. JOB ROLE (master_jabatan). Departemen Marketing & Backoffice tetap dasar aturan.
--    Hanya job role Backoffice yang boleh ditandai "bisa jadi atasan".
-- =====================================================================
CREATE TABLE master_jabatan (
  nama             text PRIMARY KEY,
  id_departemen    uuid NOT NULL REFERENCES master_departemen(id) ON DELETE RESTRICT,
  bisa_jadi_atasan boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO master_jabatan (nama, id_departemen, bisa_jadi_atasan)
SELECT v.nama, d.id, v.atasan
FROM (VALUES ('Marketing', 'Marketing', false), ('Business Manager', 'Backoffice', true),
             ('IT', 'Backoffice', false), ('Admin', 'Backoffice', false)) v(nama, dept, atasan)
JOIN master_departemen d ON d.nama_departemen = v.dept;

-- Jabatan karyawan yang belum terdaftar -> default departemennya
UPDATE karyawan k SET jabatan = CASE d.nama_departemen WHEN 'Marketing' THEN 'Marketing' ELSE 'Business Manager' END
FROM master_departemen d
WHERE d.id = k.id_departemen AND (k.jabatan IS NULL OR k.jabatan NOT IN (SELECT nama FROM master_jabatan));

ALTER TABLE karyawan ADD CONSTRAINT fk_karyawan_jabatan
  FOREIGN KEY (jabatan) REFERENCES master_jabatan(nama) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION fn_jabatan_validasi() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dept text; v_n int;
BEGIN
  SELECT nama_departemen INTO v_dept FROM master_departemen WHERE id = NEW.id_departemen;
  IF NEW.bisa_jadi_atasan AND v_dept IS DISTINCT FROM 'Backoffice' THEN
    RAISE EXCEPTION 'Hanya job role Backoffice yang bisa jadi atasan.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id_departemen <> OLD.id_departemen AND EXISTS (SELECT 1 FROM karyawan WHERE jabatan = OLD.nama) THEN
      RAISE EXCEPTION 'Departemen job role yang sudah dipakai karyawan tidak bisa diganti.';
    END IF;
    IF OLD.bisa_jadi_atasan AND NOT NEW.bisa_jadi_atasan THEN
      SELECT count(*) INTO v_n FROM karyawan b JOIN karyawan a ON a.id = b.id_atasan WHERE a.jabatan = OLD.nama;
      IF v_n > 0 THEN
        RAISE EXCEPTION 'Masih ada % Marketing di bawah job role ini. Pindahkan dulu ke atasan lain.', v_n;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_jabatan_validasi BEFORE INSERT OR UPDATE ON master_jabatan
FOR EACH ROW EXECUTE FUNCTION fn_jabatan_validasi();

-- =====================================================================
-- 3. NONAKTIF KARYAWAN
-- =====================================================================
ALTER TABLE karyawan ADD COLUMN is_aktif boolean NOT NULL DEFAULT true;
ALTER TABLE karyawan ADD COLUMN nonaktif_at timestamptz;

-- =====================================================================
-- 4. VALIDASI STRUKTUR (versi baru: berbasis master_jabatan)
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_karyawan_validasi_struktur() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dept text; v_jabatan_dept text; v_atasan_ok boolean; v_bawahan int;
BEGIN
  -- Tanggal nonaktif
  IF NEW.is_aktif IS FALSE AND (TG_OP = 'INSERT' OR OLD.is_aktif IS TRUE) THEN NEW.nonaktif_at := now(); END IF;
  IF NEW.is_aktif IS TRUE THEN NEW.nonaktif_at := NULL; END IF;

  -- Atasan aktif tidak boleh dinonaktifkan / diganti jabatannya selama masih punya bawahan
  IF TG_OP = 'UPDATE' THEN
    SELECT count(*) INTO v_bawahan FROM karyawan WHERE id_atasan = NEW.id AND is_aktif;
    IF v_bawahan > 0 AND (NEW.is_aktif IS FALSE OR NEW.id_departemen IS DISTINCT FROM OLD.id_departemen
                          OR NOT EXISTS (SELECT 1 FROM master_jabatan WHERE nama = NEW.jabatan AND bisa_jadi_atasan)) THEN
      RAISE EXCEPTION 'Masih membawahi % Marketing. Transfer bawahan ke Business Manager lain terlebih dahulu.', v_bawahan;
    END IF;
  END IF;

  -- Karyawan nonaktif tidak divalidasi strukturnya
  IF NEW.is_aktif IS FALSE THEN RETURN NEW; END IF;

  SELECT nama_departemen INTO v_dept FROM master_departemen WHERE id = NEW.id_departemen;
  IF NEW.jabatan IS NULL AND v_dept = 'Marketing' THEN NEW.jabatan := 'Marketing'; END IF;

  SELECT d.nama_departemen INTO v_jabatan_dept
  FROM master_jabatan j JOIN master_departemen d ON d.id = j.id_departemen WHERE j.nama = NEW.jabatan;
  IF v_dept IS NOT NULL AND v_jabatan_dept IS DISTINCT FROM v_dept THEN
    RAISE EXCEPTION 'Job role % bukan milik departemen %.', COALESCE(NEW.jabatan, '(kosong)'), v_dept;
  END IF;

  IF v_dept = 'Marketing' THEN
    IF NEW.id_atasan IS NULL THEN
      RAISE EXCEPTION 'Marketing wajib memiliki 1 atasan Business Manager.';
    END IF;
    SELECT (d.nama_departemen = 'Backoffice' AND j.bisa_jadi_atasan AND a.is_aktif) INTO v_atasan_ok
    FROM karyawan a
    JOIN master_departemen d ON d.id = a.id_departemen
    JOIN master_jabatan j ON j.nama = a.jabatan
    WHERE a.id = NEW.id_atasan;
    IF v_atasan_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'Atasan Marketing harus karyawan Backoffice aktif yang job role-nya bisa jadi atasan.';
    END IF;
  ELSIF v_dept = 'Backoffice' THEN
    NEW.id_atasan := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER trg_karyawan_20_validasi_struktur ON karyawan;
CREATE TRIGGER trg_karyawan_20_validasi_struktur
BEFORE INSERT OR UPDATE OF id_departemen, jabatan, id_atasan, is_aktif ON karyawan
FOR EACH ROW EXECUTE FUNCTION fn_karyawan_validasi_struktur();

-- Trigger lain dijalankan sebagai pemilik agar tidak bergantung hak akses anon
ALTER FUNCTION fn_karyawan_generate_id() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION fn_karyawan_log_struktur() SECURITY DEFINER SET search_path = public;

-- =====================================================================
-- 5. SANDI DI-HASH (bcrypt) untuk karyawan & admin web
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_hash_sandi() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.password IS NOT NULL AND NEW.password !~ '^\$2[abxy]\$' THEN
    NEW.password := crypt(NEW.password, gen_salt('bf', 8));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_karyawan_05_hash_sandi BEFORE INSERT OR UPDATE OF password ON karyawan
FOR EACH ROW EXECUTE FUNCTION fn_hash_sandi();
CREATE TRIGGER trg_web_users_hash_sandi BEFORE INSERT OR UPDATE OF password ON web_users
FOR EACH ROW EXECUTE FUNCTION fn_hash_sandi();

UPDATE karyawan  SET password = password WHERE password IS NOT NULL AND password !~ '^\$2[abxy]\$';
UPDATE web_users SET password = password WHERE password !~ '^\$2[abxy]\$';

CREATE UNIQUE INDEX IF NOT EXISTS uq_web_users_username ON web_users (lower(username));
INSERT INTO web_users (username, password, role)
SELECT 'admin', 'admin123', 'superadmin'
WHERE NOT EXISTS (SELECT 1 FROM web_users WHERE lower(username) = 'admin');

-- =====================================================================
-- 6. SESI & RAHASIA SERVER
-- =====================================================================
CREATE TABLE sesi (
  token_hash   text PRIMARY KEY,
  jenis        text NOT NULL CHECK (jenis IN ('admin', 'karyawan')),
  id_pengguna  uuid NOT NULL,
  device_id    text,
  dibuat_at    timestamptz NOT NULL DEFAULT now(),
  kedaluwarsa  timestamptz NOT NULL
);
CREATE INDEX ix_sesi_pengguna ON sesi (jenis, id_pengguna);

CREATE TABLE rahasia_server (kunci text PRIMARY KEY, nilai text NOT NULL);
INSERT INTO rahasia_server VALUES ('qr_hmac', encode(extensions.gen_random_bytes(32), 'hex'));

CREATE OR REPLACE FUNCTION fn_header(p_nama text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.headers', true), '')::json ->> p_nama
$$;

CREATE OR REPLACE FUNCTION fn_hash_token(p_token text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT encode(digest(p_token, 'sha256'), 'hex')
$$;

CREATE OR REPLACE FUNCTION fn_admin_aktif() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (
    SELECT 1 FROM sesi s JOIN web_users w ON w.id = s.id_pengguna
    WHERE s.jenis = 'admin' AND s.token_hash = fn_hash_token(fn_header('x-sesi-admin')) AND s.kedaluwarsa > now()
  )
$$;

CREATE OR REPLACE FUNCTION fn_karyawan_sesi() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT k.id FROM sesi s JOIN karyawan k ON k.id = s.id_pengguna
  WHERE s.jenis = 'karyawan' AND s.token_hash = fn_hash_token(fn_header('x-sesi-karyawan'))
    AND s.kedaluwarsa > now() AND k.is_aktif AND k.is_approved
  LIMIT 1
$$;

-- Sesi karyawan putus saat: HP dilepas admin, dinonaktifkan, atau sandi diganti
CREATE OR REPLACE FUNCTION fn_karyawan_putus_sesi() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (OLD.device_id IS NOT NULL AND NEW.device_id IS DISTINCT FROM OLD.device_id)
     OR (NEW.is_aktif IS FALSE AND OLD.is_aktif IS TRUE)
     OR (NEW.password IS DISTINCT FROM OLD.password) THEN
    DELETE FROM sesi WHERE jenis = 'karyawan' AND id_pengguna = NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_karyawan_40_putus_sesi AFTER UPDATE OF device_id, is_aktif, password ON karyawan
FOR EACH ROW EXECUTE FUNCTION fn_karyawan_putus_sesi();

-- =====================================================================
-- 7. RPC: LOGIN / LOGOUT
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_login_admin(p_username text, p_password text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE w web_users; v_token text;
BEGIN
  SELECT * INTO w FROM web_users WHERE lower(username) = lower(trim(p_username));
  IF NOT FOUND OR w.password <> crypt(p_password, w.password) THEN
    PERFORM pg_sleep(0.4);
    RAISE EXCEPTION 'LOGIN_SALAH';
  END IF;
  DELETE FROM sesi WHERE kedaluwarsa < now();
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO sesi (token_hash, jenis, id_pengguna, kedaluwarsa)
  VALUES (fn_hash_token(v_token), 'admin', w.id, now() + interval '7 days');
  RETURN json_build_object('token', v_token, 'username', w.username, 'role', w.role);
END $$;

CREATE OR REPLACE FUNCTION fn_admin_saya() RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT json_build_object('username', w.username, 'role', w.role)
  FROM sesi s JOIN web_users w ON w.id = s.id_pengguna
  WHERE s.jenis = 'admin' AND s.token_hash = fn_hash_token(fn_header('x-sesi-admin')) AND s.kedaluwarsa > now()
$$;

CREATE OR REPLACE FUNCTION fn_logout(p_jenis text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  DELETE FROM sesi
  WHERE jenis = p_jenis
    AND token_hash = fn_hash_token(fn_header(CASE p_jenis WHEN 'admin' THEN 'x-sesi-admin' ELSE 'x-sesi-karyawan' END))
$$;

CREATE OR REPLACE FUNCTION fn_login_karyawan(p_username text, p_password text, p_device_id text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE k karyawan; v_token text;
BEGIN
  SELECT * INTO k FROM karyawan WHERE lower(username) = lower(trim(p_username));
  IF NOT FOUND OR k.password IS NULL OR k.password <> crypt(p_password, k.password) THEN
    PERFORM pg_sleep(0.4);
    RAISE EXCEPTION 'LOGIN_SALAH';
  END IF;
  IF NOT k.is_aktif THEN RAISE EXCEPTION 'AKUN_NONAKTIF'; END IF;
  IF NOT k.is_approved THEN RAISE EXCEPTION 'BELUM_DISETUJUI'; END IF;
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN RAISE EXCEPTION 'DEVICE_KOSONG'; END IF;
  IF k.device_id IS NOT NULL AND k.device_id <> p_device_id THEN RAISE EXCEPTION 'HP_LAIN'; END IF;
  IF k.device_id IS NULL THEN UPDATE karyawan SET device_id = p_device_id WHERE id = k.id; END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO sesi (token_hash, jenis, id_pengguna, device_id, kedaluwarsa)
  VALUES (fn_hash_token(v_token), 'karyawan', k.id, p_device_id, now() + interval '365 days');
  RETURN json_build_object('token', v_token,
    'karyawan', json_build_object('id', k.id, 'nama_lengkap', k.nama_lengkap, 'nip', k.nip, 'username', k.username));
END $$;

CREATE OR REPLACE FUNCTION fn_sesi_karyawan() RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid := fn_karyawan_sesi(); r json;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT json_build_object('id', id, 'nama_lengkap', nama_lengkap, 'nip', nip, 'username', username) INTO r
  FROM karyawan WHERE id = v_id;
  RETURN r;
END $$;

-- =====================================================================
-- 8. RPC: PENDAFTARAN DARI HP
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_opsi_registrasi() RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'atasan', COALESCE((SELECT json_agg(json_build_object('id', a.id, 'nama_lengkap', a.nama_lengkap) ORDER BY a.nama_lengkap)
               FROM karyawan a JOIN master_jabatan j ON j.nama = a.jabatan
               WHERE j.bisa_jadi_atasan AND a.is_aktif AND a.is_approved), '[]'::json),
    'jabatan', COALESCE((SELECT json_agg(json_build_object('nama', j.nama, 'departemen', d.nama_departemen) ORDER BY j.nama)
               FROM master_jabatan j JOIN master_departemen d ON d.id = j.id_departemen), '[]'::json),
    'lokasi', COALESCE((SELECT json_agg(json_build_object('id', l.id, 'nama', l.nama_cabang) ORDER BY l.nama_cabang)
               FROM master_lokasi l), '[]'::json)
  )
$$;

CREATE OR REPLACE FUNCTION fn_register_karyawan(p_nama text, p_departemen text, p_jabatan text, p_id_atasan uuid, p_id_lokasi uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_username text;
BEGIN
  IF length(trim(COALESCE(p_nama, ''))) < 2 THEN RAISE EXCEPTION 'NAMA_KOSONG'; END IF;
  INSERT INTO karyawan (nama_lengkap, id_departemen, jabatan, id_atasan, id_lokasi, password, role, is_approved)
  VALUES (trim(p_nama), (SELECT id FROM master_departemen WHERE nama_departemen = p_departemen),
          p_jabatan, CASE WHEN p_departemen = 'Marketing' THEN p_id_atasan END, p_id_lokasi,
          'admin123', 'Karyawan', true)
  RETURNING username INTO v_username;
  RETURN json_build_object('username', v_username);
END $$;

-- =====================================================================
-- 9. QR KIOSK BERTANDA TANGAN & RPC ABSEN
--    Format QR: ABSENSI-KR.<id_lokasi>.<epoch_ms>.<hmac>
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_qr_kiosk(p_id_lokasi uuid) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_ms text; v_lokasi text;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT nama_cabang INTO v_lokasi FROM master_lokasi WHERE id = p_id_lokasi;
  IF v_lokasi IS NULL THEN RAISE EXCEPTION 'LOKASI_TIDAK_ADA'; END IF;
  v_ms := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint::text;
  RETURN json_build_object(
    'qr', 'ABSENSI-KR.' || p_id_lokasi || '.' || v_ms || '.' ||
          encode(hmac(p_id_lokasi || '.' || v_ms, (SELECT nilai FROM rahasia_server WHERE kunci = 'qr_hmac'), 'sha256'), 'hex'),
    'lokasi', v_lokasi);
END $$;

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
    RETURN json_build_object('jenis', 'MASUK', 'waktu', a.waktu_masuk, 'status', a.status, 'telat_menit', a.durasi_telat_menit);
  END IF;

  IF FOUND AND a.waktu_keluar IS NOT NULL THEN RAISE EXCEPTION 'SUDAH_PULANG'; END IF;
  IF FOUND THEN
    UPDATE absensi SET waktu_keluar = v_now WHERE id = a.id RETURNING * INTO a;
    RETURN json_build_object('jenis', 'KELUAR', 'waktu', a.waktu_keluar, 'tanpa_masuk', false);
  END IF;
  INSERT INTO absensi (id_karyawan, waktu_masuk, waktu_keluar, id_lokasi) VALUES (v_id, NULL, v_now, v_lokasi) RETURNING * INTO a;
  RETURN json_build_object('jenis', 'KELUAR', 'waktu', a.waktu_keluar, 'tanpa_masuk', true);
END $$;

-- Lokasi absensi default = lokasi karyawan (untuk input manual admin)
CREATE OR REPLACE FUNCTION fn_absensi_hitung() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_jam time;
BEGIN
  IF NEW.id_lokasi IS NULL THEN
    SELECT id_lokasi INTO NEW.id_lokasi FROM karyawan WHERE id = NEW.id_karyawan;
  END IF;
  IF NEW.waktu_masuk IS NULL THEN
    NEW.tanggal := (NEW.waktu_keluar AT TIME ZONE 'Asia/Jakarta')::date;
    NEW.status := 'Late';
    NEW.durasi_telat_menit := NULL;
  ELSE
    NEW.tanggal := (NEW.waktu_masuk AT TIME ZONE 'Asia/Jakarta')::date;
    v_jam := (NEW.waktu_masuk AT TIME ZONE 'Asia/Jakarta')::time;
    IF v_jam >= time '08:01' THEN
      NEW.status := 'Late';
      NEW.durasi_telat_menit := floor(extract(epoch FROM (v_jam - time '08:00')) / 60)::int;
    ELSE
      NEW.status := 'Hadir';
      NEW.durasi_telat_menit := 0;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- =====================================================================
-- 10. FUNGSI REKAP (versi baru)
--     - hanya karyawan aktif
--     - libur: Sabtu/Minggu, atau hari kerja dengan absen < 3 orang
--     - master_libur tidak dipakai lagi
-- =====================================================================
DROP FUNCTION fn_kehadiran(date, date, uuid);
CREATE FUNCTION fn_kehadiran(p_mulai date, p_sampai date, p_id_karyawan uuid DEFAULT NULL)
RETURNS TABLE (
  tanggal date, id_karyawan uuid, nama_lengkap text, nip text, jabatan text, nama_departemen text,
  id_atasan uuid, nama_atasan text, nama_lokasi text, id_absensi uuid, waktu_masuk timestamptz,
  waktu_keluar timestamptz, durasi_telat_menit integer, status text, keterangan text
)
LANGUAGE sql STABLE AS $$
  WITH sekarang AS (
    SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS hari_ini,
           (now() AT TIME ZONE 'Asia/Jakarta')::time AS jam_ini
  ),
  hari AS (
    SELECT d::date AS tanggal
    FROM sekarang s, generate_series(p_mulai, LEAST(p_sampai, s.hari_ini), interval '1 day') d
  ),
  jumlah AS (
    SELECT a.tanggal, count(*) AS n FROM absensi a
    WHERE a.tanggal BETWEEN p_mulai AND p_sampai GROUP BY a.tanggal
  )
  SELECT
    h.tanggal, k.id, k.nama_lengkap, k.nip, k.jabatan, md.nama_departemen,
    k.id_atasan, atasan.nama_lengkap, lk.nama_cabang,
    a.id, a.waktu_masuk, a.waktu_keluar, a.durasi_telat_menit,
    CASE
      WHEN a.id IS NOT NULL THEN a.status
      WHEN i.id IS NOT NULL THEN i.jenis
      WHEN extract(isodow FROM h.tanggal) IN (6, 7) THEN 'Libur'
      WHEN h.tanggal = s.hari_ini AND s.jam_ini < time '12:00' THEN 'Belum Absen'
      WHEN COALESCE(j.n, 0) < 3 THEN 'Libur'
      ELSE 'Bolos'
    END,
    CASE
      WHEN a.id IS NOT NULL THEN a.keterangan
      WHEN i.id IS NOT NULL THEN i.keterangan
      WHEN extract(isodow FROM h.tanggal) IN (6, 7) THEN 'Akhir pekan'
      WHEN h.tanggal = s.hari_ini AND s.jam_ini < time '12:00' THEN NULL
      WHEN COALESCE(j.n, 0) < 3 THEN 'Kurang dari 3 orang absen'
      ELSE NULL
    END
  FROM hari h
  CROSS JOIN sekarang s
  JOIN karyawan k ON k.is_approved IS TRUE AND k.is_aktif IS TRUE
  LEFT JOIN master_departemen md ON md.id = k.id_departemen
  LEFT JOIN karyawan atasan      ON atasan.id = k.id_atasan
  LEFT JOIN master_lokasi lk     ON lk.id = k.id_lokasi
  LEFT JOIN absensi a            ON a.id_karyawan = k.id AND a.tanggal = h.tanggal
  LEFT JOIN izin_harian i        ON i.id_karyawan = k.id AND i.tanggal = h.tanggal
                                AND COALESCE(i.status_approval, 'Pending') <> 'Ditolak'
  LEFT JOIN jumlah j             ON j.tanggal = h.tanggal
  WHERE (p_id_karyawan IS NULL OR k.id = p_id_karyawan)
    AND (a.id IS NOT NULL OR h.tanggal >= (COALESCE(k.created_at, now()) AT TIME ZONE 'Asia/Jakarta')::date)
  ORDER BY h.tanggal DESC, k.nama_lengkap;
$$;

-- Rekap milik karyawan yang login di HP
CREATE FUNCTION fn_kehadiran_saya(p_mulai date, p_sampai date)
RETURNS TABLE (
  tanggal date, id_karyawan uuid, nama_lengkap text, nip text, jabatan text, nama_departemen text,
  id_atasan uuid, nama_atasan text, nama_lokasi text, id_absensi uuid, waktu_masuk timestamptz,
  waktu_keluar timestamptz, durasi_telat_menit integer, status text, keterangan text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid := fn_karyawan_sesi();
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  RETURN QUERY SELECT * FROM fn_kehadiran(p_mulai, p_sampai, v_id);
END $$;

-- =====================================================================
-- 11. ROW LEVEL SECURITY: tabel hanya terbuka untuk sesi admin
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['karyawan', 'absensi', 'izin_harian', 'master_departemen', 'master_jabatan',
                           'master_lokasi', 'master_tim', 'master_libur', 'riwayat_struktur',
                           'relasi_departemen_lokasi', 'relasi_karyawan_lokasi'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_akses_penuh ON %I', t);
    EXECUTE format('CREATE POLICY admin_akses_penuh ON %I FOR ALL USING ((SELECT fn_admin_aktif())) WITH CHECK ((SELECT fn_admin_aktif()))', t);
  END LOOP;
  -- Tabel rahasia: RLS aktif tanpa policy = tertutup untuk API
  FOREACH t IN ARRAY ARRAY['web_users', 'sesi', 'rahasia_server'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Hak akses API (role anon/authenticated milik Supabase)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON web_users, sesi, rahasia_server FROM anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON master_jabatan TO anon, authenticated;
    -- Kolom password tidak bisa dibaca lewat API
    REVOKE SELECT ON karyawan FROM anon, authenticated;
    GRANT SELECT (id, id_auth, nip, nama_lengkap, email, role, id_departemen, id_tim, created_at, jabatan,
                  device_id, username, is_approved, id_atasan, id_lokasi, is_aktif, nonaktif_at)
      ON karyawan TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION fn_login_admin(text, text), fn_admin_saya(), fn_logout(text),
      fn_login_karyawan(text, text, text), fn_sesi_karyawan(), fn_opsi_registrasi(),
      fn_register_karyawan(text, text, text, uuid, uuid), fn_qr_kiosk(uuid), fn_absen(text),
      fn_kehadiran(date, date, uuid), fn_kehadiran_saya(date, date)
      TO anon, authenticated;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Kolom/tabel yang tidak dipakai lagi (TIDAK dijalankan otomatis, DROP = permanen):
-- DROP TABLE master_libur;
-- ALTER TABLE master_departemen DROP COLUMN id_leader;
