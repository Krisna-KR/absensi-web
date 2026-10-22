-- =====================================================================
-- ROLLBACK untuk 20261021c_rls_tutup_akses_publik.sql
-- Mengembalikan 5 policy publik persis seperti kondisi 21-10-2026 (dicek dari pg_policies).
-- Hanya dijalankan kalau setelah DROP ada fitur yang rusak. Ini membuka lagi celah keamanannya.
-- =====================================================================
BEGIN;

DROP POLICY IF EXISTS "Allow public all absensi"     ON public.absensi;
DROP POLICY IF EXISTS "Allow public all karyawan"    ON public.karyawan;
DROP POLICY IF EXISTS "Allow public insert karyawan" ON public.karyawan;
DROP POLICY IF EXISTS "Allow public select karyawan" ON public.karyawan;
DROP POLICY IF EXISTS "Allow public update karyawan" ON public.karyawan;

CREATE POLICY "Allow public all absensi" ON public.absensi
  AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all karyawan" ON public.karyawan
  AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow public insert karyawan" ON public.karyawan
  AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public select karyawan" ON public.karyawan
  AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Allow public update karyawan" ON public.karyawan
  AS PERMISSIVE FOR UPDATE TO public USING (true);

COMMIT;
