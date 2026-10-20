-- =====================================================================
-- ALLOWANCE TANPA APPROVAL KARYAWAN
-- Jalankan sekali di Supabase SQL Editor (setelah 20261016b).
--
-- Aturan baru:
--   - Potongan dihapus (sudah termasuk di nominal allowance). Total = allowance + komisi.
--   - Departemen "allowance flat" (default: Backoffice): nominal otomatis dari
--     allowance khusus karyawan / job role. Departemen lain: nominal diisi admin tiap bulan.
--   - Aturan komisi (3 bulan tanpa komisi -> allowance 0) dihapus.
--   - Admin SIMPAN = langsung terkirim ke HP. Tidak ada approve karyawan & tidak ada finalisasi.
--     Admin masih boleh mengubah; HP ikut ter-update.
--   - Hanya karyawan yang SUDAH punya tanda tangan yang bisa disimpan. Tanda tangan
--     karyawan otomatis ditempel ke slip saat disimpan.
--   - Karyawan hanya boleh membuat tanda tangan sekali dari HP. Mengganti/menghapus hanya dari web admin.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Kolom baru
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'master_departemen' AND column_name = 'allowance_flat') THEN
    ALTER TABLE master_departemen ADD COLUMN allowance_flat boolean NOT NULL DEFAULT false;
    UPDATE master_departemen SET allowance_flat = true WHERE nama_departemen = 'Backoffice';
  END IF;
END $$;

-- Kapan karyawan terakhir membuka slip di HP (untuk tanda notifikasi baru)
ALTER TABLE allowance ADD COLUMN IF NOT EXISTS dilihat_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. Data lama ke alur baru
--    - Disetujui / Final           -> Terkirim (sudah ada tanda tangan)
--    - Terkirim tanpa salinan TTD   -> tempel TTD karyawan; kalau karyawan belum punya TTD -> Draft (belum terkirim)
-- ---------------------------------------------------------------------
UPDATE allowance SET status = 'TERKIRIM', dilihat_at = COALESCE(dilihat_at, disetujui_at, now())
WHERE status IN ('DISETUJUI', 'FINAL');

UPDATE allowance a SET ttd = k.ttd
FROM karyawan k
WHERE k.id = a.id_karyawan AND a.status = 'TERKIRIM' AND a.ttd IS NULL AND k.ttd IS NOT NULL;

UPDATE allowance SET status = 'DRAFT'
WHERE status = 'TERKIRIM' AND ttd IS NULL;

-- ---------------------------------------------------------------------
-- 3. Admin: daftar allowance satu periode
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_allowance_daftar(p_periode date) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_periode date := date_trunc('month', p_periode)::date; r json;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT COALESCE(json_agg(x ORDER BY x.departemen DESC, x.tim, x.nama), '[]'::json) INTO r FROM (
    SELECT k.id AS id_karyawan, k.nama_lengkap AS nama, k.nip, k.jabatan,
           d.nama_departemen AS departemen, COALESCE(d.allowance_flat, false) AS allowance_flat,
           CASE WHEN d.nama_departemen = 'Marketing' THEN COALESCE(ats.nama_lengkap, k.nama_lengkap) ELSE d.nama_departemen END AS tim,
           l.nama_cabang AS lokasi,
           COALESCE(k.allowance_khusus, j.allowance, 0) AS nominal_flat,
           a.id, a.nominal, a.potongan, a.komisi, a.total, a.catatan,
           COALESCE(a.status, 'BARU') AS status, a.versi, a.info, a.dikirim_at, a.dilihat_at,
           CASE WHEN a.status = 'TERKIRIM' THEN a.ttd END AS ttd,
           k.ttd IS NOT NULL AS punya_ttd, k.is_aktif
    FROM karyawan k
    LEFT JOIN allowance a ON a.id_karyawan = k.id AND a.periode = v_periode
    LEFT JOIN master_jabatan j ON j.nama = k.jabatan
    LEFT JOIN master_departemen d ON d.id = k.id_departemen
    LEFT JOIN karyawan ats ON ats.id = k.id_atasan
    LEFT JOIN master_lokasi l ON l.id = k.id_lokasi
    WHERE k.is_approved AND (k.is_aktif OR a.id IS NOT NULL)
  ) x;
  RETURN r;
END $$;

