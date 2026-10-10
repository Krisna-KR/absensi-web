-- =====================================================================
-- Migrasi: Struktur atasan (Marketing -> Business Manager), NIP umum,
--          status absensi (Hadir/Late/Izin/Sakit/Cuti/Libur/Bolos),
--          master libur nasional + cuti bersama.
-- Target  : Supabase (PostgreSQL), schema public
-- Cara    : Jalankan SEKALI di Supabase SQL Editor. Seluruh script dalam
--           satu transaksi: kalau ada error, semua perubahan dibatalkan.
-- Catatan : Script ini MENGUBAH data (NIP & username diganti, departemen
--           duplikat dihapus, absensi duplikat per hari dihapus).
--           Disetujui karena data saat ini masih dummy.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Konstanta aturan bisnis (didokumentasikan, dipakai di fungsi)
--    Zona waktu     : Asia/Jakarta (WIB)
--    Telat          : jam masuk >= 08:01 WIB (lebih dari 08:00)
--    Hari kerja     : Senin - Jumat (Sabtu & Minggu = Libur)
--    Bolos hari ini : baru dihitung setelah 12:00 WIB (jendela check-in tutup)
-- ---------------------------------------------------------------------

-- =====================================================================
-- 1. DEPARTEMEN: rapikan jadi 1 baris "Marketing" + 1 baris "Backoffice"
-- =====================================================================
INSERT INTO master_departemen (nama_departemen)
SELECT 'Marketing' WHERE NOT EXISTS (SELECT 1 FROM master_departemen WHERE nama_departemen = 'Marketing');
INSERT INTO master_departemen (nama_departemen)
SELECT 'Backoffice' WHERE NOT EXISTS (SELECT 1 FROM master_departemen WHERE nama_departemen = 'Backoffice');

CREATE TEMP TABLE tmp_dept_kanonik ON COMMIT DROP AS
SELECT DISTINCT ON (nama_departemen) nama_departemen, id
FROM master_departemen
WHERE nama_departemen IN ('Marketing', 'Backoffice')
ORDER BY nama_departemen, (id_leader IS NOT NULL), id;

-- =====================================================================
-- 2. KARYAWAN: kolom atasan
-- =====================================================================
ALTER TABLE karyawan ADD COLUMN id_atasan uuid REFERENCES karyawan(id) ON DELETE RESTRICT;
ALTER TABLE karyawan ADD CONSTRAINT ck_karyawan_atasan_bukan_diri_sendiri
  CHECK (id_atasan IS NULL OR id_atasan <> id);

-- 2a. Pindahkan relasi lama "Marketing (Team X)" -> karyawan.id_atasan = X
UPDATE karyawan k
SET id_atasan = d.id_leader
FROM master_departemen d
WHERE k.id_departemen = d.id
  AND d.nama_departemen = 'Marketing'
  AND d.id_leader IS NOT NULL
  AND d.id_leader <> k.id;

-- 2b. Arahkan semua referensi departemen duplikat ke baris kanonik
UPDATE karyawan k
SET id_departemen = c.id
FROM master_departemen d
JOIN tmp_dept_kanonik c ON c.nama_departemen = d.nama_departemen
WHERE k.id_departemen = d.id AND k.id_departemen <> c.id;

UPDATE master_tim t
SET id_departemen = c.id
FROM master_departemen d
JOIN tmp_dept_kanonik c ON c.nama_departemen = d.nama_departemen
WHERE t.id_departemen = d.id AND t.id_departemen <> c.id;

INSERT INTO relasi_departemen_lokasi (id_departemen, id_lokasi)
SELECT DISTINCT c.id, r.id_lokasi
FROM relasi_departemen_lokasi r
JOIN master_departemen d ON d.id = r.id_departemen
JOIN tmp_dept_kanonik c ON c.nama_departemen = d.nama_departemen
WHERE r.id_departemen <> c.id
  AND NOT EXISTS (SELECT 1 FROM relasi_departemen_lokasi x
                  WHERE x.id_departemen = c.id AND x.id_lokasi = r.id_lokasi);

