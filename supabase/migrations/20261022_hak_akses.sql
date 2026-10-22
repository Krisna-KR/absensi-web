-- =====================================================================
-- HAK AKSES PENGGUNA WEB (superadmin, peran, centang per user) + GANTI PASSWORD
-- Jalankan sekali di Supabase SQL Editor, di luar jam absen. Aman dijalankan ulang,
-- TAPI setiap kali dijalankan semua sesi web admin ikut logout (bagian 9).
-- Rollback: supabase/rollback/20261022_rollback_hak_akses.sql
--
-- Aturan:
--   * Superadmin: semua hak, tidak bisa diubah / dinonaktifkan / dihapus / di-reset orang lain.
--   * User biasa: hak = centang PERAN, lalu ditimpa centang KHUSUS USER (Izinkan / Tolak).
--     Centang khusus user selalu menang. Kosong (NULL) = ikut peran. Tidak ada keduanya = tidak boleh.
--   * Aksi: lihat (View), tambah (New), ubah (Edit), hapus (Delete).
--   * Reset password user lain -> 'admin123' + wajib ganti saat login. Password user lain tidak
--     bisa diisi bebas. Superadmin tidak bisa di-reset lewat aplikasi.
--   * Semua user web & karyawan HP bisa ganti password sendiri (wajib isi password lama).
--   * Baca data (SELECT) cukup login web yang aktif; tambah/ubah/hapus dicek per menu.
-- =====================================================================

