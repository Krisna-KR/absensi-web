-- =====================================================================
-- BUSINESS MANAGER PINDAH KE MARKETING (Marketing leader dihapus)
-- Jalankan sekali di Supabase SQL Editor, SETELAH 20261016_marketing_leader.sql.
--
-- Aturan baru:
--   - Yang boleh membawahi Marketing = karyawan aktif yang job role-nya
--     tercentang "bisa jadi atasan" (Business Manager di Marketing;
--     Branch Manager & Vice President tetap Backoffice).
--   - Marketing dengan job role "bisa jadi atasan" (BM) tidak punya atasan
--     dan jadi kepala timnya sendiri.
--   - Marketing lain wajib punya 1 atasan.
--   - Aturan komisi (3 bulan tanpa komisi -> allowance 0) TIDAK berlaku untuk
--     job role "bisa jadi atasan".
--   - Job role "bisa jadi atasan" tidak muncul di pendaftaran HP.
--   - Kolom karyawan.marketing_leader tidak dipakai lagi (dibiarkan, semua false).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Validasi master job role: "bisa jadi atasan" boleh di departemen mana pun
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_jabatan_validasi() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id_departemen <> OLD.id_departemen AND EXISTS (SELECT 1 FROM karyawan WHERE jabatan = OLD.nama) THEN
      RAISE EXCEPTION 'Departemen job role yang sudah dipakai karyawan tidak bisa diganti.';
    END IF;
    IF OLD.bisa_jadi_atasan AND NOT NEW.bisa_jadi_atasan THEN
      SELECT count(*) INTO v_n FROM karyawan b JOIN karyawan a ON a.id = b.id_atasan
      WHERE a.jabatan = OLD.nama;
      IF v_n > 0 THEN
        RAISE EXCEPTION 'Masih ada % Marketing di bawah job role ini. Pindahkan dulu ke atasan lain.', v_n;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- 2. Validasi struktur karyawan (tanpa Marketing leader)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_karyawan_validasi_struktur() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dept text; v_jabatan_dept text; v_atasan_ok boolean; v_bawahan int; v_bisa_membawahi boolean;
BEGIN
  -- Tanggal nonaktif
  IF NEW.is_aktif IS FALSE AND (TG_OP = 'INSERT' OR OLD.is_aktif IS TRUE) THEN NEW.nonaktif_at := now(); END IF;
  IF NEW.is_aktif IS TRUE THEN NEW.nonaktif_at := NULL; END IF;

  SELECT nama_departemen INTO v_dept FROM master_departemen WHERE id = NEW.id_departemen;
  IF NEW.jabatan IS NULL AND v_dept = 'Marketing' THEN NEW.jabatan := 'Marketing'; END IF;
  v_bisa_membawahi := EXISTS (SELECT 1 FROM master_jabatan WHERE nama = NEW.jabatan AND bisa_jadi_atasan);

  -- Yang masih punya bawahan aktif tidak boleh dinonaktifkan / kehilangan hak membawahi
  IF TG_OP = 'UPDATE' THEN
    SELECT count(*) INTO v_bawahan FROM karyawan WHERE id_atasan = NEW.id AND is_aktif;
    IF v_bawahan > 0 AND (NEW.is_aktif IS FALSE OR NOT v_bisa_membawahi) THEN
      RAISE EXCEPTION 'Masih membawahi % Marketing. Transfer bawahan ke atasan lain terlebih dahulu.', v_bawahan;
    END IF;
  END IF;

  -- Karyawan nonaktif tidak divalidasi strukturnya
  IF NEW.is_aktif IS FALSE THEN RETURN NEW; END IF;

  SELECT d.nama_departemen INTO v_jabatan_dept
  FROM master_jabatan j JOIN master_departemen d ON d.id = j.id_departemen WHERE j.nama = NEW.jabatan;
  IF v_dept IS NOT NULL AND v_jabatan_dept IS DISTINCT FROM v_dept THEN
    RAISE EXCEPTION 'Job role % bukan milik departemen %.', COALESCE(NEW.jabatan, '(kosong)'), v_dept;
  END IF;

  IF v_dept = 'Marketing' AND v_bisa_membawahi THEN
    -- Business Manager: kepala tim, tidak punya atasan
    NEW.id_atasan := NULL;
  ELSIF v_dept = 'Marketing' THEN
    IF NEW.id_atasan IS NULL THEN
      RAISE EXCEPTION 'Marketing wajib memiliki 1 atasan (Business Manager).';
    END IF;
    IF NEW.id_atasan = NEW.id THEN
      RAISE EXCEPTION 'Atasan Marketing harus orang lain.';
    END IF;
    SELECT a.is_aktif AND j.bisa_jadi_atasan INTO v_atasan_ok
    FROM karyawan a JOIN master_jabatan j ON j.nama = a.jabatan
    WHERE a.id = NEW.id_atasan;
    IF v_atasan_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'Atasan Marketing harus karyawan aktif dengan job role yang bisa jadi atasan (Business Manager).';
    END IF;
  ELSIF v_dept = 'Backoffice' THEN
    NEW.id_atasan := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_karyawan_20_validasi_struktur ON karyawan;
