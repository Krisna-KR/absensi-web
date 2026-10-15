-- =====================================================================
-- 1. Aturan allowance Marketing: kalau komisi bulan ini 0 DAN 2 bulan
--    sebelumnya juga tercatat komisi 0, allowance bulan ini jadi Rp 0.
--    Contoh: Okt & Nov komisi 0 -> Des allowance 0, kecuali Des diisi komisi.
--    Bulan yang belum punya data allowance tidak dihitung (karyawan baru / sebelum aplikasi dipakai).
-- 2. Layar presensi: kehadiran per tim (running text) + OB yang sedang bertugas.
-- Jalankan sekali di Supabase SQL Editor (setelah 20261015_allowance_shift_ob.sql).
-- =====================================================================
BEGIN;

ALTER TABLE allowance ADD COLUMN IF NOT EXISTS allowance_hangus boolean NOT NULL DEFAULT false;

-- Marketing & 2 bulan sebelumnya tercatat tanpa komisi
CREATE OR REPLACE FUNCTION fn_allowance_tanpa_komisi(p_id_karyawan uuid, p_periode date) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
           SELECT 1 FROM karyawan k JOIN master_departemen d ON d.id = k.id_departemen
           WHERE k.id = p_id_karyawan AND d.nama_departemen = 'Marketing')
     AND (SELECT count(*) FROM allowance a
          WHERE a.id_karyawan = p_id_karyawan AND a.komisi = 0
            AND a.periode IN ((date_trunc('month', p_periode) - interval '1 month')::date,
                              (date_trunc('month', p_periode) - interval '2 months')::date)) = 2
$$;

CREATE OR REPLACE FUNCTION fn_allowance_hangus(p_id_karyawan uuid, p_periode date, p_komisi bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(p_komisi, 0) = 0 AND fn_allowance_tanpa_komisi(p_id_karyawan, p_periode)
$$;

-- Nominal allowance bulan ini setelah aturan komisi
CREATE OR REPLACE FUNCTION fn_allowance_nominal(p_id_karyawan uuid, p_periode date, p_komisi bigint) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN fn_allowance_hangus(p_id_karyawan, p_periode, p_komisi) THEN 0
              ELSE fn_allowance_dasar(p_id_karyawan) END
$$;

CREATE OR REPLACE FUNCTION fn_allowance_daftar(p_periode date) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_periode date := date_trunc('month', p_periode)::date; r json;
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT COALESCE(json_agg(x ORDER BY x.departemen DESC, x.tim, x.nama), '[]'::json) INTO r FROM (
    SELECT k.id AS id_karyawan, k.nama_lengkap AS nama, k.nip, k.jabatan,
           d.nama_departemen AS departemen,
           CASE WHEN d.nama_departemen = 'Marketing' THEN ats.nama_lengkap ELSE d.nama_departemen END AS tim,
           l.nama_cabang AS lokasi,
           j.allowance AS allowance_jabatan, k.allowance_khusus,
           COALESCE(k.allowance_khusus, j.allowance, 0) AS nominal_sekarang,
           fn_allowance_tanpa_komisi(k.id, v_periode) AS tanpa_komisi_2_bulan, a.allowance_hangus,
           a.id, a.nominal, a.potongan, a.komisi, a.total, a.catatan, COALESCE(a.status, 'BARU') AS status, a.versi,
           a.info, a.dikirim_at, a.disetujui_at, a.final_at,
           CASE WHEN a.status IN ('DISETUJUI', 'FINAL') THEN a.ttd END AS ttd,
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

CREATE OR REPLACE FUNCTION fn_allowance_simpan(p_periode date, p_data jsonb) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_periode date := date_trunc('month', p_periode)::date;
  e jsonb; v_id uuid; v_pot bigint; v_kom bigint; v_cat text; v_nom bigint; a allowance;
  n_simpan int := 0; n_ulang int := 0; v_lewat text[] := '{}';
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_data, '[]'::jsonb)) LOOP
    v_id  := (e->>'id_karyawan')::uuid;
    v_pot := COALESCE((e->>'potongan')::bigint, 0);
    v_kom := COALESCE((e->>'komisi')::bigint, 0);
    v_cat := NULLIF(trim(e->>'catatan'), '');
    v_nom := fn_allowance_nominal(v_id, v_periode, v_kom);
    IF v_pot < 0 OR v_kom < 0 THEN RAISE EXCEPTION 'NOMINAL_MINUS'; END IF;
    IF v_nom - v_pot + v_kom < 0 THEN RAISE EXCEPTION 'TOTAL_MINUS'; END IF;

    SELECT * INTO a FROM allowance WHERE periode = v_periode AND id_karyawan = v_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO allowance (periode, id_karyawan, nominal, potongan, komisi, catatan, allowance_hangus)
      VALUES (v_periode, v_id, v_nom, v_pot, v_kom, v_cat, fn_allowance_hangus(v_id, v_periode, v_kom));
      n_simpan := n_simpan + 1;
    ELSIF a.status IN ('DISETUJUI', 'FINAL') THEN
      v_lewat := v_lewat || v_id::text;
    ELSIF a.potongan IS DISTINCT FROM v_pot OR a.komisi IS DISTINCT FROM v_kom
          OR a.nominal IS DISTINCT FROM v_nom OR a.catatan IS DISTINCT FROM v_cat THEN
      UPDATE allowance SET nominal = v_nom, potongan = v_pot, komisi = v_kom, catatan = v_cat, diubah_at = now(),
        allowance_hangus = fn_allowance_hangus(v_id, v_periode, v_kom),
        versi = CASE WHEN status = 'TERKIRIM' THEN versi + 1 ELSE versi END,
        dikirim_at = CASE WHEN status = 'TERKIRIM' THEN now() ELSE dikirim_at END,
        info = CASE WHEN status = 'TERKIRIM' THEN fn_allowance_info(v_id) ELSE info END
      WHERE id = a.id;
      IF a.status = 'TERKIRIM' THEN n_ulang := n_ulang + 1; ELSE n_simpan := n_simpan + 1; END IF;
    END IF;
  END LOOP;
  RETURN json_build_object('disimpan', n_simpan, 'dikirim_ulang', n_ulang, 'dilewati', to_json(v_lewat));
