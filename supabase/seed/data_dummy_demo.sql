-- =====================================================================
-- DATA DUMMY DEMO: 20 karyawan + absensi & izin 1 Jan 2026 s/d hari ini
-- Semua karyawan demo memakai email demo-...@absensi.demo
-- supaya bisa dihapus bersih lewat data_dummy_hapus.sql.
-- Jalankan SEKALI di Supabase SQL Editor (setelah kedua migrasi).
-- =====================================================================
BEGIN;

SELECT setseed(0.2026);

-- ---------- 1. Karyawan Backoffice ----------
INSERT INTO karyawan (nama_lengkap, email, id_departemen, jabatan, password, role, is_approved, created_at)
SELECT v.nama, v.email, (SELECT id FROM master_departemen WHERE nama_departemen = 'Backoffice'),
       v.jabatan, 'admin123', 'Karyawan', true, timestamptz '2026-01-01 08:00+07'
FROM (VALUES
  ('Hendra Wijaya',    'demo-bm1@absensi.demo', 'Business Manager'),
  ('Sari Puspitasari', 'demo-bm2@absensi.demo', 'Business Manager'),
  ('Agus Santoso',     'demo-bm3@absensi.demo', 'Business Manager'),
  ('Dewi Lestari',     'demo-it1@absensi.demo', 'IT'),
  ('Rudi Hartono',     'demo-ad1@absensi.demo', 'Admin')
) AS v(nama, email, jabatan);

-- ---------- 2. Karyawan Marketing (masing-masing di bawah 1 BM) ----------
INSERT INTO karyawan (nama_lengkap, email, id_departemen, jabatan, id_atasan, password, role, is_approved, created_at)
SELECT v.nama, v.email, (SELECT id FROM master_departemen WHERE nama_departemen = 'Marketing'),
       'Marketing', (SELECT id FROM karyawan WHERE email = v.bm), 'admin123', 'Karyawan', true, timestamptz '2026-01-01 08:00+07'
FROM (VALUES
  ('Rina Kartika',     'demo-mk01@absensi.demo', 'demo-bm1@absensi.demo'),
  ('Bayu Pratama',     'demo-mk02@absensi.demo', 'demo-bm1@absensi.demo'),
  ('Fitri Handayani',  'demo-mk03@absensi.demo', 'demo-bm1@absensi.demo'),
  ('Joko Susilo',      'demo-mk04@absensi.demo', 'demo-bm1@absensi.demo'),
  ('Maya Anggraini',   'demo-mk05@absensi.demo', 'demo-bm1@absensi.demo'),
  ('Doni Saputra',     'demo-mk06@absensi.demo', 'demo-bm2@absensi.demo'),
  ('Lina Marlina',     'demo-mk07@absensi.demo', 'demo-bm2@absensi.demo'),
  ('Eko Prasetyo',     'demo-mk08@absensi.demo', 'demo-bm2@absensi.demo'),
  ('Nur Aisyah',       'demo-mk09@absensi.demo', 'demo-bm2@absensi.demo'),
  ('Yoga Firmansyah',  'demo-mk10@absensi.demo', 'demo-bm2@absensi.demo'),
  ('Tika Rahmawati',   'demo-mk11@absensi.demo', 'demo-bm3@absensi.demo'),
  ('Andi Kurniawan',   'demo-mk12@absensi.demo', 'demo-bm3@absensi.demo'),
  ('Wulan Sari',       'demo-mk13@absensi.demo', 'demo-bm3@absensi.demo'),
  ('Rizky Ramadhan',   'demo-mk14@absensi.demo', 'demo-bm3@absensi.demo'),
  ('Putri Amelia',     'demo-mk15@absensi.demo', 'demo-bm3@absensi.demo')
) AS v(nama, email, bm);

