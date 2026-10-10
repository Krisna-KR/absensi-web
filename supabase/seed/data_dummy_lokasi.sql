-- =====================================================================
-- UPDATE LOKASI DATA DUMMY (untuk yang SUDAH menjalankan data_dummy_demo.sql versi lama)
-- Jalankan setelah migrasi 3. Tim Hendra & IT di Malang, tim Sari & Admin
-- di Surabaya, tim Agus di Malang kecuali 2 orang di Surabaya.
-- =====================================================================
BEGIN;

UPDATE karyawan k
SET id_lokasi = l.id
FROM master_lokasi l
WHERE k.email LIKE 'demo-%@absensi.demo'
  AND l.nama_cabang = CASE
        WHEN k.email IN ('demo-bm2@absensi.demo', 'demo-ad1@absensi.demo',
                         'demo-mk06@absensi.demo', 'demo-mk07@absensi.demo', 'demo-mk08@absensi.demo',
                         'demo-mk09@absensi.demo', 'demo-mk10@absensi.demo',
                         'demo-mk14@absensi.demo', 'demo-mk15@absensi.demo') THEN 'Surabaya'
        ELSE 'Malang' END;

UPDATE absensi a
SET id_lokasi = k.id_lokasi
FROM karyawan k
WHERE k.id = a.id_karyawan AND k.email LIKE 'demo-%@absensi.demo';

COMMIT;