END $$;

CREATE OR REPLACE FUNCTION fn_allowance_kirim(p_periode date, p_id_karyawan uuid[]) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_periode date := date_trunc('month', p_periode)::date;
  v_id uuid; a allowance; v_nom bigint; n int := 0; v_lewat text[] := '{}';
BEGIN
  IF NOT fn_admin_aktif() THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  FOREACH v_id IN ARRAY COALESCE(p_id_karyawan, '{}') LOOP
    SELECT * INTO a FROM allowance WHERE periode = v_periode AND id_karyawan = v_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO allowance (periode, id_karyawan, nominal) VALUES (v_periode, v_id, 0) RETURNING * INTO a;
    END IF;
    v_nom := fn_allowance_nominal(v_id, v_periode, a.komisi);
    IF a.status IN ('DISETUJUI', 'FINAL') THEN v_lewat := v_lewat || v_id::text; CONTINUE; END IF;
    IF v_nom - a.potongan + a.komisi < 0 THEN v_lewat := v_lewat || v_id::text; CONTINUE; END IF;
    UPDATE allowance SET status = 'TERKIRIM', nominal = v_nom, versi = versi + 1, dikirim_at = now(),
      allowance_hangus = fn_allowance_hangus(v_id, v_periode, a.komisi),
      diubah_at = now(), info = fn_allowance_info(v_id)
    WHERE id = a.id;
    n := n + 1;
  END LOOP;
  RETURN json_build_object('dikirim', n, 'dilewati', to_json(v_lewat));
END $$;

CREATE OR REPLACE FUNCTION fn_allowance_saya() RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid := fn_karyawan_sesi(); r json;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'SESI_HABIS'; END IF;
  SELECT COALESCE(json_agg(json_build_object(
           'id', a.id, 'periode', a.periode, 'nominal', a.nominal, 'potongan', a.potongan, 'komisi', a.komisi,
           'total', a.total, 'catatan', a.catatan, 'allowance_hangus', a.allowance_hangus, 'status', a.status, 'versi', a.versi, 'info', a.info,
           'dikirim_at', a.dikirim_at, 'disetujui_at', a.disetujui_at, 'final_at', a.final_at,
           'ttd', CASE WHEN a.status IN ('DISETUJUI', 'FINAL') THEN a.ttd END)
         ORDER BY a.periode DESC), '[]'::json)
  INTO r
  FROM allowance a
  WHERE a.id_karyawan = v_id AND a.status IN ('TERKIRIM', 'DISETUJUI', 'FINAL');
  RETURN r;
END $$;

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

  -- Kehadiran per tim hari ini (karyawan aktif yang lokasi kerjanya di sini).
  -- Hadir = sudah scan/absen masuk hari ini. Backoffice dihitung satu grup "BO".
  WITH anggota AS (
    SELECT k.id, d.nama_departemen AS dept, k.id_atasan
    FROM karyawan k JOIN master_departemen d ON d.id = k.id_departemen
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION fn_allowance_tanpa_komisi(uuid, date), fn_allowance_hangus(uuid, date, bigint),
      fn_allowance_nominal(uuid, date, bigint) FROM public, anon, authenticated;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