CREATE TRIGGER trg_karyawan_20_validasi_struktur
BEFORE INSERT OR UPDATE OF id_departemen, jabatan, id_atasan, is_aktif ON karyawan
FOR EACH ROW EXECUTE FUNCTION fn_karyawan_validasi_struktur();

-- ---------------------------------------------------------------------
-- 3. Riwayat struktur: naik ke job role "bisa jadi atasan" dicatat Promosi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_karyawan_log_struktur() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF (v_dept_lama = 'Marketing' AND v_dept_baru = 'Backoffice')
       OR (NEW.jabatan IS DISTINCT FROM OLD.jabatan
           AND EXISTS (SELECT 1 FROM master_jabatan WHERE nama = NEW.jabatan AND bisa_jadi_atasan)
           AND NOT EXISTS (SELECT 1 FROM master_jabatan WHERE nama = OLD.jabatan AND bisa_jadi_atasan)) THEN
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

-- ---------------------------------------------------------------------
-- 4. Pindahkan job role Business Manager + karyawannya ke Marketing
--    (trigger validasi job role dimatikan sebentar karena job role ini sudah dipakai)
-- ---------------------------------------------------------------------
ALTER TABLE master_jabatan DISABLE TRIGGER trg_jabatan_validasi;
UPDATE master_jabatan
SET id_departemen = (SELECT id FROM master_departemen WHERE nama_departemen = 'Marketing'),
    bisa_jadi_atasan = true
WHERE nama = 'Business Manager';
ALTER TABLE master_jabatan ENABLE TRIGGER trg_jabatan_validasi;

UPDATE karyawan
SET id_departemen = (SELECT id FROM master_departemen WHERE nama_departemen = 'Marketing'),
    id_atasan = NULL
WHERE jabatan = 'Business Manager'
  AND id_departemen IS DISTINCT FROM (SELECT id FROM master_departemen WHERE nama_departemen = 'Marketing');

-- Marketing leader tidak dipakai lagi
UPDATE karyawan SET marketing_leader = false WHERE marketing_leader;

-- ---------------------------------------------------------------------
-- 5. Aturan komisi: tidak berlaku untuk job role "bisa jadi atasan"
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_allowance_tanpa_komisi(p_id_karyawan uuid, p_periode date) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
           SELECT 1 FROM karyawan k
           JOIN master_departemen d ON d.id = k.id_departemen
           LEFT JOIN master_jabatan j ON j.nama = k.jabatan
           WHERE k.id = p_id_karyawan AND d.nama_departemen = 'Marketing'
             AND NOT COALESCE(j.bisa_jadi_atasan, false))
     AND (SELECT count(*) FROM allowance a
          WHERE a.id_karyawan = p_id_karyawan AND a.komisi = 0
            AND a.periode IN ((date_trunc('month', p_periode) - interval '1 month')::date,
                              (date_trunc('month', p_periode) - interval '2 months')::date)) = 2
$$;

-- ---------------------------------------------------------------------
-- 6. Pendaftaran HP: job role "bisa jadi atasan" disembunyikan
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_opsi_registrasi() RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'atasan', COALESCE((SELECT json_agg(json_build_object('id', a.id, 'nama_lengkap', a.nama_lengkap) ORDER BY a.nama_lengkap)
               FROM karyawan a JOIN master_jabatan j ON j.nama = a.jabatan
               WHERE j.bisa_jadi_atasan AND a.is_aktif AND a.is_approved), '[]'::json),
    'jabatan', COALESCE((SELECT json_agg(json_build_object('nama', j.nama, 'departemen', d.nama_departemen) ORDER BY j.nama)
               FROM master_jabatan j JOIN master_departemen d ON d.id = j.id_departemen
               WHERE NOT j.bisa_jadi_atasan), '[]'::json),
    'lokasi', COALESCE((SELECT json_agg(json_build_object('id', l.id, 'nama', l.nama_cabang) ORDER BY l.nama_cabang)
               FROM master_lokasi l), '[]'::json)
  )