DELETE FROM relasi_departemen_lokasi r
USING master_departemen d, tmp_dept_kanonik c
WHERE d.id = r.id_departemen AND c.nama_departemen = d.nama_departemen AND r.id_departemen <> c.id;

-- 2c. id_leader tidak dipakai lagi (kolom TIDAK di-drop; lihat bagian 10)
UPDATE master_departemen SET id_leader = NULL WHERE id_leader IS NOT NULL;

DELETE FROM master_departemen d
USING tmp_dept_kanonik c
WHERE d.nama_departemen = c.nama_departemen AND d.id <> c.id;

CREATE UNIQUE INDEX uq_master_departemen_nama ON master_departemen (nama_departemen);
ALTER TABLE master_departemen ADD CONSTRAINT ck_master_departemen_nama
  CHECK (nama_departemen IN ('Marketing', 'Backoffice')) NOT VALID;

-- 2d. Normalisasi jabatan data lama
--     Backoffice yang punya bawahan -> Business Manager
UPDATE karyawan k
SET jabatan = 'Business Manager'
FROM tmp_dept_kanonik c
WHERE c.nama_departemen = 'Backoffice' AND k.id_departemen = c.id
  AND EXISTS (SELECT 1 FROM karyawan b WHERE b.id_atasan = k.id);

--     Backoffice lain dengan jabatan kosong/tidak valid -> Business Manager (koreksi lewat UI)
UPDATE karyawan k
SET jabatan = 'Business Manager'
FROM tmp_dept_kanonik c
WHERE c.nama_departemen = 'Backoffice' AND k.id_departemen = c.id
  AND (k.jabatan IS NULL OR k.jabatan NOT IN ('Business Manager', 'IT', 'Admin'));

--     Marketing -> jabatan 'Marketing'
UPDATE karyawan k
SET jabatan = 'Marketing'
FROM tmp_dept_kanonik c
WHERE c.nama_departemen = 'Marketing' AND k.id_departemen = c.id
  AND k.jabatan IS DISTINCT FROM 'Marketing';

--     Atasan yang tidak valid (bukan Business Manager Backoffice) dilepas
UPDATE karyawan k
SET id_atasan = NULL
WHERE k.id_atasan IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM karyawan a
    JOIN master_departemen d ON d.id = a.id_departemen
    WHERE a.id = k.id_atasan AND d.nama_departemen = 'Backoffice' AND a.jabatan = 'Business Manager'
  );

-- =====================================================================
-- 3. NIP UMUM (tanpa kode jabatan): KR + YY (tahun gabung) + 4 digit urut
--    Contoh: KR260001. Username = lower(NIP) -> kr260001
-- =====================================================================
CREATE SEQUENCE seq_nip_karyawan;

DO $$
DECLARE r record; v_nip text;
BEGIN
  FOR r IN SELECT id, created_at FROM karyawan ORDER BY created_at NULLS FIRST, id LOOP
    v_nip := 'KR' || to_char(COALESCE(r.created_at, now()) AT TIME ZONE 'Asia/Jakarta', 'YY')
                  || lpad(nextval('seq_nip_karyawan')::text, 4, '0');
    UPDATE karyawan SET nip = v_nip, username = lower(v_nip) WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX uq_karyawan_nip ON karyawan (nip);
CREATE UNIQUE INDEX uq_karyawan_username ON karyawan (username);

CREATE OR REPLACE FUNCTION fn_karyawan_generate_id() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nip IS NULL OR NEW.nip = '' THEN
    NEW.nip := 'KR' || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YY')
                    || lpad(nextval('seq_nip_karyawan')::text, 4, '0');
  END IF;
  IF NEW.username IS NULL OR NEW.username = '' THEN
    NEW.username := lower(NEW.nip);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_karyawan_10_generate_id
BEFORE INSERT ON karyawan
FOR EACH ROW EXECUTE FUNCTION fn_karyawan_generate_id();

