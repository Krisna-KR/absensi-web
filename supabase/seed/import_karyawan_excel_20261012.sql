-- =====================================================================
-- IMPORT KARYAWAN + ABSEN 12-10-2026 (attendance_recap_20261012_164336.xlsx)
-- + DATA SAMPLING 13-04-2026 s/d 09-10-2026 (hari kerja)
-- Jalankan SEKALI, setelah migrasi 20261012_reset_karyawan_tutup_daftar.sql.
-- Password awal semua karyawan: admin123
-- =====================================================================
BEGIN;

SELECT setseed(0.1210);

-- ---------- 0. Data Excel (sheet Summary diabaikan) ----------
CREATE TEMP TABLE tmp_excel (nama text, dept text, jabatan text, atasan text, jam_masuk time, jam_keluar time) ON COMMIT DROP;
INSERT INTO tmp_excel VALUES
  ('Yovita Kris Setiani', 'Backoffice', 'Admin', NULL, '08:24:14', NULL),
  ('Endriawan Yulimahendra', 'Backoffice', 'Admin', NULL, '08:27:04', NULL),
  ('Bunadi', 'Backoffice', 'Admin', NULL, '08:25:19', NULL),
  ('Unun Listyasari', 'Backoffice', 'Admin', NULL, '07:26:37', NULL),
  ('Rahadian Taher', 'Backoffice', 'Admin', NULL, '09:20:04', NULL),
  ('Fourokta Lutfi Effendi', 'Backoffice', 'Admin', NULL, '09:19:52', NULL),
  ('Sandy adinata', 'Backoffice', 'Admin', NULL, '08:06:16', NULL),
  ('Gerald Rayhankhan Rizky', 'Backoffice', 'Admin', NULL, '12:55:56', NULL),
  ('Erwin Hariyanto', 'Backoffice', 'Admin', NULL, '06:55:25', '15:11:14'),
  ('Abdul Malik', 'Backoffice', 'Admin', NULL, '11:39:52', NULL),
  ('Arif Setyobudi', 'Backoffice', 'Admin', NULL, NULL, NULL),
  ('Scania Imannul Hadad', 'Backoffice', 'Admin', NULL, '08:06:13', NULL),
  ('Aris Wijaya', 'Backoffice', 'Admin', NULL, NULL, NULL),
  ('Erwin Muslim', 'Backoffice', 'Admin', NULL, '07:38:13', NULL),
  ('Helmy Yahya Karsidin', 'Backoffice', 'Admin', NULL, '08:01:37', NULL),
  ('Aprilia Pratiwi', 'Backoffice', 'Business Manager', NULL, '07:31:15', NULL),
  ('Mohammad Wahyu', 'Marketing', 'Marketing', 'Aprilia Pratiwi', NULL, NULL),
  ('Rike Maya Irawati', 'Marketing', 'Marketing', 'Aprilia Pratiwi', '07:40:46', NULL),
  ('Osamah Mokhtar', 'Marketing', 'Marketing', 'Aprilia Pratiwi', '08:12:37', NULL),
  ('Yusri Edi Suryono', 'Marketing', 'Marketing', 'Aprilia Pratiwi', '09:10:29', NULL),
  ('Ricky Sitompul', 'Marketing', 'Marketing', 'Aprilia Pratiwi', NULL, NULL),
  ('Fidina Lailia Mahfiroh', 'Marketing', 'Marketing', 'Aprilia Pratiwi', NULL, NULL),
  ('Satrio Adi Nugroho', 'Marketing', 'Marketing', 'Aprilia Pratiwi', NULL, NULL),
  ('Fury Ratna Sari', 'Marketing', 'Marketing', 'Aprilia Pratiwi', NULL, NULL),
  ('Ahmed Ameen Hassan Alkuraimi', 'Marketing', 'Marketing', 'Aprilia Pratiwi', NULL, NULL),
  ('Rony Setiawan', 'Marketing', 'Marketing', 'Aprilia Pratiwi', NULL, NULL),
  ('Dian Dinda Sukmawati', 'Marketing', 'Marketing', 'Aprilia Pratiwi', NULL, NULL),
  ('Mohammad luthfi', 'Marketing', 'Marketing', 'Aprilia Pratiwi', NULL, NULL),
  ('Muhammad Ibram Pratama', 'Marketing', 'Marketing', 'Aprilia Pratiwi', '08:59:53', NULL),
  ('Ivander Putra Majid', 'Marketing', 'Marketing', 'Aprilia Pratiwi', '08:43:29', NULL),
  ('Ahmad Candra Arya Kurniawan', 'Marketing', 'Marketing', 'Aprilia Pratiwi', '08:59:47', NULL),
  ('Dio Septian Pratama Hidayattull', 'Marketing', 'Marketing', 'Aprilia Pratiwi', '08:43:47', NULL),
  ('Dedi Handiarto Waluyo St', 'Marketing', 'Marketing', 'Aprilia Pratiwi', '08:48:51', NULL),
  ('Soesilo Indarto', 'Marketing', 'Marketing', 'Aprilia Pratiwi', '08:32:39', NULL),
  ('Dela Puspita Sari', 'Backoffice', 'Business Manager', NULL, '08:35:58', NULL),
  ('Muhammad Ero Abdimas', 'Marketing', 'Marketing', 'Dela Puspita Sari', NULL, NULL),
  ('Dian Wulan Agustin', 'Marketing', 'Marketing', 'Dela Puspita Sari', '08:46:20', NULL),
  ('Weni Novita Sari', 'Marketing', 'Marketing', 'Dela Puspita Sari', '08:46:31', NULL),
  ('Farrel Ferdinand Putra', 'Marketing', 'Marketing', 'Dela Puspita Sari', '08:43:52', NULL),
  ('Sultan Martha', 'Marketing', 'Marketing', 'Dela Puspita Sari', '08:26:08', NULL),
  ('Lutfi Al Hakim', 'Marketing', 'Marketing', 'Dela Puspita Sari', NULL, NULL),
  ('Ramisih', 'Backoffice', 'Business Manager', NULL, '08:17:18', NULL),
  ('Aurora Arche Naracel Brilliant', 'Marketing', 'Marketing', 'Ramisih', NULL, NULL),
  ('Endang Hesti Wahyuni', 'Marketing', 'Marketing', 'Ramisih', '08:30:51', NULL),
  ('Ari Mus Triyanti', 'Marketing', 'Marketing', 'Ramisih', NULL, NULL),
  ('Tinton Nugroho', 'Marketing', 'Marketing', 'Ramisih', '09:10:49', NULL),
  ('Moch Syafandi', 'Marketing', 'Marketing', 'Ramisih', NULL, NULL),
  ('Kasiyanah', 'Marketing', 'Marketing', 'Ramisih', '09:00:00', NULL),
  ('Muhammad Taufiq Nur', 'Marketing', 'Marketing', 'Ramisih', '08:51:39', NULL),
  ('Soelastri', 'Marketing', 'Marketing', 'Ramisih', '08:30:10', NULL),
  ('Seno Dwi Saputra', 'Marketing', 'Marketing', 'Ramisih', '12:27:50', NULL),
  ('Krisna Bagus Prabowo', 'Marketing', 'Marketing', 'Ramisih', NULL, NULL),
  ('Ahmad Dzikri Robbani', 'Marketing', 'Marketing', 'Ramisih', '08:45:12', NULL),
  ('Naufal Hisyam Maulana', 'Marketing', 'Marketing', 'Ramisih', '08:46:02', NULL),
  ('Valentina Stefi Saputri', 'Marketing', 'Marketing', 'Ramisih', '08:54:55', NULL),
  ('Meil Vena Rianti', 'Marketing', 'Marketing', 'Ramisih', '08:29:38', NULL),
  ('Rudi Hartono', 'Marketing', 'Marketing', 'Ramisih', '08:58:39', NULL),
  ('Eko Edriyanti Amd', 'Marketing', 'Marketing', 'Ramisih', '08:20:47', NULL),
  ('Sri Devi Saputra', 'Marketing', 'Marketing', 'Ramisih', '10:04:00', NULL),
  ('Yermias Palallung', 'Backoffice', 'Business Manager', NULL, '08:18:44', NULL),
  ('William Manase P.', 'Marketing', 'Marketing', 'Yermias Palallung', NULL, NULL),
  ('Alfad F.', 'Marketing', 'Marketing', 'Yermias Palallung', '09:17:06', NULL),
  ('Nindya W Handayani, Se', 'Marketing', 'Marketing', 'Yermias Palallung', '09:00:38', NULL),
  ('Indah Prasetyaningsih Se', 'Marketing', 'Marketing', 'Yermias Palallung', '09:07:47', NULL),
  ('Daniel Ardianto', 'Marketing', 'Marketing', 'Yermias Palallung', '08:28:24', NULL),
  ('Artika Septiana Putri', 'Marketing', 'Marketing', 'Yermias Palallung', '08:40:37', NULL),
  ('Emylia Joke Ekaliza', 'Marketing', 'Marketing', 'Yermias Palallung', '08:40:54', NULL),
  ('Ferdiana Dwi Novitasari', 'Marketing', 'Marketing', 'Yermias Palallung', '08:18:34', NULL),
  ('Retnaning Pangastuti', 'Marketing', 'Marketing', 'Yermias Palallung', '08:53:34', NULL),
  ('Nivea Fahra Ramdhan', 'Marketing', 'Marketing', 'Yermias Palallung', '08:50:47', NULL),
  ('Kelvin Pratama Ismanto', 'Marketing', 'Marketing', 'Yermias Palallung', '08:43:40', NULL),
  ('Nurul Aini', 'Marketing', 'Marketing', 'Yermias Palallung', '08:31:03', NULL),
  ('Mario Teguh Setyadi', 'Marketing', 'Marketing', 'Yermias Palallung', '08:51:18', NULL),
  ('Aisah Widayanti', 'Marketing', 'Marketing', 'Yermias Palallung', '07:52:45', NULL),
  ('Andre Marcelino', 'Marketing', 'Marketing', 'Yermias Palallung', '08:49:52', NULL),
  ('Lia Novitasari', 'Marketing', 'Marketing', 'Yermias Palallung', '08:38:32', NULL),
  ('M Adit Ardiansyah', 'Marketing', 'Marketing', 'Yermias Palallung', '08:50:00', NULL),
  ('Yuni Ratnasari', 'Marketing', 'Marketing', 'Yermias Palallung', '08:01:03', NULL),
  ('Carol Meviona Verlita Agustin', 'Marketing', 'Marketing', 'Yermias Palallung', NULL, NULL),
  ('Arga Dahana Prasetya Fauzi', 'Marketing', 'Marketing', 'Ibnu', '08:27:09', NULL),
  ('Nanda Octiani', 'Marketing', 'Marketing', 'Ibnu', '09:25:09', NULL),
  ('Ibnu', 'Backoffice', 'Business Manager', NULL, '09:01:56', NULL),
  ('Fateha Norma Amalia', 'Marketing', 'Marketing', 'Ibnu', '08:53:54', NULL),
  ('Catur Wahyu Handoko', 'Marketing', 'Marketing', 'Ibnu', '08:51:32', NULL),
  ('Andre Mandala', 'Marketing', 'Marketing', 'Ibnu', '08:55:36', NULL),
  ('Mayra Putri Arbain', 'Marketing', 'Marketing', 'Ibnu', '08:54:07', NULL),
  ('Mutiara Alyzza Bilqis', 'Marketing', 'Marketing', 'Ibnu', '08:35:38', NULL),
  ('Didik Ashuri', 'Marketing', 'Marketing', 'Ibnu', NULL, NULL),
  ('Indra Mulyono Nurohman', 'Marketing', 'Marketing', 'Ibnu', NULL, NULL),
  ('Nailah Dafa Salsabila', 'Marketing', 'Marketing', 'Ibnu', '08:51:49', NULL),
  ('Ria Annisa', 'Marketing', 'Marketing', 'Ibnu', '08:50:01', NULL),
  ('William Winarto', 'Marketing', 'Marketing', 'Ibnu', NULL, NULL),
  ('Colina Dwi Putri', 'Marketing', 'Marketing', 'Ibnu', '08:55:29', NULL),
  ('Eko Dwi Setyo Nurcahyo', 'Marketing', 'Marketing', 'Ibnu', '08:42:13', NULL),
  ('Farel Ferdinandsyah Widodo', 'Marketing', 'Marketing', 'Ibnu', '08:52:08', NULL),
  ('Maheswari Ramadani Mahameru', 'Marketing', 'Marketing', 'Ibnu', '08:54:12', NULL),
  ('Diga Yadika Putra', 'Marketing', 'Marketing', 'Ibnu', NULL, NULL),
  ('Fayola Nur Khasia Arbain', 'Marketing', 'Marketing', 'Ibnu', NULL, NULL),
  ('Heinz Wijaya', 'Marketing', 'Marketing', 'Ibnu', '09:00:50', NULL);

