-- Diagram struktur (Rekap -> Struktur -> tab Diagram)
-- Hanya informasi: garis A -> B ditarik manual, boleh lebih dari satu garis masuk ke satu orang,
-- tidak mengubah atasan, absensi, atau allowance. Isi awal disalin dari karyawan.id_atasan.

-- ---------- 1. Tabel ----------
CREATE TABLE IF NOT EXISTS public.diagram_struktur_kartu (
  id_karyawan uuid PRIMARY KEY REFERENCES public.karyawan(id) ON DELETE CASCADE,
  x numeric,                -- NULL = belum pernah digeser, posisi dihitung otomatis
  y numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.diagram_struktur_garis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dari uuid NOT NULL REFERENCES public.karyawan(id) ON DELETE CASCADE,
  ke uuid NOT NULL REFERENCES public.karyawan(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_diagram_garis UNIQUE (dari, ke),
  CONSTRAINT ck_diagram_garis_beda CHECK (dari <> ke)
);
CREATE INDEX IF NOT EXISTS ix_diagram_garis_ke ON public.diagram_struktur_garis (ke);

-- ---------- 2. Tolak garis yang membuat lingkaran (A -> B lalu B -> A, atau lebih panjang) ----------
CREATE OR REPLACE FUNCTION public.fn_diagram_garis_cek()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE turun(id) AS (
      SELECT NEW.ke
      UNION
      SELECT g.ke FROM diagram_struktur_garis g JOIN turun t ON g.dari = t.id
    )
    SELECT 1 FROM turun WHERE id = NEW.dari
  ) THEN
    RAISE EXCEPTION 'GARIS_MELINGKAR';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_diagram_garis_cek ON public.diagram_struktur_garis;
CREATE TRIGGER trg_diagram_garis_cek BEFORE INSERT OR UPDATE ON public.diagram_struktur_garis
  FOR EACH ROW EXECUTE FUNCTION public.fn_diagram_garis_cek();

-- ---------- 3. Hak akses: menu Rekap & struktur dapat aksi Edit ----------
CREATE OR REPLACE FUNCTION public.fn_menu_akses()
RETURNS TABLE (menu text, label text, aksi text[], urut int)
LANGUAGE sql IMMUTABLE AS $$
  VALUES
    ('dashboard', 'Dashboard',          ARRAY['lihat'],                          1),
    ('kehadiran', 'Kehadiran',          ARRAY['lihat'],                          2),
    ('karyawan',  'Karyawan',           ARRAY['lihat','tambah','ubah','hapus'],  3),
    ('rekap',     'Rekap & struktur',   ARRAY['lihat','ubah'],                   4),
    ('allowance', 'Allowance',          ARRAY['lihat','ubah'],                   5),
    ('master',    'Master data',        ARRAY['lihat','tambah','ubah','hapus'],  6),
    ('layar',     'Layar presensi',     ARRAY['lihat'],                          7),
    ('pengguna',  'Pengguna & hak akses', ARRAY['lihat','tambah','ubah','hapus'], 8)
$$;

-- ---------- 4. RLS: baca = admin login, tulis = Edit Rekap & struktur ----------
ALTER TABLE public.diagram_struktur_kartu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagram_struktur_garis ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['diagram_struktur_kartu', 'diagram_struktur_garis'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_lihat ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_tambah ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_ubah ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS admin_hapus ON public.%I', t);
    EXECUTE format('CREATE POLICY admin_lihat ON public.%I FOR SELECT USING ((SELECT fn_admin_aktif()))', t);
    EXECUTE format('CREATE POLICY admin_tambah ON public.%I FOR INSERT WITH CHECK ((SELECT fn_admin_boleh(''rekap'', ''ubah'')))', t);
    EXECUTE format('CREATE POLICY admin_ubah ON public.%I FOR UPDATE USING ((SELECT fn_admin_boleh(''rekap'', ''ubah''))) WITH CHECK ((SELECT fn_admin_boleh(''rekap'', ''ubah'')))', t);
    EXECUTE format('CREATE POLICY admin_hapus ON public.%I FOR DELETE USING ((SELECT fn_admin_boleh(''rekap'', ''ubah'')))', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
  END LOOP;
END $$;

-- ---------- 5. Karyawan baru otomatis masuk diagram, tersambung ke atasannya ----------
CREATE OR REPLACE FUNCTION public.fn_diagram_karyawan_baru()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO diagram_struktur_kartu (id_karyawan) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  IF NEW.id_atasan IS NOT NULL THEN
    INSERT INTO diagram_struktur_kartu (id_karyawan) VALUES (NEW.id_atasan) ON CONFLICT DO NOTHING;
    BEGIN
      INSERT INTO diagram_struktur_garis (dari, ke) VALUES (NEW.id_atasan, NEW.id) ON CONFLICT DO NOTHING;
    EXCEPTION WHEN raise_exception THEN NULL;   -- garis melingkar: lewati, simpan karyawan tetap jalan
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_karyawan_diagram_baru ON public.karyawan;
CREATE TRIGGER trg_karyawan_diagram_baru AFTER INSERT ON public.karyawan
  FOR EACH ROW EXECUTE FUNCTION public.fn_diagram_karyawan_baru();

-- ---------- 6. Kembalikan diagram ke struktur atasan (tombol di tab Diagram) ----------
CREATE OR REPLACE FUNCTION public.fn_diagram_reset()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM fn_wajib_akses('rekap', 'ubah');
  DELETE FROM diagram_struktur_garis WHERE true;
  DELETE FROM diagram_struktur_kartu WHERE true;
  INSERT INTO diagram_struktur_kartu (id_karyawan)
    SELECT id FROM karyawan WHERE is_aktif AND is_approved
    UNION
    SELECT id_atasan FROM karyawan WHERE is_aktif AND is_approved AND id_atasan IS NOT NULL;
  INSERT INTO diagram_struktur_garis (dari, ke)
    SELECT id_atasan, id FROM karyawan WHERE is_aktif AND is_approved AND id_atasan IS NOT NULL
    ON CONFLICT DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.fn_diagram_reset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_diagram_reset() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_diagram_karyawan_baru() FROM PUBLIC, anon, authenticated;

-- ---------- 7. Isi awal = struktur atasan sekarang ----------
INSERT INTO public.diagram_struktur_kartu (id_karyawan)
  SELECT id FROM public.karyawan WHERE is_aktif AND is_approved
  UNION
  SELECT id_atasan FROM public.karyawan WHERE is_aktif AND is_approved AND id_atasan IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.diagram_struktur_garis (dari, ke)
  SELECT id_atasan, id FROM public.karyawan WHERE is_aktif AND is_approved AND id_atasan IS NOT NULL
ON CONFLICT DO NOTHING;