$$;

CREATE OR REPLACE FUNCTION fn_register_karyawan(p_nama text, p_departemen text, p_jabatan text, p_id_atasan uuid, p_id_lokasi uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_username text;
BEGIN
  IF length(trim(COALESCE(p_nama, ''))) < 2 THEN RAISE EXCEPTION 'NAMA_KOSONG'; END IF;
  IF EXISTS (SELECT 1 FROM master_jabatan WHERE nama = p_jabatan AND bisa_jadi_atasan) THEN
    RAISE EXCEPTION 'Job role % hanya bisa didaftarkan oleh admin.', p_jabatan;
  END IF;
  INSERT INTO karyawan (nama_lengkap, id_departemen, jabatan, id_atasan, id_lokasi, password, role, is_approved)
  VALUES (trim(p_nama), (SELECT id FROM master_departemen WHERE nama_departemen = p_departemen),
          p_jabatan, CASE WHEN p_departemen = 'Marketing' THEN p_id_atasan END, p_id_lokasi,
          'admin123', 'Karyawan', true)
  RETURNING username INTO v_username;
  RETURN json_build_object('username', v_username);
END $$;
-- Catatan: pendaftaran HP masih DITUTUP sejak 20261012 (EXECUTE fn_register_karyawan di-REVOKE).
-- CREATE OR REPLACE tidak mengubah hak akses, jadi tetap tertutup.

-- ---------------------------------------------------------------------
-- 7. Layar presensi: BM jadi kepala timnya sendiri di running text
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_layar_papan(p_id_lokasi uuid) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_hari_ini date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_awal date := date_trunc('month', (now() AT TIME ZONE 'Asia/Jakarta'))::date;
  v_hari_kerja int; v_top json; v_papan json; v_tim json; v_ob json;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;

  -- 5 scan terakhir hari ini di lokasi ini (masuk & pulang), terbaru di atas
  SELECT json_agg(t ORDER BY t.id DESC) INTO v_top FROM (
    SELECT l.id, k.nama_lengkap AS nama,
           CASE WHEN md.nama_departemen = 'Marketing' THEN 'Tim ' || split_part(COALESCE(ats.nama_lengkap, k.nama_lengkap), ' ', 1) ELSE k.jabatan END AS keterangan,
           l.jenis, l.waktu, l.status, l.telat_menit
    FROM log_scan l
    JOIN karyawan k ON k.id = l.id_karyawan
    LEFT JOIN master_departemen md ON md.id = k.id_departemen
    LEFT JOIN karyawan ats ON ats.id = k.id_atasan
    WHERE l.id_lokasi = p_id_lokasi AND k.is_aktif
      AND (l.waktu AT TIME ZONE 'Asia/Jakarta')::date = v_hari_ini
    ORDER BY l.id DESC
    LIMIT 5
  ) t;

  SELECT count(*) INTO v_hari_kerja FROM (
    SELECT tanggal FROM absensi
    WHERE tanggal BETWEEN v_awal AND v_hari_ini AND extract(isodow FROM tanggal) < 6
    GROUP BY tanggal HAVING count(*) >= 3
  ) h;

  SELECT json_agg(p ORDER BY p.hari_pertama DESC, p.rata_detik) INTO v_papan FROM (
    WITH hari_kerja AS (
      SELECT tanggal FROM absensi
      WHERE tanggal BETWEEN v_awal AND v_hari_ini AND extract(isodow FROM tanggal) < 6
      GROUP BY tanggal HAVING count(*) >= 3
    )
    SELECT k.nama_lengkap AS nama,
           CASE WHEN md.nama_departemen = 'Marketing' THEN 'Tim ' || split_part(COALESCE(ats.nama_lengkap, k.nama_lengkap), ' ', 1) ELSE k.jabatan END AS keterangan,
           count(*)::int AS hari_pertama,
           round(100.0 * count(*) / GREATEST(v_hari_kerja, 1))::int AS persen,
           round(avg(extract(epoch FROM (f.waktu_masuk AT TIME ZONE 'Asia/Jakarta')::time)))::int AS rata_detik
    FROM (
      -- orang pertama yang scan masuk per hari kerja di lokasi ini
      SELECT DISTINCT ON (a.tanggal) a.tanggal, a.id_karyawan, a.waktu_masuk
      FROM absensi a
      JOIN hari_kerja h ON h.tanggal = a.tanggal
      JOIN karyawan kk ON kk.id = a.id_karyawan AND kk.is_aktif
      WHERE a.id_lokasi = p_id_lokasi AND a.waktu_masuk IS NOT NULL
      ORDER BY a.tanggal, a.waktu_masuk
    ) f
    JOIN karyawan k ON k.id = f.id_karyawan
    LEFT JOIN master_departemen md ON md.id = k.id_departemen
    LEFT JOIN karyawan ats ON ats.id = k.id_atasan
    GROUP BY k.id, k.nama_lengkap, md.nama_departemen, ats.nama_lengkap, k.jabatan
    ORDER BY hari_pertama DESC, rata_detik
    LIMIT 5
  ) p;

  -- Kehadiran per tim hari ini (karyawan aktif yang lokasi kerjanya di sini).
  -- Hadir = sudah scan/absen masuk hari ini. Backoffice dihitung satu grup "BO".
  WITH anggota AS (
    SELECT k.id, d.nama_departemen AS dept,
           -- kepala tim: atasan langsung, atau dirinya sendiri kalau Business Manager
           CASE WHEN d.nama_departemen = 'Marketing' AND COALESCE(j.bisa_jadi_atasan, false) THEN k.id ELSE k.id_atasan END AS id_atasan
    FROM karyawan k
    JOIN master_departemen d ON d.id = k.id_departemen
    LEFT JOIN master_jabatan j ON j.nama = k.jabatan
    WHERE k.is_aktif AND k.is_approved AND k.id_lokasi = p_id_lokasi
  ), hadir AS (
    SELECT DISTINCT id_karyawan FROM absensi WHERE tanggal = v_hari_ini AND waktu_masuk IS NOT NULL
  ), grup AS (
    SELECT 'BO' AS nama, 0 AS urut, count(*)::int AS total, count(h.id_karyawan)::int AS hadir
    FROM anggota a LEFT JOIN hadir h ON h.id_karyawan = a.id WHERE a.dept = 'Backoffice'
    HAVING count(*) > 0
    UNION ALL
    SELECT 'Tim ' || split_part(l.nama_lengkap, ' ', 1), 1, count(*)::int, count(h.id_karyawan)::int
    FROM anggota a JOIN karyawan l ON l.id = a.id_atasan LEFT JOIN hadir h ON h.id_karyawan = a.id
    WHERE a.dept = 'Marketing'
    GROUP BY l.id, l.nama_lengkap
  )
  SELECT json_agg(json_build_object('nama', nama, 'hadir', hadir, 'total', total,
           'persen', round(100.0 * hadir / NULLIF(total, 0))::int) ORDER BY urut, nama)
  INTO v_tim FROM grup;

  -- OB (job role pakai shift) yang sedang bertugas: sudah masuk hari ini di lokasi ini & belum pulang
  SELECT json_agg(json_build_object('nama', k.nama_lengkap, 'shift', s.nama,
           'jam', to_char(s.jam_masuk, 'HH24.MI') || '–' || to_char(s.jam_pulang, 'HH24.MI'),
           'masuk', a.waktu_masuk) ORDER BY s.no, a.waktu_masuk)
  INTO v_ob
  FROM absensi a
  JOIN karyawan k ON k.id = a.id_karyawan
  JOIN master_shift s ON s.no = a.shift
  WHERE a.tanggal = v_hari_ini AND a.id_lokasi = p_id_lokasi
    AND a.waktu_masuk IS NOT NULL AND a.waktu_keluar IS NULL AND k.is_aktif;

  RETURN json_build_object(
    'tim', COALESCE(v_tim, '[]'::json),
    'ob', COALESCE(v_ob, '[]'::json),
    'top', COALESCE(v_top, '[]'::json),
    'papan', COALESCE(v_papan, '[]'::json),
    'hari_kerja', v_hari_kerja);
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Cek hasil (opsional):
-- SELECT k.nama_lengkap, k.jabatan, d.nama_departemen, k.id_atasan
-- FROM karyawan k JOIN master_departemen d ON d.id = k.id_departemen
-- WHERE k.jabatan IN ('Business Manager', 'Branch Manager', 'Vice President') ORDER BY k.jabatan, k.nama_lengkap;
