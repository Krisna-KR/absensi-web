-- =====================================================================
-- LAYAR PRESENSI: daftar kiri atas jadi "Absen terakhir" (5 scan terbaru
-- hari ini, masuk & pulang), bukan lagi 5 absen pertama.
-- Jalankan sekali di Supabase SQL Editor (setelah 20261013_layar_presensi.sql).
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_layar_papan(p_id_lokasi uuid) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_hari_ini date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_awal date := date_trunc('month', (now() AT TIME ZONE 'Asia/Jakarta'))::date;
  v_hari_kerja int; v_top json; v_papan json;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;

  -- 5 scan terakhir hari ini di lokasi ini (masuk & pulang), terbaru di atas
  SELECT json_agg(t ORDER BY t.id DESC) INTO v_top FROM (
    SELECT l.id, k.nama_lengkap AS nama,
           CASE WHEN md.nama_departemen = 'Marketing' THEN 'Tim ' || split_part(ats.nama_lengkap, ' ', 1) ELSE k.jabatan END AS keterangan,
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
           CASE WHEN md.nama_departemen = 'Marketing' THEN 'Tim ' || split_part(ats.nama_lengkap, ' ', 1) ELSE k.jabatan END AS keterangan,
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

  RETURN json_build_object(
    'top', COALESCE(v_top, '[]'::json),
    'papan', COALESCE(v_papan, '[]'::json),
    'hari_kerja', v_hari_kerja);
END $$;

NOTIFY pgrst, 'reload schema';