-- =====================================================================
-- 4. VALIDASI STRUKTUR (berlaku untuk insert/update berikutnya)
--    Marketing  : jabatan 'Marketing', wajib 1 atasan Business Manager (Backoffice)
--    Backoffice : jabatan Business Manager / IT / Admin, tanpa atasan
--    BM yang masih punya bawahan tidak boleh berubah jabatan/departemen
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_karyawan_validasi_struktur() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_dept text; v_atasan_dept text; v_atasan_jabatan text; v_bawahan int;
BEGIN
  SELECT nama_departemen INTO v_dept FROM master_departemen WHERE id = NEW.id_departemen;

  IF v_dept = 'Marketing' THEN
    NEW.jabatan := 'Marketing';
    IF NEW.id_atasan IS NULL THEN
      RAISE EXCEPTION 'Marketing wajib memiliki 1 atasan Business Manager.';
    END IF;
    SELECT d.nama_departemen, k.jabatan INTO v_atasan_dept, v_atasan_jabatan
    FROM karyawan k LEFT JOIN master_departemen d ON d.id = k.id_departemen
    WHERE k.id = NEW.id_atasan;
    IF v_atasan_dept IS DISTINCT FROM 'Backoffice' OR v_atasan_jabatan IS DISTINCT FROM 'Business Manager' THEN
      RAISE EXCEPTION 'Atasan Marketing harus karyawan Backoffice dengan jabatan Business Manager.';
    END IF;
  ELSIF v_dept = 'Backoffice' THEN
    NEW.id_atasan := NULL;
    IF NEW.jabatan IS NULL OR NEW.jabatan NOT IN ('Business Manager', 'IT', 'Admin') THEN
      RAISE EXCEPTION 'Jabatan Backoffice harus Business Manager, IT, atau Admin.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.jabatan = 'Business Manager'
     AND (NEW.jabatan IS DISTINCT FROM 'Business Manager') THEN
    SELECT count(*) INTO v_bawahan FROM karyawan WHERE id_atasan = NEW.id;
    IF v_bawahan > 0 THEN
      RAISE EXCEPTION 'Masih membawahi % Marketing. Transfer bawahan ke Business Manager lain terlebih dahulu.', v_bawahan;
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_karyawan_20_validasi_struktur
BEFORE INSERT OR UPDATE OF id_departemen, jabatan, id_atasan ON karyawan
FOR EACH ROW EXECUTE FUNCTION fn_karyawan_validasi_struktur();

-- =====================================================================
-- 5. RIWAYAT STRUKTUR (otomatis: Awal / Transfer / Promosi / Mutasi / Perubahan Jabatan)
-- =====================================================================
CREATE TABLE riwayat_struktur (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_karyawan     uuid NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  id_departemen   uuid REFERENCES master_departemen(id) ON DELETE SET NULL,
  jabatan         text,
  id_atasan       uuid REFERENCES karyawan(id) ON DELETE SET NULL,
  jenis_perubahan text NOT NULL CHECK (jenis_perubahan IN ('Awal', 'Transfer', 'Promosi', 'Mutasi', 'Perubahan Jabatan')),
  berlaku_mulai   timestamptz NOT NULL DEFAULT now(),
  berlaku_sampai  timestamptz
);
CREATE INDEX ix_riwayat_struktur_karyawan ON riwayat_struktur (id_karyawan, berlaku_mulai DESC);
CREATE UNIQUE INDEX uq_riwayat_struktur_aktif ON riwayat_struktur (id_karyawan) WHERE berlaku_sampai IS NULL;