-- ---------------------------------------------------------------------
-- 4. Admin: simpan = kirim ke HP
--    p_data: [{ id_karyawan, nominal (hanya untuk departemen non-flat), komisi }]
--    Hasil : { dikirim, diperbarui, tidak_berubah, dilewati: [{ id_karyawan, alasan }] }
--    alasan: TTD_BELUM_ADA | ALLOWANCE_KOSONG
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_allowance_simpan(p_periode date, p_data jsonb) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_periode date := date_trunc('month', p_periode)::date;
  e jsonb; v_id uuid; v_kom bigint; v_nom bigint; v_flat boolean; v_ttd text; a allowance;
  n_baru int := 0; n_ubah int := 0; n_sama int := 0; v_lewat jsonb := '[]'::jsonb;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_data, '[]'::jsonb)) LOOP
    v_id  := (e->>'id_karyawan')::uuid;
    v_kom := COALESCE((e->>'komisi')::bigint, 0);

    SELECT k.ttd, COALESCE(d.allowance_flat, false), COALESCE(k.allowance_khusus, j.allowance, 0)
    INTO v_ttd, v_flat, v_nom
    FROM karyawan k
    LEFT JOIN master_departemen d ON d.id = k.id_departemen
    LEFT JOIN master_jabatan j ON j.nama = k.jabatan
    WHERE k.id = v_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF NOT v_flat THEN v_nom := (e->>'nominal')::bigint; END IF;
    IF v_ttd IS NULL THEN
      v_lewat := v_lewat || jsonb_build_object('id_karyawan', v_id, 'alasan', 'TTD_BELUM_ADA'); CONTINUE;
    END IF;
    IF v_nom IS NULL THEN
      v_lewat := v_lewat || jsonb_build_object('id_karyawan', v_id, 'alasan', 'ALLOWANCE_KOSONG'); CONTINUE;
    END IF;
    IF v_nom < 0 OR v_kom < 0 THEN RAISE EXCEPTION 'NOMINAL_MINUS'; END IF;

    SELECT * INTO a FROM allowance WHERE periode = v_periode AND id_karyawan = v_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO allowance (periode, id_karyawan, nominal, potongan, komisi, status, versi,
                             info, ttd, dikirim_at, allowance_hangus)
      VALUES (v_periode, v_id, v_nom, 0, v_kom, 'TERKIRIM', 1,
              fn_allowance_info(v_id), v_ttd, now(), false);
      n_baru := n_baru + 1;
    ELSIF a.status <> 'TERKIRIM' OR a.nominal IS DISTINCT FROM v_nom OR a.komisi IS DISTINCT FROM v_kom
          OR a.potongan <> 0 OR a.ttd IS DISTINCT FROM v_ttd THEN
      UPDATE allowance SET nominal = v_nom, potongan = 0, komisi = v_kom,
        status = 'TERKIRIM', versi = versi + 1, info = fn_allowance_info(v_id), ttd = v_ttd,
        dikirim_at = now(), dilihat_at = NULL, allowance_hangus = false, diubah_at = now()
      WHERE id = a.id;
      IF a.status = 'TERKIRIM' THEN n_ubah := n_ubah + 1; ELSE n_baru := n_baru + 1; END IF;
    ELSE
      n_sama := n_sama + 1;
    END IF;
  END LOOP;
  RETURN json_build_object('dikirim', n_baru, 'diperbarui', n_ubah, 'tidak_berubah', n_sama, 'dilewati', v_lewat);
END $$;

-- ---------------------------------------------------------------------
-- 5. HP karyawan
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_allowance_saya() RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid := fn_karyawan_sesi(); r json;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT COALESCE(json_agg(json_build_object(
           'id', a.id, 'periode', a.periode, 'nominal', a.nominal, 'potongan', a.potongan, 'komisi', a.komisi,
           'total', a.total, 'catatan', a.catatan, 'info', a.info, 'versi', a.versi,
           'dikirim_at', a.dikirim_at, 'ttd', a.ttd, 'baru', a.dilihat_at IS NULL)
         ORDER BY a.periode DESC), '[]'::json)
  INTO r
  FROM allowance a
  WHERE a.id_karyawan = v_id AND a.status = 'TERKIRIM';
  RETURN r;
END $$;

-- Tandai slip sudah dibuka di HP
CREATE OR REPLACE FUNCTION fn_allowance_dilihat(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid := fn_karyawan_sesi();
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  UPDATE allowance SET dilihat_at = now()
  WHERE id = p_id AND id_karyawan = v_id AND status = 'TERKIRIM' AND dilihat_at IS NULL;
END $$;

-- Tanda tangan dari HP hanya boleh dibuat sekali
CREATE OR REPLACE FUNCTION fn_ttd_saya_simpan(p_ttd text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid := fn_karyawan_sesi();
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  IF p_ttd IS NULL OR NOT fn_ttd_valid(p_ttd) THEN RAISE EXCEPTION 'TTD_TIDAK_VALID'; END IF;
  IF EXISTS (SELECT 1 FROM karyawan WHERE id = v_id AND ttd IS NOT NULL) THEN RAISE EXCEPTION 'TTD_SUDAH_ADA'; END IF;
  UPDATE karyawan SET ttd = p_ttd, ttd_diubah_at = now() WHERE id = v_id;
END $$;

-- ---------------------------------------------------------------------
-- 6. Fungsi alur lama tidak dipakai lagi
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_allowance_kirim(date, uuid[]);
DROP FUNCTION IF EXISTS fn_allowance_final(date, uuid[]);
DROP FUNCTION IF EXISTS fn_allowance_setujui(uuid, integer);
DROP FUNCTION IF EXISTS fn_allowance_nominal(uuid, date, bigint);
DROP FUNCTION IF EXISTS fn_allowance_hangus(uuid, date, bigint);
DROP FUNCTION IF EXISTS fn_allowance_tanpa_komisi(uuid, date);

-- ---------------------------------------------------------------------
-- 7. Hak akses API
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT EXECUTE ON FUNCTION fn_allowance_daftar(date), fn_allowance_simpan(date, jsonb),
      fn_allowance_saya(), fn_allowance_dilihat(uuid), fn_ttd_saya_simpan(text) TO anon, authenticated;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
