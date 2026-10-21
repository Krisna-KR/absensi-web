-- =====================================================================
-- DAFTAR KARYAWAN TIDAK MASUK — perbaikan nama tim (lanjutan 20261021)
-- Jalankan sekali di Supabase SQL Editor. Aman dijalankan ulang.
--
-- Marketing tanpa atasan yang BUKAN kepala tim (job role tidak "bisa jadi atasan")
-- sekarang nama_tim = NULL, bukan namanya sendiri. Aplikasi menampilkannya sebagai
-- "Marketing tanpa atasan". Logika hitung hari tidak berubah.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_tidak_masuk(p_min_hari integer DEFAULT 1)
RETURNS TABLE (
  id_karyawan uuid, nama_lengkap text, nip text, jabatan text, nama_departemen text, nama_tim text,
  id_lokasi uuid, nama_lokasi text, terakhir_absen timestamptz, hari_kerja integer
)
LANGUAGE sql STABLE AS $$
  WITH s AS (
    SELECT CASE WHEN (now() AT TIME ZONE 'Asia/Jakarta')::time >= time '17:00'
                THEN (now() AT TIME ZONE 'Asia/Jakarta')::date
                ELSE (now() AT TIME ZONE 'Asia/Jakarta')::date - 1 END AS hari_akhir
  ),
  jumlah AS (
    SELECT a.tanggal, count(*) AS n
    FROM absensi a, s
    WHERE a.tanggal BETWEEN s.hari_akhir - 400 AND s.hari_akhir
    GROUP BY a.tanggal
  ),
  kerja AS (
    SELECT g::date AS tanggal
    FROM s, generate_series(s.hari_akhir - 400, s.hari_akhir, interval '1 day') g
    WHERE extract(isodow FROM g) < 6
      AND NOT EXISTS (SELECT 1 FROM master_libur ml WHERE ml.tanggal = g::date)
      AND COALESCE((SELECT j.n FROM jumlah j WHERE j.tanggal = g::date), 0) >= 3
  ),
  terakhir AS (
    SELECT DISTINCT ON (a.id_karyawan) a.id_karyawan, a.tanggal,
           COALESCE(a.waktu_masuk, a.waktu_keluar) AS waktu
    FROM absensi a
    WHERE a.waktu_masuk IS NOT NULL OR a.waktu_keluar IS NOT NULL
    ORDER BY a.id_karyawan, a.tanggal DESC
  ),
  hitung AS (
    SELECT k.id, t.waktu,
      (SELECT count(*)::int FROM kerja w
        WHERE w.tanggal > COALESCE(t.tanggal, (k.created_at AT TIME ZONE 'Asia/Jakarta')::date - 1)
          AND NOT EXISTS (
            SELECT 1 FROM izin_harian i
            WHERE i.id_karyawan = k.id AND i.tanggal = w.tanggal
              AND COALESCE(i.status_approval, 'Pending') <> 'Ditolak')
      ) AS hari
    FROM karyawan k
    LEFT JOIN terakhir t ON t.id_karyawan = k.id
    WHERE k.is_aktif IS TRUE AND k.is_approved IS TRUE
  )
  SELECT k.id, k.nama_lengkap, k.nip, k.jabatan, d.nama_departemen,
         CASE WHEN d.nama_departemen = 'Marketing' THEN COALESCE(ats.nama_lengkap,
           CASE WHEN EXISTS (SELECT 1 FROM master_jabatan mj WHERE mj.nama = k.jabatan AND mj.bisa_jadi_atasan) THEN k.nama_lengkap END)
         ELSE d.nama_departemen END,
         k.id_lokasi, l.nama_cabang, h.waktu, h.hari
  FROM hitung h
  JOIN karyawan k ON k.id = h.id
  LEFT JOIN master_departemen d ON d.id = k.id_departemen
  LEFT JOIN karyawan ats ON ats.id = k.id_atasan
  LEFT JOIN master_lokasi l ON l.id = k.id_lokasi
  WHERE h.hari >= GREATEST(COALESCE(p_min_hari, 1), 1)
  ORDER BY h.waktu ASC NULLS FIRST, h.hari DESC, k.nama_lengkap;
$$;

NOTIFY pgrst, 'reload schema';