-- Batal kalau ada nama yang sudah terdaftar (mencegah dobel kalau script dijalankan 2x)
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(k.nama_lengkap, ', ') INTO v FROM karyawan k JOIN tmp_excel t ON t.nama = k.nama_lengkap;
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Sudah terdaftar, import dibatalkan: %', v; END IF;
END $$;

-- ---------- 1. Backoffice dulu (BO + 5 Team Leader sebagai Business Manager) ----------
INSERT INTO karyawan (nama_lengkap, id_departemen, jabatan, id_lokasi, password, role, is_approved, created_at)
SELECT t.nama, (SELECT id FROM master_departemen WHERE nama_departemen = 'Backoffice' ORDER BY id LIMIT 1),
       t.jabatan, (SELECT id FROM master_lokasi WHERE nama_cabang = 'Surabaya'),
       'admin123', 'Karyawan', true, timestamptz '2026-04-12 08:00+07'
FROM tmp_excel t WHERE t.dept = 'Backoffice';

-- ---------- 2. Marketing, atasan = Team Leader sheet-nya ----------
INSERT INTO karyawan (nama_lengkap, id_departemen, jabatan, id_atasan, id_lokasi, password, role, is_approved, created_at)
SELECT t.nama, (SELECT id FROM master_departemen WHERE nama_departemen = 'Marketing' ORDER BY id LIMIT 1),
       'Marketing', (SELECT id FROM karyawan WHERE nama_lengkap = t.atasan),
       (SELECT id FROM master_lokasi WHERE nama_cabang = 'Surabaya'),
       'admin123', 'Karyawan', true, timestamptz '2026-04-12 08:00+07'
