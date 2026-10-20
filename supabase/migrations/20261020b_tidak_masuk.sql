-- =====================================================================
-- DAFTAR KARYAWAN TIDAK MASUK >= N HARI KERJA (default 7)
-- Jalankan sekali di Supabase SQL Editor.
--
-- Hari kerja = Senin-Jumat, bukan tanggal di master_libur, dan bukan hari "libur"
-- versi aplikasi (kurang dari 3 orang absen, sama seperti status Libur di Kehadiran).
-- Hari Cuti karyawan tsb tidak dihitung. Hari ini tidak dihitung (belum selesai).
-- "Masuk" = ada scan / input masuk atau pulang di tabel absensi.
-- Hanya bisa dibaca sesi admin (RLS tabel).
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_tidak_masuk(p_min_hari integer DEFAULT 7)
RETURNS TABLE (
  id_karyawan uuid, nama_lengkap text, nip text, jabatan text, nama_departemen text, nama_tim text,
  id_lokasi uuid, nama_lokasi text, terakhir_absen timestamptz, hari_kerja integer
)
LANGUAGE sql STABLE AS $$
  WITH s AS (
    SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS hari_ini
  ),
  jumlah AS (
    SELECT a.tanggal, count(*) AS n FROM absensi a, s
    WHERE a.tanggal BETWEEN s.hari_ini - 400 AND s.hari_ini - 1
    GROUP BY a.tanggal
  ),
  kerja AS (
    SELECT g::date AS tanggal
    FROM s, generate_series(s.hari_ini - 400, s.hari_ini - 1, interval '1 day') g
    WHERE extract(isodow FROM g) < 6
      AND NOT EXISTS (SELECT 1 FROM master_libur ml WHERE ml.tanggal = g::date)
      AND COALESCE((SELECT j.n FROM jumlah j WHERE j.tanggal = g::date), 0) >= 3
  ),
  terakhir AS (
    SELECT DISTINCT ON (a.id_karyawan) a.id_karyawan, a.tanggal, COALESCE(a.waktu_masuk, a.waktu_keluar) AS waktu
    FROM absensi a
    WHERE a.waktu_masuk IS NOT NULL OR a.waktu_keluar IS NOT NULL
    ORDER BY a.id_karyawan, a.tanggal DESC
  ),
  hitung AS (
    SELECT k.id,
           t.waktu,
           (SELECT count(*)::int FROM kerja w
            WHERE w.tanggal > COALESCE(t.tanggal, (k.created_at AT TIME ZONE 'Asia/Jakarta')::date - 1)
              AND NOT EXISTS (SELECT 1 FROM izin_harian i
                              WHERE i.id_karyawan = k.id AND i.tanggal = w.tanggal AND i.jenis = 'Cuti'
                                AND COALESCE(i.status_approval, 'Pending') <> 'Ditolak')) AS hari
    FROM karyawan k
    LEFT JOIN terakhir t ON t.id_karyawan = k.id
    WHERE k.is_aktif IS TRUE AND k.is_approved IS TRUE
  )
  SELECT k.id, k.nama_lengkap, k.nip, k.jabatan, d.nama_departemen,
         CASE WHEN d.nama_departemen = 'Marketing' THEN COALESCE(ats.nama_lengkap, k.nama_lengkap) ELSE d.nama_departemen END,
         k.id_lokasi, l.nama_cabang, h.waktu, h.hari
  FROM hitung h
  JOIN karyawan k ON k.id = h.id
  LEFT JOIN master_departemen d ON d.id = k.id_departemen
  LEFT JOIN karyawan ats ON ats.id = k.id_atasan
  LEFT JOIN master_lokasi l ON l.id = k.id_lokasi
  WHERE h.hari >= COALESCE(p_min_hari, 7)
  ORDER BY h.hari DESC, k.nama_lengkap;
$$;

NOTIFY pgrst, 'reload schema';
