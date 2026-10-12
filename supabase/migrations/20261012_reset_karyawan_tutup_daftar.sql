-- =====================================================================
-- Migrasi 4: kosongkan data karyawan (persiapan data asli) + tutup
-- pendaftaran mandiri dari HP.
--
-- YANG DIHAPUS PERMANEN (tidak bisa dikembalikan):
--   semua karyawan (termasuk 20 karyawan demo), semua absensi, izin/sakit/cuti,
--   riwayat struktur, relasi karyawan-lokasi, dan sesi login HP.
-- YANG TETAP: akun admin web (web_users), sesi admin, lokasi, departemen,
--   job role, rahasia QR.
-- NIP mulai lagi dari KR260001.
-- =====================================================================
BEGIN;

DELETE FROM sesi WHERE jenis = 'karyawan';
DELETE FROM absensi;
DELETE FROM izin_harian;
DELETE FROM riwayat_struktur;
DELETE FROM relasi_karyawan_lokasi;
UPDATE master_departemen SET id_leader = NULL WHERE id_leader IS NOT NULL;

-- Marketing (punya atasan) dulu, baru sisanya
DELETE FROM karyawan WHERE id_atasan IS NOT NULL;
DELETE FROM karyawan;

ALTER SEQUENCE seq_nip_karyawan RESTART WITH 1;

-- Pendaftaran dari HP ditutup: hanya admin yang bisa menambah karyawan.
-- Untuk membuka lagi: GRANT EXECUTE ON FUNCTION fn_register_karyawan(text, text, text, uuid, uuid) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION fn_register_karyawan(text, text, text, uuid, uuid) FROM anon, authenticated, public;

COMMIT;

NOTIFY pgrst, 'reload schema';