FROM tmp_excel t WHERE t.dept = 'Marketing';

-- ---------- 3. Absen asli 12-10-2026 dari Excel (Absent = tidak ada baris) ----------
INSERT INTO absensi (id_karyawan, waktu_masuk, waktu_keluar)
SELECT k.id,
       (date '2026-10-12' + t.jam_masuk) AT TIME ZONE 'Asia/Jakarta',
       (date '2026-10-12' + t.jam_keluar) AT TIME ZONE 'Asia/Jakarta'
FROM tmp_excel t JOIN karyawan k ON k.nama_lengkap = t.nama
WHERE t.jam_masuk IS NOT NULL;

-- ---------- 4. Sampling 13-04-2026 s/d 09-10-2026 ----------
-- Pola jam diambil dari Excel: datang 07.30-09.00, telat 09.01-11.00, pulang 17.00-18.00.
-- Status Hadir/Late tetap dihitung trigger sesuai batas jam di database.
CREATE TEMP TABLE tmp_sampel ON COMMIT DROP AS
WITH k AS (
  SELECT k.id, md.nama_departemen AS dept,
         0.4 + random() * 1.4 AS faktor_telat,
         0.5 + random() * 1.5 AS faktor_absen
  FROM karyawan k JOIN master_departemen md ON md.id = k.id_departemen
  JOIN tmp_excel t ON t.nama = k.nama_lengkap
)
SELECT k.id AS id_karyawan, d::date AS tanggal, k.faktor_telat,
       CASE WHEN k.dept = 'Marketing' THEN .045 ELSE .030 END * k.faktor_absen AS p_izin,
       CASE WHEN k.dept = 'Marketing' THEN .070 ELSE .025 END * k.faktor_absen AS p_bolos,
       .12 AS p_telat,
       random() AS r_status, random() AS r_jam, random() AS r_pulang, random() AS r_jenis