-- ---------- 3. Hari kerja per karyawan + angka acak ----------
-- Peluang per bulan: telat naik di musim hujan & sekitar Lebaran (Maret),
-- izin/cuti naik di Maret (mudik) dan Desember.
CREATE TEMP TABLE tmp_demo ON COMMIT DROP AS
WITH k AS (
  SELECT id, 0.4 + random() * 1.4 AS faktor_telat      -- tiap orang punya kebiasaan beda
  FROM karyawan WHERE email LIKE 'demo-%@absensi.demo'
),
bulan(m, p_telat, p_izin, p_bolos) AS (VALUES
  (1, .13, .035, .015), (2, .12, .030, .012), (3, .17, .070, .020), (4, .10, .035, .012),
  (5, .09, .040, .010), (6, .08, .030, .010), (7, .08, .030, .008), (8, .09, .035, .010),
  (9, .10, .030, .010), (10, .11, .030, .012), (11, .13, .035, .014), (12, .14, .060, .015)
)
SELECT k.id AS id_karyawan, d::date AS tanggal, k.faktor_telat,
       b.p_telat, b.p_izin, b.p_bolos,
       random() AS r_status, random() AS r_jam, random() AS r_pulang, random() AS r_jenis
FROM k
CROSS JOIN generate_series(date '2026-01-01', (now() AT TIME ZONE 'Asia/Jakarta')::date, interval '1 day') d
JOIN bulan b ON b.m = extract(month FROM d)
WHERE extract(isodow FROM d) < 6
  AND NOT EXISTS (SELECT 1 FROM master_libur l WHERE l.tanggal = d::date);

ALTER TABLE tmp_demo ADD COLUMN hasil text;
UPDATE tmp_demo SET hasil = CASE
  WHEN r_status < p_izin                                   THEN 'izin'
  WHEN r_status < p_izin + p_bolos                         THEN 'bolos'
  WHEN r_status < p_izin + p_bolos + p_telat * faktor_telat THEN 'telat'
  ELSE 'hadir' END
WHERE hasil IS NULL;

-- ---------- 4. Absensi (tepat waktu 07.05-08.00, telat 08.01-09.40) ----------
INSERT INTO absensi (id_karyawan, waktu_masuk, waktu_keluar)
SELECT id_karyawan, masuk, CASE WHEN pulang <= now() THEN pulang END
FROM (
  SELECT id_karyawan,
         CASE WHEN hasil = 'hadir'
              THEN (tanggal + time '07:05') AT TIME ZONE 'Asia/Jakarta' + make_interval(mins => floor(55 * sqrt(r_jam))::int)
              ELSE (tanggal + time '08:01') AT TIME ZONE 'Asia/Jakarta' + make_interval(mins => floor(99 * r_jam * r_jam)::int)
         END AS masuk,
         (tanggal + time '17:00') AT TIME ZONE 'Asia/Jakarta' + make_interval(mins => floor(80 * r_pulang)::int) AS pulang
  FROM tmp_demo
  WHERE hasil IN ('hadir', 'telat')
) x
WHERE masuk <= now();

-- ---------- 5. Izin / Sakit / Cuti ----------
INSERT INTO izin_harian (id_karyawan, tanggal, jenis, keterangan, status_approval)
SELECT id_karyawan, tanggal, jenis,
       CASE jenis
         WHEN 'Sakit' THEN (ARRAY['Demam', 'Flu dan batuk', 'Periksa ke dokter', 'Sakit gigi'])[1 + floor(r_jam * 4)::int]
         WHEN 'Izin'  THEN (ARRAY['Urusan keluarga', 'Mengurus dokumen', 'Acara keluarga'])[1 + floor(r_jam * 3)::int]
         ELSE 'Cuti tahunan'
       END,
       'Disetujui'
FROM (
  SELECT *, CASE WHEN r_jenis < 0.45 THEN 'Sakit' WHEN r_jenis < 0.8 THEN 'Izin' ELSE 'Cuti' END AS jenis
  FROM tmp_demo WHERE hasil = 'izin'
) z;

COMMIT;

-- Cek hasil (read-only):
-- SELECT status, count(*) FROM absensi a JOIN karyawan k ON k.id = a.id_karyawan
-- WHERE k.email LIKE 'demo-%@absensi.demo' GROUP BY status;
