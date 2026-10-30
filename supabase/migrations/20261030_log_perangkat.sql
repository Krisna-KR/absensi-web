-- Audit perangkat karyawan: login, terkunci di HP lain, dan Lepas HP oleh admin.
-- Berjalan di belakang: tidak perlu login ulang, sesi yang ada tetap jalan.

CREATE TABLE IF NOT EXISTS public.log_perangkat (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  waktu timestamptz NOT NULL DEFAULT now(),
  id_karyawan uuid REFERENCES public.karyawan(id) ON DELETE CASCADE,
  kejadian text NOT NULL CHECK (kejadian IN ('IKAT', 'MASUK', 'HP_LAIN', 'LEPAS_HP')),
  device_id text,           -- perangkat yang dipakai saat kejadian
  device_terkunci text,     -- perangkat yang sedang terikat ke akun (HP_LAIN / LEPAS_HP)
  user_agent text,
  ip text,
  oleh text                 -- username admin (LEPAS_HP)
);
CREATE INDEX IF NOT EXISTS ix_log_perangkat_karyawan ON public.log_perangkat (id_karyawan, waktu DESC);
CREATE INDEX IF NOT EXISTS ix_log_perangkat_waktu ON public.log_perangkat (waktu DESC);

ALTER TABLE public.log_perangkat ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_lihat ON public.log_perangkat FOR SELECT USING ((SELECT fn_admin_aktif()));
GRANT SELECT ON public.log_perangkat TO anon, authenticated;

-- IP pengirim request (Cloudflare / proxy)
CREATE OR REPLACE FUNCTION public.fn_ip_klien()
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT COALESCE(fn_header('cf-connecting-ip'), NULLIF(trim(split_part(COALESCE(fn_header('x-forwarded-for'), ''), ',', 1)), ''))
$$;

-- Login karyawan. HP_LAIN tidak lagi RAISE (supaya catatannya tersimpan): dikembalikan sebagai {galat:'HP_LAIN', ...}.
CREATE OR REPLACE FUNCTION public.fn_login_karyawan(p_username text, p_password text, p_device_id text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE k karyawan; v_token text; v_ikat timestamptz; v_ua text;
BEGIN
  SELECT * INTO k FROM karyawan WHERE lower(username) = lower(trim(p_username));
  IF NOT FOUND OR k.password IS NULL OR k.password <> crypt(p_password, k.password) THEN
    PERFORM pg_sleep(0.4);
    RAISE EXCEPTION 'LOGIN_SALAH';
  END IF;
  IF NOT k.is_aktif THEN RAISE EXCEPTION 'AKUN_NONAKTIF'; END IF;
  IF NOT k.is_approved THEN RAISE EXCEPTION 'BELUM_DISETUJUI'; END IF;
  IF p_device_id IS NULL OR length(p_device_id) < 8 THEN RAISE EXCEPTION 'DEVICE_KOSONG'; END IF;

  IF k.device_id IS NOT NULL AND k.device_id <> p_device_id THEN
    INSERT INTO log_perangkat (id_karyawan, kejadian, device_id, device_terkunci, user_agent, ip)
    VALUES (k.id, 'HP_LAIN', p_device_id, k.device_id, fn_header('user-agent'), fn_ip_klien());
    SELECT l.waktu, l.user_agent INTO v_ikat, v_ua FROM log_perangkat l
      WHERE l.id_karyawan = k.id AND l.kejadian = 'IKAT' AND l.device_id = k.device_id
      ORDER BY l.waktu DESC LIMIT 1;
    RETURN json_build_object('galat', 'HP_LAIN', 'terkunci_sejak', v_ikat, 'terkunci_ua', v_ua);
  END IF;

  IF k.device_id IS NULL THEN UPDATE karyawan SET device_id = p_device_id WHERE id = k.id; END IF;
  INSERT INTO log_perangkat (id_karyawan, kejadian, device_id, user_agent, ip)
  VALUES (k.id, CASE WHEN k.device_id IS NULL THEN 'IKAT' ELSE 'MASUK' END, p_device_id, fn_header('user-agent'), fn_ip_klien());

  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO sesi (token_hash, jenis, id_pengguna, device_id, kedaluwarsa)
  VALUES (fn_hash_token(v_token), 'karyawan', k.id, p_device_id, now() + interval '365 days');
  RETURN json_build_object('token', v_token,
    'karyawan', json_build_object('id', k.id, 'nama_lengkap', k.nama_lengkap, 'nip', k.nip, 'username', k.username));
END $$;

-- Lepas HP oleh admin tercatat otomatis
CREATE OR REPLACE FUNCTION public.fn_karyawan_log_perangkat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.device_id IS NOT NULL AND NEW.device_id IS NULL THEN
    INSERT INTO log_perangkat (id_karyawan, kejadian, device_terkunci, user_agent, ip, oleh)
    VALUES (NEW.id, 'LEPAS_HP', OLD.device_id, fn_header('user-agent'), fn_ip_klien(),
            (SELECT w.username FROM web_users w WHERE w.id = fn_admin_id()));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_karyawan_45_log_perangkat AFTER UPDATE OF device_id ON public.karyawan
  FOR EACH ROW EXECUTE FUNCTION public.fn_karyawan_log_perangkat();
REVOKE ALL ON FUNCTION public.fn_karyawan_log_perangkat() FROM PUBLIC, anon, authenticated;