-- ---------- 1. Tabel ----------
CREATE TABLE IF NOT EXISTS peran (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS peran_akses (
  id_peran uuid NOT NULL REFERENCES peran(id) ON DELETE CASCADE,
  menu text NOT NULL,
  lihat boolean NOT NULL DEFAULT false,
  tambah boolean NOT NULL DEFAULT false,
  ubah boolean NOT NULL DEFAULT false,
  hapus boolean NOT NULL DEFAULT false,
  PRIMARY KEY (id_peran, menu)
);

ALTER TABLE web_users ADD COLUMN IF NOT EXISTS nama text;
ALTER TABLE web_users ADD COLUMN IF NOT EXISTS is_aktif boolean NOT NULL DEFAULT true;
ALTER TABLE web_users ADD COLUMN IF NOT EXISTS is_superadmin boolean NOT NULL DEFAULT false;
ALTER TABLE web_users ADD COLUMN IF NOT EXISTS id_peran uuid REFERENCES peran(id) ON DELETE SET NULL;
ALTER TABLE web_users ADD COLUMN IF NOT EXISTS wajib_ganti_sandi boolean NOT NULL DEFAULT false;
ALTER TABLE web_users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- NULL = ikut peran, true = izinkan, false = tolak
CREATE TABLE IF NOT EXISTS web_user_akses (
  id_user uuid NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
  menu text NOT NULL,
  lihat boolean, tambah boolean, ubah boolean, hapus boolean,
  PRIMARY KEY (id_user, menu)
);

-- Semua tabel akses hanya lewat fungsi (RLS aktif tanpa policy)
ALTER TABLE peran ENABLE ROW LEVEL SECURITY;
ALTER TABLE peran_akses ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_user_akses ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_users ENABLE ROW LEVEL SECURITY;

-- Password web user selalu disimpan sebagai hash (sama seperti karyawan)
DROP TRIGGER IF EXISTS trg_web_users_hash_sandi ON web_users;
CREATE TRIGGER trg_web_users_hash_sandi BEFORE INSERT OR UPDATE OF password ON web_users
  FOR EACH ROW EXECUTE FUNCTION fn_hash_sandi();

-- Akun admin yang sekarang = superadmin
UPDATE web_users SET is_superadmin = true, role = 'superadmin', is_aktif = true WHERE username = 'admin';

-- ---------- 2. Daftar menu & aksi yang bisa dicentang ----------
CREATE OR REPLACE FUNCTION fn_menu_akses()
RETURNS TABLE (menu text, label text, aksi text[], urut int)
LANGUAGE sql IMMUTABLE AS $$
  VALUES
    ('dashboard', 'Dashboard',          ARRAY['lihat'],                          1),
    ('kehadiran', 'Kehadiran',          ARRAY['lihat'],                          2),
    ('karyawan',  'Karyawan',           ARRAY['lihat','tambah','ubah','hapus'],  3),
    ('rekap',     'Rekap & struktur',   ARRAY['lihat'],                          4),
    ('allowance', 'Allowance',          ARRAY['lihat','ubah'],                   5),
    ('master',    'Master data',        ARRAY['lihat','tambah','ubah','hapus'],  6),
    ('layar',     'Layar presensi',     ARRAY['lihat'],                          7),
    ('pengguna',  'Pengguna & hak akses', ARRAY['lihat','tambah','ubah','hapus'], 8)
$$;

-- ---------- 3. Sesi & hak akses ----------
CREATE OR REPLACE FUNCTION fn_admin_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
  SELECT w.id FROM sesi s JOIN web_users w ON w.id = s.id_pengguna
  WHERE s.jenis = 'admin' AND s.token_hash = fn_hash_token(fn_header('x-sesi-admin'))
    AND s.kedaluwarsa > now() AND w.is_aktif
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION fn_admin_aktif()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
  SELECT fn_admin_id() IS NOT NULL
$$;

-- Hak efektif satu user untuk satu menu & aksi
CREATE OR REPLACE FUNCTION fn_akses_user(p_id_user uuid, p_menu text, p_aksi text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((
    SELECT CASE WHEN w.is_superadmin THEN true
      WHEN NOT EXISTS (SELECT 1 FROM fn_menu_akses() m WHERE m.menu = p_menu AND p_aksi = ANY (m.aksi)) THEN false
      ELSE COALESCE(
        (SELECT CASE p_aksi WHEN 'lihat' THEN u.lihat WHEN 'tambah' THEN u.tambah WHEN 'ubah' THEN u.ubah WHEN 'hapus' THEN u.hapus END
           FROM web_user_akses u WHERE u.id_user = w.id AND u.menu = p_menu),
        (SELECT CASE p_aksi WHEN 'lihat' THEN a.lihat WHEN 'tambah' THEN a.tambah WHEN 'ubah' THEN a.ubah WHEN 'hapus' THEN a.hapus END
           FROM peran_akses a WHERE a.id_peran = w.id_peran AND a.menu = p_menu),
        false)
    END
    FROM web_users w WHERE w.id = p_id_user AND w.is_aktif), false)
$$;

CREATE OR REPLACE FUNCTION fn_admin_boleh(p_menu text, p_aksi text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
  SELECT COALESCE(fn_akses_user(fn_admin_id(), p_menu, p_aksi), false)
$$;

CREATE OR REPLACE FUNCTION fn_wajib_akses(p_menu text, p_aksi text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
BEGIN
  IF fn_admin_id() IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  IF NOT fn_admin_boleh(p_menu, p_aksi) THEN RAISE EXCEPTION 'TIDAK_BERHAK'; END IF;
END $$;

-- Peta hak efektif {menu: {lihat, tambah, ubah, hapus}} untuk satu user
CREATE OR REPLACE FUNCTION fn_akses_peta(p_id_user uuid)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(json_object_agg(m.menu, json_build_object(
    'lihat',  fn_akses_user(p_id_user, m.menu, 'lihat'),
    'tambah', fn_akses_user(p_id_user, m.menu, 'tambah'),
    'ubah',   fn_akses_user(p_id_user, m.menu, 'ubah'),
    'hapus',  fn_akses_user(p_id_user, m.menu, 'hapus'))), '{}'::json)
  FROM fn_menu_akses() m
$$;

CREATE OR REPLACE FUNCTION fn_admin_saya()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
  SELECT json_build_object(
    'id', w.id, 'username', w.username, 'nama', w.nama,
    'role', CASE WHEN w.is_superadmin THEN 'superadmin' ELSE COALESCE(p.nama, 'tanpa peran') END,
    'is_superadmin', w.is_superadmin, 'wajib_ganti_sandi', w.wajib_ganti_sandi,
    'akses', fn_akses_peta(w.id))
  FROM web_users w LEFT JOIN peran p ON p.id = w.id_peran
  WHERE w.id = fn_admin_id()
$$;

CREATE OR REPLACE FUNCTION fn_login_admin(p_username text, p_password text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE w web_users; v_token text;
BEGIN
  SELECT * INTO w FROM web_users WHERE lower(username) = lower(trim(p_username));
  IF NOT FOUND OR w.password <> crypt(p_password, w.password) THEN
    PERFORM pg_sleep(0.4);
    RAISE EXCEPTION 'LOGIN_SALAH';
  END IF;
  IF NOT w.is_aktif THEN RAISE EXCEPTION 'AKUN_NONAKTIF'; END IF;
  DELETE FROM sesi WHERE kedaluwarsa < now();
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO sesi (token_hash, jenis, id_pengguna, kedaluwarsa)
  VALUES (fn_hash_token(v_token), 'admin', w.id, now() + interval '7 days');
  RETURN json_build_object('token', v_token, 'username', w.username,
    'role', CASE WHEN w.is_superadmin THEN 'superadmin' ELSE w.role END,
    'wajib_ganti_sandi', w.wajib_ganti_sandi);
END $$;

-- ---------- 4. Ganti password sendiri ----------
CREATE OR REPLACE FUNCTION fn_admin_ganti_sandi(p_lama text, p_baru text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE v_id uuid := fn_admin_id(); w web_users;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT * INTO w FROM web_users WHERE id = v_id;
  IF w.password <> crypt(COALESCE(p_lama, ''), w.password) THEN PERFORM pg_sleep(0.4); RAISE EXCEPTION 'SANDI_LAMA_SALAH'; END IF;
  IF length(COALESCE(p_baru, '')) < 6 THEN RAISE EXCEPTION 'SANDI_PENDEK'; END IF;
  IF p_baru = p_lama THEN RAISE EXCEPTION 'SANDI_SAMA'; END IF;
  UPDATE web_users SET password = p_baru, wajib_ganti_sandi = false WHERE id = v_id;
  -- sesi lain milik user ini (browser lain) ikut keluar
  DELETE FROM sesi WHERE jenis = 'admin' AND id_pengguna = v_id
    AND token_hash <> fn_hash_token(fn_header('x-sesi-admin'));
END $$;

CREATE OR REPLACE FUNCTION fn_karyawan_ganti_sandi(p_lama text, p_baru text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE v_id uuid := fn_karyawan_sesi(); k karyawan; v_device text; v_token text;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT * INTO k FROM karyawan WHERE id = v_id;
  IF k.password IS NULL OR k.password <> crypt(COALESCE(p_lama, ''), k.password) THEN PERFORM pg_sleep(0.4); RAISE EXCEPTION 'SANDI_LAMA_SALAH'; END IF;
  IF length(COALESCE(p_baru, '')) < 6 THEN RAISE EXCEPTION 'SANDI_PENDEK'; END IF;
  IF p_baru = p_lama THEN RAISE EXCEPTION 'SANDI_SAMA'; END IF;
  SELECT device_id INTO v_device FROM sesi WHERE jenis = 'karyawan' AND token_hash = fn_hash_token(fn_header('x-sesi-karyawan'));
  -- Ganti password memutus semua sesi karyawan ini (trigger fn_karyawan_putus_sesi),
  -- jadi HP yang sedang dipakai diberi sesi baru supaya tidak perlu login ulang.
  UPDATE karyawan SET password = p_baru WHERE id = v_id;
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO sesi (token_hash, jenis, id_pengguna, device_id, kedaluwarsa)
  VALUES (fn_hash_token(v_token), 'karyawan', v_id, COALESCE(v_device, k.device_id), now() + interval '365 days');
  RETURN json_build_object('token', v_token);
END $$;

-- ---------- 5. Kelola pengguna & peran (menu "pengguna") ----------
CREATE OR REPLACE FUNCTION fn_pengguna_daftar()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
BEGIN
  PERFORM fn_wajib_akses('pengguna', 'lihat');
  RETURN json_build_object(
    'menu', (SELECT json_agg(json_build_object('menu', menu, 'label', label, 'aksi', aksi) ORDER BY urut) FROM fn_menu_akses()),
    'pengguna', COALESCE((SELECT json_agg(json_build_object(
        'id', w.id, 'username', w.username, 'nama', w.nama, 'is_superadmin', w.is_superadmin,
        'is_aktif', w.is_aktif, 'id_peran', w.id_peran, 'nama_peran', p.nama,
        'wajib_ganti_sandi', w.wajib_ganti_sandi, 'created_at', w.created_at,
        'akses', COALESCE((SELECT json_agg(json_build_object('menu', u.menu, 'lihat', u.lihat, 'tambah', u.tambah, 'ubah', u.ubah, 'hapus', u.hapus))
                           FROM web_user_akses u WHERE u.id_user = w.id), '[]'::json),
        'efektif', fn_akses_peta(w.id),
        'saya', w.id = fn_admin_id())
      ORDER BY w.is_superadmin DESC, lower(w.username))
      FROM web_users w LEFT JOIN peran p ON p.id = w.id_peran), '[]'::json),
    'peran', COALESCE((SELECT json_agg(json_build_object(
        'id', r.id, 'nama', r.nama,
        'jumlah_user', (SELECT count(*) FROM web_users w WHERE w.id_peran = r.id),
        'akses', COALESCE((SELECT json_agg(json_build_object('menu', a.menu, 'lihat', a.lihat, 'tambah', a.tambah, 'ubah', a.ubah, 'hapus', a.hapus))
                           FROM peran_akses a WHERE a.id_peran = r.id), '[]'::json))
      ORDER BY lower(r.nama)) FROM peran r), '[]'::json));
END $$;

-- p_akses: [{menu, lihat, tambah, ubah, hapus}] ; nilai null = ikut peran (untuk user) / false (untuk peran)
CREATE OR REPLACE FUNCTION fn_peran_simpan(p_id uuid, p_nama text, p_akses jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE v_id uuid := p_id; e jsonb; m record;
BEGIN
  PERFORM fn_wajib_akses('pengguna', CASE WHEN p_id IS NULL THEN 'tambah' ELSE 'ubah' END);
  IF length(trim(COALESCE(p_nama, ''))) < 2 THEN RAISE EXCEPTION 'NAMA_KOSONG'; END IF;
  IF EXISTS (SELECT 1 FROM peran WHERE lower(nama) = lower(trim(p_nama)) AND id IS DISTINCT FROM p_id) THEN RAISE EXCEPTION 'PERAN_DIPAKAI'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO peran (nama) VALUES (trim(p_nama)) RETURNING id INTO v_id;
  ELSE
    UPDATE peran SET nama = trim(p_nama) WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'DATA_TIDAK_ADA'; END IF;
  END IF;
  DELETE FROM peran_akses WHERE id_peran = v_id;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_akses, '[]'::jsonb)) LOOP
    SELECT * INTO m FROM fn_menu_akses() x WHERE x.menu = e->>'menu';
    IF NOT FOUND THEN CONTINUE; END IF;
    INSERT INTO peran_akses (id_peran, menu, lihat, tambah, ubah, hapus) VALUES (v_id, m.menu,
      'lihat' = ANY (m.aksi) AND COALESCE((e->>'lihat')::boolean, false),
      'tambah' = ANY (m.aksi) AND COALESCE((e->>'tambah')::boolean, false),
      'ubah' = ANY (m.aksi) AND COALESCE((e->>'ubah')::boolean, false),
      'hapus' = ANY (m.aksi) AND COALESCE((e->>'hapus')::boolean, false));
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION fn_peran_hapus(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
BEGIN
  PERFORM fn_wajib_akses('pengguna', 'hapus');
  DELETE FROM peran WHERE id = p_id;   -- user yang memakai peran ini jadi tanpa peran
END $$;

-- Tambah (p_id NULL) atau ubah user. User baru: password 'admin123' + wajib ganti saat login.
CREATE OR REPLACE FUNCTION fn_pengguna_simpan(p_id uuid, p_username text, p_nama text, p_id_peran uuid, p_is_aktif boolean, p_akses jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE v_id uuid := p_id; w web_users; e jsonb; m record; v_user text := lower(trim(COALESCE(p_username, '')));
  b_lihat boolean; b_tambah boolean; b_ubah boolean; b_hapus boolean;
BEGIN
  PERFORM fn_wajib_akses('pengguna', CASE WHEN p_id IS NULL THEN 'tambah' ELSE 'ubah' END);
  IF p_id_peran IS NOT NULL AND NOT EXISTS (SELECT 1 FROM peran WHERE id = p_id_peran) THEN RAISE EXCEPTION 'DATA_TIDAK_ADA'; END IF;

  IF v_id IS NULL THEN
    IF v_user !~ '^[a-z0-9._-]{3,30}$' THEN RAISE EXCEPTION 'USERNAME_TIDAK_VALID'; END IF;
    IF EXISTS (SELECT 1 FROM web_users WHERE lower(username) = v_user) THEN RAISE EXCEPTION 'USERNAME_DIPAKAI'; END IF;
    INSERT INTO web_users (username, password, role, nama, is_aktif, is_superadmin, id_peran, wajib_ganti_sandi)
    VALUES (v_user, 'admin123', 'pengguna', NULLIF(trim(COALESCE(p_nama, '')), ''), COALESCE(p_is_aktif, true), false, p_id_peran, true)
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO w FROM web_users WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'DATA_TIDAK_ADA'; END IF;
    IF w.is_superadmin THEN
      -- Superadmin: hak akses & status terkunci. Hanya nama, dan hanya oleh superadmin itu sendiri.
      IF v_id <> fn_admin_id() THEN RAISE EXCEPTION 'SUPERADMIN_TERKUNCI'; END IF;
      UPDATE web_users SET nama = NULLIF(trim(COALESCE(p_nama, '')), '') WHERE id = v_id;
      RETURN v_id;
    END IF;
    IF v_id = fn_admin_id() THEN
      -- Akun sendiri: hanya nama. Peran, hak akses, dan status tidak bisa diubah sendiri.
      UPDATE web_users SET nama = NULLIF(trim(COALESCE(p_nama, '')), '') WHERE id = v_id;
      RETURN v_id;
    END IF;
    UPDATE web_users SET nama = NULLIF(trim(COALESCE(p_nama, '')), ''), id_peran = p_id_peran,
      is_aktif = COALESCE(p_is_aktif, is_aktif), role = 'pengguna'
    WHERE id = v_id;
    IF p_is_aktif IS FALSE THEN DELETE FROM sesi WHERE jenis = 'admin' AND id_pengguna = v_id; END IF;
  END IF;

  DELETE FROM web_user_akses WHERE id_user = v_id;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_akses, '[]'::jsonb)) LOOP
    SELECT * INTO m FROM fn_menu_akses() x WHERE x.menu = e->>'menu';
    IF NOT FOUND THEN CONTINUE; END IF;
    b_lihat  := CASE WHEN 'lihat'  = ANY (m.aksi) THEN (e->>'lihat')::boolean END;
    b_tambah := CASE WHEN 'tambah' = ANY (m.aksi) THEN (e->>'tambah')::boolean END;
    b_ubah   := CASE WHEN 'ubah'   = ANY (m.aksi) THEN (e->>'ubah')::boolean END;
    b_hapus  := CASE WHEN 'hapus'  = ANY (m.aksi) THEN (e->>'hapus')::boolean END;
    IF b_lihat IS NULL AND b_tambah IS NULL AND b_ubah IS NULL AND b_hapus IS NULL THEN CONTINUE; END IF;
    INSERT INTO web_user_akses (id_user, menu, lihat, tambah, ubah, hapus) VALUES (v_id, m.menu, b_lihat, b_tambah, b_ubah, b_hapus);
  END LOOP;
  RETURN v_id;
END $$;

-- Reset password user lain ke 'admin123' (wajib ganti saat login). Tidak bisa untuk superadmin / diri sendiri.
CREATE OR REPLACE FUNCTION fn_pengguna_reset_sandi(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE w web_users;
BEGIN
  PERFORM fn_wajib_akses('pengguna', 'ubah');
  SELECT * INTO w FROM web_users WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DATA_TIDAK_ADA'; END IF;
  IF w.is_superadmin THEN RAISE EXCEPTION 'SUPERADMIN_TERKUNCI'; END IF;
  IF w.id = fn_admin_id() THEN RAISE EXCEPTION 'TIDAK_BISA_DIRI_SENDIRI'; END IF;
  UPDATE web_users SET password = 'admin123', wajib_ganti_sandi = true WHERE id = p_id;
  DELETE FROM sesi WHERE jenis = 'admin' AND id_pengguna = p_id;
END $$;

CREATE OR REPLACE FUNCTION fn_pengguna_hapus(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE w web_users;
BEGIN
  PERFORM fn_wajib_akses('pengguna', 'hapus');
  SELECT * INTO w FROM web_users WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF w.is_superadmin THEN RAISE EXCEPTION 'SUPERADMIN_TERKUNCI'; END IF;
  IF w.id = fn_admin_id() THEN RAISE EXCEPTION 'TIDAK_BISA_DIRI_SENDIRI'; END IF;
  DELETE FROM sesi WHERE jenis = 'admin' AND id_pengguna = p_id;
  DELETE FROM web_users WHERE id = p_id;
END $$;

-- ---------- 6. Fungsi admin yang sudah ada: tambah cek hak akses ----------
-- Disisipkan tepat setelah cek sesi; dilewati kalau sudah pernah disisipkan.
DO $$
DECLARE r record; v text; v_baru text;
  cek_sesi constant text := 'IF NOT fn_admin_aktif() THEN RAISE EXCEPTION ''SESI_HABIS''; END IF;';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('fn_allowance_daftar',    'allowance', 'lihat'),
      ('fn_allowance_simpan',    'allowance', 'ubah'),
      ('fn_qr_kiosk',            'layar',     'lihat'),
      ('fn_layar_scan',          'layar',     'lihat'),
      ('fn_layar_papan',         'layar',     'lihat'),
      ('fn_ttd_karyawan',        'karyawan',  'lihat'),
      ('fn_ttd_karyawan_simpan', 'karyawan',  'ubah')) x(fn, menu, aksi)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v IS NULL THEN RAISE EXCEPTION 'Fungsi % tidak ditemukan', r.fn; END IF;
    IF position('fn_wajib_akses' in v) > 0 THEN CONTINUE; END IF;
    IF position(cek_sesi in v) = 0 THEN RAISE EXCEPTION 'Cek sesi di % tidak ditemukan, sisipkan manual', r.fn; END IF;
    v_baru := replace(v, cek_sesi, cek_sesi || format(' PERFORM fn_wajib_akses(%L, %L);', r.menu, r.aksi));
    EXECUTE v_baru;
  END LOOP;
END $$;

-- ---------- 7. RLS per aksi ----------
-- Hapus policy publik yang membuka semua (temuan 21-10-2026)
DROP POLICY IF EXISTS "Allow public all absensi"     ON public.absensi;
DROP POLICY IF EXISTS "Allow public all karyawan"    ON public.karyawan;
DROP POLICY IF EXISTS "Allow public insert karyawan" ON public.karyawan;
DROP POLICY IF EXISTS "Allow public select karyawan" ON public.karyawan;
DROP POLICY IF EXISTS "Allow public update karyawan" ON public.karyawan;

DO $$
DECLARE t text; r record;
BEGIN
  -- tabel -> menu untuk tambah/ubah/hapus. Baca cukup login web aktif.
  FOR r IN SELECT * FROM (VALUES
      ('karyawan', 'karyawan'), ('absensi', 'karyawan'), ('izin_harian', 'karyawan'), ('riwayat_struktur', 'karyawan'),
      ('master_jabatan', 'master'), ('master_departemen', 'master'), ('master_lokasi', 'master'), ('master_libur', 'master'),
      ('master_shift', 'master'), ('master_tim', 'master'), ('relasi_departemen_lokasi', 'master'), ('relasi_karyawan_lokasi', 'master')) x(tabel, menu)
  LOOP
    t := r.tabel;
    EXECUTE format('DROP POLICY IF EXISTS admin_akses_penuh ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_lihat ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_tambah ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_ubah ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_hapus ON public.%I', t);
    EXECUTE format('CREATE POLICY admin_lihat ON public.%I FOR SELECT USING ((SELECT fn_admin_aktif()))', t);
    IF t = 'riwayat_struktur' THEN CONTINUE; END IF;   -- hanya diisi trigger
    IF t IN ('absensi', 'izin_harian') THEN
      -- input absen manual = hak Edit Karyawan; ganti jenis (hadir <-> izin) ikut menghapus baris lama
      EXECUTE format('CREATE POLICY admin_tambah ON public.%I FOR INSERT WITH CHECK ((SELECT fn_admin_boleh(''karyawan'', ''ubah'')))', t);
      EXECUTE format('CREATE POLICY admin_ubah ON public.%I FOR UPDATE USING ((SELECT fn_admin_boleh(''karyawan'', ''ubah''))) WITH CHECK ((SELECT fn_admin_boleh(''karyawan'', ''ubah'')))', t);
      EXECUTE format('CREATE POLICY admin_hapus ON public.%I FOR DELETE USING ((SELECT fn_admin_boleh(''karyawan'', ''ubah'')) OR (SELECT fn_admin_boleh(''karyawan'', ''hapus'')))', t);
      CONTINUE;
    END IF;
    EXECUTE format('CREATE POLICY admin_tambah ON public.%I FOR INSERT WITH CHECK ((SELECT fn_admin_boleh(%L, ''tambah'')))', t, r.menu);
    IF t = 'karyawan' THEN
      -- nonaktifkan / aktifkan karyawan = UPDATE is_aktif dengan hak Delete; dirinci di trigger fn_karyawan_cek_akses
      EXECUTE format('CREATE POLICY admin_ubah ON public.%I FOR UPDATE USING ((SELECT fn_admin_boleh(%L, ''ubah'')) OR (SELECT fn_admin_boleh(%L, ''hapus''))) WITH CHECK ((SELECT fn_admin_boleh(%L, ''ubah'')) OR (SELECT fn_admin_boleh(%L, ''hapus'')))', t, r.menu, r.menu, r.menu, r.menu);
    ELSE
      EXECUTE format('CREATE POLICY admin_ubah ON public.%I FOR UPDATE USING ((SELECT fn_admin_boleh(%L, ''ubah''))) WITH CHECK ((SELECT fn_admin_boleh(%L, ''ubah'')))', t, r.menu, r.menu);
    END IF;
    EXECUTE format('CREATE POLICY admin_hapus ON public.%I FOR DELETE USING ((SELECT fn_admin_boleh(%L, ''hapus'')))', t, r.menu);
  END LOOP;
END $$;

-- Ubah data karyawan langsung dari web: nonaktif/aktifkan = hak hapus, kolom lain = hak ubah.
-- Hanya berlaku untuk akses langsung dari aplikasi (role anon/authenticated), bukan fungsi sistem.
CREATE OR REPLACE FUNCTION fn_karyawan_cek_akses()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  IF NEW.is_aktif IS DISTINCT FROM OLD.is_aktif AND NOT fn_admin_boleh('karyawan', 'hapus') THEN
    RAISE EXCEPTION 'TIDAK_BERHAK';
  END IF;
  IF (to_jsonb(NEW) - 'is_aktif' - 'nonaktif_at') IS DISTINCT FROM (to_jsonb(OLD) - 'is_aktif' - 'nonaktif_at')
     AND NOT fn_admin_boleh('karyawan', 'ubah') THEN
    RAISE EXCEPTION 'TIDAK_BERHAK';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_karyawan_01_cek_akses ON karyawan;
CREATE TRIGGER trg_karyawan_01_cek_akses BEFORE UPDATE ON karyawan FOR EACH ROW EXECUTE FUNCTION fn_karyawan_cek_akses();

-- ---------- 8. Akun 'user' (viewer lama, tidak dipakai) dihapus ----------
DELETE FROM web_users WHERE username = 'user' AND NOT is_superadmin;

-- ---------- 9. Semua sesi web admin logout (sesi HP karyawan tetap) ----------
DELETE FROM sesi WHERE jenis = 'admin';

NOTIFY pgrst, 'reload schema';
