-- OPSIONAL: batas telat jadi 09.00 (sesuai Excel: datang <= 09:00:59 = On Time), lalu hitung ulang semua absen.
BEGIN;
CREATE OR REPLACE FUNCTION fn_absensi_hitung() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_jam time;
BEGIN
  IF NEW.id_lokasi IS NULL THEN
    SELECT id_lokasi INTO NEW.id_lokasi FROM karyawan WHERE id = NEW.id_karyawan;
  END IF;
  IF NEW.waktu_masuk IS NULL THEN
    NEW.tanggal := (NEW.waktu_keluar AT TIME ZONE 'Asia/Jakarta')::date;
    NEW.status := 'Late';
    NEW.durasi_telat_menit := NULL;
  ELSE
    NEW.tanggal := (NEW.waktu_masuk AT TIME ZONE 'Asia/Jakarta')::date;
    v_jam := (NEW.waktu_masuk AT TIME ZONE 'Asia/Jakarta')::time;
    IF v_jam >= time '09:01' THEN
      NEW.status := 'Late';
      NEW.durasi_telat_menit := floor(extract(epoch FROM (v_jam - time '09:00')) / 60)::int;
    ELSE
      NEW.status := 'Hadir';
      NEW.durasi_telat_menit := 0;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
-- hitung ulang status semua absen yang sudah ada
UPDATE absensi SET waktu_masuk = waktu_masuk WHERE waktu_masuk IS NOT NULL;
COMMIT;
