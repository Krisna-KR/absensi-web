-- =====================================================================
-- HAPUS DATA DUMMY DEMO (karyawan dengan email demo-...@absensi.demo)
-- Karyawan asli tidak tersentuh. Kalau ada karyawan asli yang atasannya
-- BM demo, pindahkan dulu ke BM lain, kalau tidak script ini gagal & batal.
-- =====================================================================
BEGIN;

DELETE FROM absensi     WHERE id_karyawan IN (SELECT id FROM karyawan WHERE email LIKE 'demo-%@absensi.demo');
DELETE FROM izin_harian WHERE id_karyawan IN (SELECT id FROM karyawan WHERE email LIKE 'demo-%@absensi.demo');
DELETE FROM karyawan    WHERE email LIKE 'demo-%@absensi.demo' AND jabatan = 'Marketing';
DELETE FROM karyawan    WHERE email LIKE 'demo-%@absensi.demo';

COMMIT;
