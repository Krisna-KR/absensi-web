-- =====================================================================
-- ROLLBACK untuk 20261022_hak_akses.sql
-- Mengembalikan pengecekan akses ke cara lama: semua user web yang login = akses penuh.
-- Yang TIDAK dikembalikan (sengaja):
--   * policy publik "Allow public ..." (pakai rollback 20261021c kalau benar-benar perlu)
--   * akun 'user' yang sudah dihapus, dan sesi yang sudah di-logout
--   * tabel peran / peran_akses / web_user_akses & kolom baru web_users (dibiarkan, tidak dipakai)
-- Jalankan di SQL Editor, lalu deploy ulang versi aplikasi sebelum fitur hak akses.
-- =====================================================================
BEGIN;

-- 1. Fungsi sesi admin versi lama
CREATE OR REPLACE FUNCTION fn_admin_aktif()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
  SELECT EXISTS (
    SELECT 1 FROM sesi s JOIN web_users w ON w.id = s.id_pengguna
    WHERE s.jenis = 'admin' AND s.token_hash = fn_hash_token(fn_header('x-sesi-admin')) AND s.kedaluwarsa > now()
  )
$$;

CREATE OR REPLACE FUNCTION fn_admin_saya()
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
  SELECT json_build_object('username', w.username, 'role', w.role)
  FROM sesi s JOIN web_users w ON w.id = s.id_pengguna
  WHERE s.jenis = 'admin' AND s.token_hash = fn_hash_token(fn_header('x-sesi-admin')) AND s.kedaluwarsa > now()
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
  DELETE FROM sesi WHERE kedaluwarsa < now();
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO sesi (token_hash, jenis, id_pengguna, kedaluwarsa)
  VALUES (fn_hash_token(v_token), 'admin', w.id, now() + interval '7 days');
  RETURN json_build_object('token', v_token, 'username', w.username, 'role', w.role);
END $$;

-- 2. Cabut cek hak akses yang disisipkan ke fungsi admin
DO $$
DECLARE r record; v text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prosrc LIKE '%PERFORM fn_wajib_akses(%'
             AND p.proname IN ('fn_allowance_daftar','fn_allowance_simpan','fn_qr_kiosk','fn_layar_scan','fn_layar_papan','fn_ttd_karyawan','fn_ttd_karyawan_simpan')
  LOOP
    v := regexp_replace(pg_get_functiondef(r.oid), ' PERFORM fn_wajib_akses\([^)]*\);', '', 'g');
    EXECUTE v;
  END LOOP;
END $$;

-- 3. RLS kembali ke satu policy "admin_akses_penuh" per tabel
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['karyawan','absensi','izin_harian','riwayat_struktur','master_jabatan','master_departemen',
                           'master_lokasi','master_libur','master_shift','master_tim','relasi_departemen_lokasi','relasi_karyawan_lokasi']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_lihat ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_tambah ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_ubah ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_hapus ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_akses_penuh ON public.%I', t);
    EXECUTE format('CREATE POLICY admin_akses_penuh ON public.%I FOR ALL USING ((SELECT fn_admin_aktif())) WITH CHECK ((SELECT fn_admin_aktif()))', t);
  END LOOP;
END $$;

-- 4. Trigger cek akses karyawan dilepas
DROP TRIGGER IF EXISTS trg_karyawan_01_cek_akses ON karyawan;
DROP FUNCTION IF EXISTS fn_karyawan_cek_akses();

COMMIT;
NOTIFY pgrst, 'reload schema';
