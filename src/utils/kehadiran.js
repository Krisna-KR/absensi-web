import { supabase } from '@/utils/supabase/client';

// Warna grafik per kelompok status (palet tervalidasi untuk buta warna, urutan tetap)
export const WARNA_STATUS = {
  Hadir: '#2a78d6',  // biru
  Late:  '#eb6834',  // oranye
  Izin:  '#6250d6',  // ungu (Izin, Sakit, Cuti)
  Bolos: '#e34948',  // merah
};

// Label & gaya badge status kehadiran (sumber status: fungsi DB fn_kehadiran)
export const STATUS_KEHADIRAN = {
  'Hadir':       { label: 'Tepat Waktu', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  'Late':        { label: 'Terlambat',   cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  'Izin':        { label: 'Izin',        cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  'Sakit':       { label: 'Sakit',       cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  'Cuti':        { label: 'Cuti',        cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  'Libur':       { label: 'Libur',       cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  'Bolos':       { label: 'Alpha',       cls: 'bg-red-50 text-red-700 border-red-200' },
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

/** Nama kelompok untuk tampilan per tim: Backoffice, atau "Tim <kepala tim>" untuk Marketing */
export function namaTim(r) {
  if (r.nama_departemen === 'Marketing') return `Tim ${r.nama_atasan || r.nama_lengkap}`;
  return r.nama_departemen || 'Tanpa departemen';
}

/** Urutan kelompok: divisi A-Z (Backoffice, Marketing), lalu nama tim A-Z. Tanpa departemen paling akhir. */
export function bandingTim(a, b) {
  const da = a.divisi || '\uffff', db = b.divisi || '\uffff';
  return da.localeCompare(db, 'id') || a.nama.localeCompare(b.nama, 'id');
}

/** Kelompokkan baris (punya nama_departemen, nama_atasan, nama_lengkap) per tim, sudah terurut. */
export function kelompokPerTim(rows) {
  const peta = new Map();
  for (const r of rows) {
    const nama = namaTim(r);
    const key = `${r.nama_departemen || ''}|${nama}`;
    if (!peta.has(key)) peta.set(key, { key, nama, divisi: r.nama_departemen || null, rows: [] });
    peta.get(key).rows.push(r);
  }
  return [...peta.values()].sort(bandingTim);
}

/** 8 -> '1 minggu 3 hari' (1 minggu = 5 hari kerja) */
export function formatHariKerja(n) {
  const minggu = Math.floor(n / 5), hari = n % 5;
  return [minggu && `${minggu} minggu`, hari && `${hari} hari`].filter(Boolean).join(' ') || '0 hari';
}
