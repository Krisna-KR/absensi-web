import { supabase } from '@/utils/supabase/client';

// Label & gaya status kehadiran (sumber status: fungsi DB fn_kehadiran)
export const STATUS_KEHADIRAN = {
  'Hadir':       { label: 'Tepat Waktu', cls: 'bg-green-50 text-green-700 border-green-200' },
  'Late':        { label: 'Terlambat',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  'Izin':        { label: 'Izin',        cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  'Sakit':       { label: 'Sakit',       cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  'Cuti':        { label: 'Cuti',        cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  'Libur':       { label: 'Libur',       cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  'Bolos':       { label: 'Bolos',       cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  'Belum Absen': { label: 'Belum Absen', cls: 'bg-white text-slate-500 border-slate-300 border-dashed' },
};

export const JABATAN_BACKOFFICE = ['Business Manager', 'IT', 'Admin'];

/**
 * Ambil rekap kehadiran per karyawan per hari dari fn_kehadiran.
 * Dipaginasi per 1000 baris (batas default API Supabase).
 */
export async function ambilKehadiran({ mulai, sampai, idKaryawan = null }) {
  const hasil = [];
  const ukuran = 1000;
  for (let dari = 0; ; dari += ukuran) {
    const { data, error } = await supabase
      .rpc('fn_kehadiran', { p_mulai: mulai, p_sampai: sampai, p_id_karyawan: idKaryawan })
      .order('tanggal', { ascending: false })
      .order('nama_lengkap', { ascending: true })
      .order('id_karyawan', { ascending: true })
      .range(dari, dari + ukuran - 1);
    if (error) throw error;
    hasil.push(...(data || []));
    if (!data || data.length < ukuran) break;
  }
  return hasil;
}

export function hitungStatus(rows) {
  const c = { Hadir: 0, Late: 0, Izin: 0, Sakit: 0, Cuti: 0, Libur: 0, Bolos: 0, 'Belum Absen': 0 };
  for (const r of rows) if (c[r.status] !== undefined) c[r.status]++;
  return c;
}