FROM k
CROSS JOIN generate_series(date '2026-04-13', date '2026-10-09', interval '1 day') d
WHERE extract(isodow FROM d) < 6
  AND NOT EXISTS (SELECT 1 FROM master_libur ml WHERE ml.tanggal = d::date);

ALTER TABLE tmp_sampel ADD COLUMN hasil text;
UPDATE tmp_sampel SET hasil = CASE
  WHEN r_status < p_izin                                    THEN 'izin'
  WHEN r_status < p_izin + p_bolos                          THEN 'bolos'
  WHEN r_status < p_izin + p_bolos + p_telat * faktor_telat THEN 'telat'
  ELSE 'hadir' END;

INSERT INTO absensi (id_karyawan, waktu_masuk, waktu_keluar)
SELECT id_karyawan,
       CASE WHEN hasil = 'hadir'
            THEN (tanggal + time '07:30') AT TIME ZONE 'Asia/Jakarta' + make_interval(secs => floor(5400 * sqrt(r_jam)))
            ELSE (tanggal + time '09:01') AT TIME ZONE 'Asia/Jakarta' + make_interval(secs => floor(7200 * r_jam * r_jam))
       END,
       CASE WHEN r_pulang < 0.05 THEN NULL   -- 5% lupa scan pulang
            ELSE (tanggal + time '17:00') AT TIME ZONE 'Asia/Jakarta' + make_interval(secs => floor(3600 * r_pulang)) END
FROM tmp_sampel WHERE hasil IN ('hadir', 'telat');

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
  FROM tmp_sampel WHERE hasil = 'izin'
) z;

COMMIT;

-- Cek hasil (read-only):
-- SELECT md.nama_departemen, k.jabatan, count(*) FROM karyawan k JOIN master_departemen md ON md.id = k.id_departemen GROUP BY 1, 2;
-- SELECT tanggal = date '2026-10-12' AS hari_ini, status, count(*) FROM absensi GROUP BY 1, 2 ORDER BY 1, 2;