CREATE OR REPLACE FUNCTION fn_karyawan_log_struktur() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_jenis text; v_dept_lama text; v_dept_baru text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id_departemen IS NOT DISTINCT FROM OLD.id_departemen
     AND NEW.jabatan       IS NOT DISTINCT FROM OLD.jabatan
     AND NEW.id_atasan     IS NOT DISTINCT FROM OLD.id_atasan THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_jenis := 'Awal';
  ELSE
    SELECT nama_departemen INTO v_dept_lama FROM master_departemen WHERE id = OLD.id_departemen;
    SELECT nama_departemen INTO v_dept_baru FROM master_departemen WHERE id = NEW.id_departemen;
    IF v_dept_lama = 'Marketing' AND v_dept_baru = 'Backoffice' THEN
      v_jenis := 'Promosi';
    ELSIF NEW.id_departemen IS DISTINCT FROM OLD.id_departemen THEN
      v_jenis := 'Mutasi';
    ELSIF NEW.id_atasan IS DISTINCT FROM OLD.id_atasan THEN
      v_jenis := 'Transfer';
    ELSE
      v_jenis := 'Perubahan Jabatan';
    END IF;
    UPDATE riwayat_struktur SET berlaku_sampai = now()
    WHERE id_karyawan = NEW.id AND berlaku_sampai IS NULL;
  END IF;

  INSERT INTO riwayat_struktur (id_karyawan, id_departemen, jabatan, id_atasan, jenis_perubahan)
  VALUES (NEW.id, NEW.id_departemen, NEW.jabatan, NEW.id_atasan, v_jenis);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_karyawan_30_log_struktur
AFTER INSERT OR UPDATE OF id_departemen, jabatan, id_atasan ON karyawan
FOR EACH ROW EXECUTE FUNCTION fn_karyawan_log_struktur();

-- Baris "Awal" untuk karyawan yang sudah ada
INSERT INTO riwayat_struktur (id_karyawan, id_departemen, jabatan, id_atasan, jenis_perubahan, berlaku_mulai)
SELECT id, id_departemen, jabatan, id_atasan, 'Awal', COALESCE(created_at, now())
FROM karyawan;

-- =====================================================================
-- 6. ABSENSI: kolom tanggal kerja, 1 baris per karyawan per hari,
--    status Hadir/Late dihitung di DB (tidak lagi di browser)
-- =====================================================================
ALTER TABLE absensi ADD COLUMN tanggal date;

CREATE OR REPLACE FUNCTION fn_absensi_hitung() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_jam time;
BEGIN
  NEW.tanggal := (NEW.waktu_masuk AT TIME ZONE 'Asia/Jakarta')::date;
  v_jam := (NEW.waktu_masuk AT TIME ZONE 'Asia/Jakarta')::time;
  IF v_jam >= time '08:01' THEN
    NEW.status := 'Late';
    NEW.durasi_telat_menit := floor(extract(epoch FROM (v_jam - time '08:00')) / 60)::int;
  ELSE
    NEW.status := 'Hadir';
    NEW.durasi_telat_menit := 0;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_absensi_hitung
BEFORE INSERT OR UPDATE ON absensi
FOR EACH ROW EXECUTE FUNCTION fn_absensi_hitung();

-- Data lama: hapus baris yatim, hitung ulang tanggal/status, buang duplikat per hari
DELETE FROM absensi WHERE id_karyawan IS NULL OR id_karyawan NOT IN (SELECT id FROM karyawan);
UPDATE absensi SET waktu_masuk = waktu_masuk WHERE id IS NOT NULL;

DELETE FROM absensi a
USING absensi b
WHERE a.id_karyawan = b.id_karyawan
  AND a.tanggal = b.tanggal
  AND (a.waktu_masuk > b.waktu_masuk OR (a.waktu_masuk = b.waktu_masuk AND a.id > b.id));

ALTER TABLE absensi ALTER COLUMN tanggal SET NOT NULL;
ALTER TABLE absensi ALTER COLUMN id_karyawan SET NOT NULL;
CREATE UNIQUE INDEX uq_absensi_karyawan_tanggal ON absensi (id_karyawan, tanggal);
CREATE INDEX ix_absensi_tanggal ON absensi (tanggal);
ALTER TABLE absensi ADD CONSTRAINT ck_absensi_status CHECK (status IN ('Hadir', 'Late'));
ALTER TABLE absensi ADD CONSTRAINT ck_absensi_keluar_setelah_masuk
  CHECK (waktu_keluar IS NULL OR waktu_keluar > waktu_masuk) NOT VALID;

