-- =====================================================================
-- 1. NIP & username pakai awalan GIFX (contoh: GIFX260001 / gifx260001)
-- 2. Hapus data sampling (absen & izin sebelum 12-10-2026)
-- Jalankan sekali di Supabase SQL Editor.
-- =====================================================================
BEGIN;

-- ---------- 1a. Generator NIP untuk karyawan baru ----------
CREATE OR REPLACE FUNCTION fn_karyawan_generate_id() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nip IS NULL OR NEW.nip = '' THEN
    NEW.nip := 'GIFX' || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YY')
                      || lpad(nextval('seq_nip_karyawan')::text, 4, '0');
  END IF;
  IF NEW.username IS NULL OR NEW.username = '' THEN
    NEW.username := lower(NEW.nip);
  END IF;
  RETURN NEW;
END $$;

-- ---------- 1b. Karyawan yang sudah ada: KR260001 -> GIFX260001 ----------
-- Username ikut berubah hanya kalau masih username otomatis (= lower(NIP) lama).
UPDATE karyawan
SET username = CASE WHEN username = lower(nip) THEN lower('GIFX' || substr(nip, 3)) ELSE username END,
    nip      = 'GIFX' || substr(nip, 3)
WHERE nip ~ '^KR[0-9]{6}$';

-- ---------- 2a. Hapus data sampling ----------
-- Data asli dimulai 12-10-2026 (Excel). Semua absen & izin sebelum itu adalah sampling.
DELETE FROM absensi     WHERE tanggal < date '2026-10-12';
DELETE FROM izin_harian WHERE tanggal < date '2026-10-12';

-- ---------- 2b. Tanggal terdaftar dikembalikan ke awal data asli ----------
-- Saat import, tanggal terdaftar dimundurkan ke 12-04-2026 supaya sampling ikut rekap.
-- Tanpa ini, hari-hari sebelum 12-10 akan tampil sebagai Libur di Kehadiran.
UPDATE karyawan
SET created_at = timestamptz '2026-10-12 00:00+07'
WHERE created_at = timestamptz '2026-04-12 08:00+07';

COMMIT;
