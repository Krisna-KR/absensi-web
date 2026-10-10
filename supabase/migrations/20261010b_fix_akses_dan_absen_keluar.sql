-- =====================================================================
-- Fix 1: akses tabel baru/izin_harian dari API (RLS dimatikan sementara,
--        konsisten dengan tabel lain di project ini)
-- Fix 2: boleh absen keluar tanpa absen masuk -> status Terlambat (Late)
-- Jalankan SEKALI di Supabase SQL Editor.
-- =====================================================================
BEGIN;

-- ---------- Fix 1 ----------
ALTER TABLE riwayat_struktur DISABLE ROW LEVEL SECURITY;
ALTER TABLE master_libur     DISABLE ROW LEVEL SECURITY;
ALTER TABLE izin_harian      DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON izin_harian, riwayat_struktur, master_libur TO anon, authenticated;
  END IF;
END $$;

-- ---------- Fix 2 ----------
ALTER TABLE absensi ALTER COLUMN waktu_masuk DROP NOT NULL;
ALTER TABLE absensi ALTER COLUMN waktu_masuk DROP DEFAULT;
ALTER TABLE absensi ADD CONSTRAINT ck_absensi_ada_jam
  CHECK (waktu_masuk IS NOT NULL OR waktu_keluar IS NOT NULL);

CREATE OR REPLACE FUNCTION fn_absensi_hitung() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_jam time;
BEGIN
  IF NEW.waktu_masuk IS NULL THEN
    -- Hanya absen keluar: tanggal dari jam keluar, dihitung Terlambat
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

COMMIT;

NOTIFY pgrst, 'reload schema';