-- =====================================================================
-- 7. IZIN HARIAN: Izin / Sakit / Cuti (terpisah dari absensi)
-- =====================================================================
ALTER TABLE izin_harian ADD COLUMN keterangan text;
ALTER TABLE izin_harian ADD COLUMN created_at timestamptz DEFAULT now();

DELETE FROM izin_harian WHERE id_karyawan IS NULL OR id_karyawan NOT IN (SELECT id FROM karyawan);
DELETE FROM izin_harian a
USING izin_harian b
WHERE a.id_karyawan = b.id_karyawan AND a.tanggal = b.tanggal AND a.id > b.id;

ALTER TABLE izin_harian ALTER COLUMN id_karyawan SET NOT NULL;
ALTER TABLE izin_harian ADD CONSTRAINT fk_izin_harian_karyawan
  FOREIGN KEY (id_karyawan) REFERENCES karyawan(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX uq_izin_harian_karyawan_tanggal ON izin_harian (id_karyawan, tanggal);
ALTER TABLE izin_harian ADD CONSTRAINT ck_izin_harian_jenis
  CHECK (jenis IN ('Izin', 'Sakit', 'Cuti')) NOT VALID;
ALTER TABLE izin_harian ADD CONSTRAINT ck_izin_harian_approval
  CHECK (status_approval IN ('Pending', 'Disetujui', 'Ditolak')) NOT VALID;

-- =====================================================================
-- 8. MASTER LIBUR (tanggal merah + cuti bersama, keduanya = Libur)
--    Sumber: SKB 3 Menteri 2026 & 2027 (setneg.go.id)
-- =====================================================================
CREATE TABLE master_libur (
  tanggal    date PRIMARY KEY,
  keterangan text NOT NULL,
  jenis      text NOT NULL DEFAULT 'Libur Nasional' CHECK (jenis IN ('Libur Nasional', 'Cuti Bersama'))
);

INSERT INTO master_libur (tanggal, keterangan, jenis) VALUES
-- 2026 Libur Nasional
('2026-01-01', 'Tahun Baru 2026 Masehi', 'Libur Nasional'),
('2026-01-16', 'Isra Mikraj Nabi Muhammad SAW', 'Libur Nasional'),
('2026-02-17', 'Tahun Baru Imlek 2577 Kongzili', 'Libur Nasional'),
('2026-03-19', 'Hari Suci Nyepi (Tahun Baru Saka 1948)', 'Libur Nasional'),
('2026-03-21', 'Idulfitri 1447 H', 'Libur Nasional'),
('2026-03-22', 'Idulfitri 1447 H', 'Libur Nasional'),
('2026-04-03', 'Wafat Yesus Kristus', 'Libur Nasional'),
('2026-04-05', 'Kebangkitan Yesus Kristus (Paskah)', 'Libur Nasional'),
('2026-05-01', 'Hari Buruh Internasional', 'Libur Nasional'),
('2026-05-14', 'Kenaikan Yesus Kristus', 'Libur Nasional'),
('2026-05-27', 'Iduladha 1447 H', 'Libur Nasional'),
('2026-05-31', 'Hari Raya Waisak 2570 BE', 'Libur Nasional'),
('2026-06-01', 'Hari Lahir Pancasila', 'Libur Nasional'),
('2026-06-16', '1 Muharam Tahun Baru Islam 1448 H', 'Libur Nasional'),
('2026-08-17', 'Proklamasi Kemerdekaan', 'Libur Nasional'),
('2026-08-25', 'Maulid Nabi Muhammad SAW', 'Libur Nasional'),
('2026-12-25', 'Kelahiran Yesus Kristus (Natal)', 'Libur Nasional'),
-- 2026 Cuti Bersama
('2026-02-16', 'Cuti Bersama Tahun Baru Imlek', 'Cuti Bersama'),
('2026-03-18', 'Cuti Bersama Nyepi', 'Cuti Bersama'),
('2026-03-20', 'Cuti Bersama Idulfitri', 'Cuti Bersama'),
('2026-03-23', 'Cuti Bersama Idulfitri', 'Cuti Bersama'),
('2026-03-24', 'Cuti Bersama Idulfitri', 'Cuti Bersama'),
('2026-05-15', 'Cuti Bersama Kenaikan Yesus Kristus', 'Cuti Bersama'),
('2026-05-28', 'Cuti Bersama Iduladha', 'Cuti Bersama'),
('2026-12-24', 'Cuti Bersama Natal', 'Cuti Bersama'),
-- 2027 Libur Nasional
('2027-01-01', 'Tahun Baru 2027 Masehi', 'Libur Nasional'),
('2027-01-05', 'Isra Mikraj Nabi Muhammad SAW', 'Libur Nasional'),
('2027-02-06', 'Tahun Baru Imlek 2578 Kongzili', 'Libur Nasional'),
('2027-03-08', 'Hari Suci Nyepi (Tahun Baru Saka 1949)', 'Libur Nasional'),
('2027-03-10', 'Idulfitri 1448 H', 'Libur Nasional'),
('2027-03-11', 'Idulfitri 1448 H', 'Libur Nasional'),
('2027-03-26', 'Wafat Yesus Kristus', 'Libur Nasional'),
('2027-03-28', 'Kebangkitan Yesus Kristus (Paskah)', 'Libur Nasional'),
('2027-05-01', 'Hari Buruh Internasional', 'Libur Nasional'),
('2027-05-06', 'Kenaikan Yesus Kristus', 'Libur Nasional'),
('2027-05-17', 'Iduladha 1448 H', 'Libur Nasional'),
('2027-05-20', 'Hari Raya Waisak 2571 BE', 'Libur Nasional'),
('2027-06-01', 'Hari Lahir Pancasila', 'Libur Nasional'),
('2027-06-06', '1 Muharam Tahun Baru Islam 1449 H', 'Libur Nasional'),
('2027-08-15', 'Maulid Nabi Muhammad SAW', 'Libur Nasional'),
('2027-08-17', 'Proklamasi Kemerdekaan', 'Libur Nasional'),
('2027-12-25', 'Kelahiran Yesus Kristus (Natal)', 'Libur Nasional'),
('2027-12-26', 'Isra Mikraj Nabi Muhammad SAW', 'Libur Nasional'),
-- 2027 Cuti Bersama
('2027-02-05', 'Cuti Bersama Tahun Baru Imlek', 'Cuti Bersama'),
('2027-03-09', 'Cuti Bersama Idulfitri', 'Cuti Bersama'),
('2027-03-12', 'Cuti Bersama Idulfitri', 'Cuti Bersama'),
('2027-03-15', 'Cuti Bersama Idulfitri', 'Cuti Bersama'),
('2027-03-25', 'Cuti Bersama Wafat Yesus Kristus', 'Cuti Bersama'),
('2027-05-18', 'Cuti Bersama Iduladha', 'Cuti Bersama'),
('2027-05-19', 'Cuti Bersama Waisak', 'Cuti Bersama'),
('2027-12-24', 'Cuti Bersama Natal', 'Cuti Bersama');

-- =====================================================================
-- 9. FUNGSI REKAP KEHADIRAN (dipanggil via supabase.rpc('fn_kehadiran'))
--    Prioritas status per karyawan per hari:
--    1) ada absensi           -> Hadir / Late
--    2) ada izin (tdk ditolak)-> Izin / Sakit / Cuti
--    3) Sabtu/Minggu/libur    -> Libur
--    4) hari ini < 12:00 WIB  -> Belum Absen
--    5) selain itu            -> Bolos (jam kosong)
--    Hari sebelum karyawan terdaftar tidak dihitung (kecuali ada absensi).
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_kehadiran(p_mulai date, p_sampai date, p_id_karyawan uuid DEFAULT NULL)
RETURNS TABLE (
  tanggal            date,
  id_karyawan        uuid,
  nama_lengkap       text,
  nip                text,
  jabatan            text,
  nama_departemen    text,
  id_atasan          uuid,
  nama_atasan        text,
  id_absensi         uuid,
  waktu_masuk        timestamptz,
  waktu_keluar       timestamptz,
  durasi_telat_menit integer,
  status             text,
  keterangan         text
)
LANGUAGE sql STABLE AS $$
  WITH sekarang AS (
    SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS hari_ini,
           (now() AT TIME ZONE 'Asia/Jakarta')::time AS jam_ini
  ),
  hari AS (
    SELECT d::date AS tanggal
    FROM sekarang s,
         generate_series(p_mulai, LEAST(p_sampai, s.hari_ini), interval '1 day') d
  )
  SELECT
    h.tanggal,
    k.id,
    k.nama_lengkap,
    k.nip,
    k.jabatan,
    md.nama_departemen,
    k.id_atasan,
    atasan.nama_lengkap,
    a.id,
    a.waktu_masuk,
    a.waktu_keluar,
    a.durasi_telat_menit,
    CASE
      WHEN a.id IS NOT NULL THEN a.status
      WHEN i.id IS NOT NULL THEN i.jenis
      WHEN extract(isodow FROM h.tanggal) IN (6, 7) OR l.tanggal IS NOT NULL THEN 'Libur'
      WHEN h.tanggal = s.hari_ini AND s.jam_ini < time '12:00' THEN 'Belum Absen'
      ELSE 'Bolos'
    END,
    CASE
      WHEN a.id IS NOT NULL THEN a.keterangan
      WHEN i.id IS NOT NULL THEN i.keterangan
      WHEN l.tanggal IS NOT NULL THEN l.keterangan
      WHEN extract(isodow FROM h.tanggal) IN (6, 7) THEN 'Akhir pekan'
      ELSE NULL
    END
  FROM hari h
  CROSS JOIN sekarang s
  JOIN karyawan k ON k.is_approved IS TRUE
  LEFT JOIN master_departemen md ON md.id = k.id_departemen
  LEFT JOIN karyawan atasan      ON atasan.id = k.id_atasan
  LEFT JOIN absensi a            ON a.id_karyawan = k.id AND a.tanggal = h.tanggal
  LEFT JOIN izin_harian i        ON i.id_karyawan = k.id AND i.tanggal = h.tanggal
                                AND COALESCE(i.status_approval, 'Pending') <> 'Ditolak'
  LEFT JOIN master_libur l       ON l.tanggal = h.tanggal
  WHERE (p_id_karyawan IS NULL OR k.id = p_id_karyawan)
    AND (a.id IS NOT NULL OR h.tanggal >= (COALESCE(k.created_at, now()) AT TIME ZONE 'Asia/Jakarta')::date)
  ORDER BY h.tanggal DESC, k.nama_lengkap;
$$;

-- =====================================================================
-- 10. Hak akses untuk API Supabase (anon/authenticated) - hanya jika role ada
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON riwayat_struktur, master_libur TO anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE seq_nip_karyawan TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION fn_kehadiran(date, date, uuid) TO anon, authenticated;
  END IF;
END $$;

-- Kolom lama yang tidak dipakai lagi. TIDAK dijalankan otomatis (DROP = permanen).
-- ALTER TABLE master_departemen DROP COLUMN id_leader;

COMMIT;

-- Muat ulang cache schema PostgREST agar kolom/fungsi baru langsung terbaca API
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- CEK SETELAH MIGRASI (jalankan terpisah, read-only)
-- =====================================================================
-- Marketing yang belum punya atasan (wajib diisi lewat halaman Karyawan):
-- SELECT k.nip, k.nama_lengkap FROM karyawan k
-- JOIN master_departemen d ON d.id = k.id_departemen
-- WHERE d.nama_departemen = 'Marketing' AND k.id_atasan IS NULL;
--
-- Karyawan tanpa departemen / departemen di luar Marketing & Backoffice:
-- SELECT k.nip, k.nama_lengkap, d.nama_departemen FROM karyawan k
-- LEFT JOIN master_departemen d ON d.id = k.id_departemen
-- WHERE d.nama_departemen IS NULL OR d.nama_departemen NOT IN ('Marketing','Backoffice');
