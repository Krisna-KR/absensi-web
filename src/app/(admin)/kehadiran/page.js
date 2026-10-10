'use client';
import { useState, useEffect, useMemo } from 'react';
import { LogIn, LogOut, Calendar, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { rentangPeriode, formatJam, formatTanggal } from '@/utils/waktu';
import { ambilKehadiran, STATUS_KEHADIRAN } from '@/utils/kehadiran';
import { pesanError } from '@/utils/pesanError';
import { useUrutan, urutkan, KolomUrut } from '@/components/TabelSort';

const PER_HALAMAN = 50;

// Filter status: "Izin/Sakit/Cuti" digabung agar chip tidak terlalu banyak
const FILTER_STATUS = [
  { key: 'semua', label: 'Semua', cocok: r => r.status !== 'Libur' },
  { key: 'Hadir', label: 'Tepat Waktu', cocok: r => r.status === 'Hadir' },
  { key: 'Late', label: 'Terlambat', cocok: r => r.status === 'Late' },
  { key: 'izin', label: 'Izin / Sakit / Cuti', cocok: r => ['Izin', 'Sakit', 'Cuti'].includes(r.status) },
  { key: 'Bolos', label: 'Bolos', cocok: r => r.status === 'Bolos' },
  { key: 'Belum Absen', label: 'Belum Absen', cocok: r => r.status === 'Belum Absen' },
  { key: 'Libur', label: 'Libur', cocok: r => r.status === 'Libur' },
];

const URUTAN_STATUS = ['Hadir', 'Late', 'Izin', 'Sakit', 'Cuti', 'Belum Absen', 'Bolos', 'Libur'];
const AKSES_URUT = {
  nama: r => r.nama_lengkap,
  tanggal: r => r.tanggal,
  masuk: r => r.waktu_masuk ? new Date(r.waktu_masuk).getTime() : null,
  keluar: r => r.waktu_keluar ? new Date(r.waktu_keluar).getTime() : null,
  status: r => URUTAN_STATUS.indexOf(r.status),
};

export default function KehadiranPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periode, setPeriode] = useState('hari_ini');
  const [customDate, setCustomDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('semua');
  const [cari, setCari] = useState('');
  const [halaman, setHalaman] = useState(1);
  const [galat, setGalat] = useState('');
  const [urut, gantiUrut] = useUrutan({ kunci: 'tanggal', arah: 'desc' });

  const rentang = useMemo(() => rentangPeriode(periode, customDate), [periode, customDate]);

  useEffect(() => {
    if (!rentang) return;
    let batal = false;
    (async () => {
      try {
        const rows = await ambilKehadiran(rentang);
        if (!batal) { setData(rows); setGalat(''); }
      } catch (e) {
        if (!batal) { setGalat(pesanError(e)); setData([]); }
      }
      if (!batal) setLoading(false);
    })();
    return () => { batal = true; };
  }, [rentang]);

  const hasilCari = useMemo(() => {
    if (!rentang) return [];
    const q = cari.trim().toLowerCase();
    return q ? data.filter(r => r.nama_lengkap?.toLowerCase().includes(q) || r.nip?.toLowerCase().includes(q)) : data;
  }, [data, cari, rentang]);

  const jumlah = useMemo(() => Object.fromEntries(FILTER_STATUS.map(f => [f.key, hasilCari.filter(f.cocok).length])), [hasilCari]);

  const tampil = useMemo(() => {
    const f = FILTER_STATUS.find(x => x.key === filterStatus) || FILTER_STATUS[0];
    return urutkan(hasilCari.filter(f.cocok), urut, AKSES_URUT);
  }, [hasilCari, filterStatus, urut]);

  const totalHalaman = Math.max(1, Math.ceil(tampil.length / PER_HALAMAN));
  const halamanAktif = Math.min(halaman, totalHalaman);
  const potongan = tampil.slice((halamanAktif - 1) * PER_HALAMAN, halamanAktif * PER_HALAMAN);

  const gantiPeriode = (v) => { setLoading(v !== 'custom'); setPeriode(v); setCustomDate(''); setHalaman(1); };
  const urutKolom = (k) => { gantiUrut(k); setHalaman(1); };
  const kolom = { urut, onUrut: urutKolom };

  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Rekap Kehadiran</h1>
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="search" value={cari} onChange={e => { setCari(e.target.value); setHalaman(1); }} placeholder="Cari nama atau NIP"
                className="w-full sm:w-56 pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none" />
            </label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
              <Calendar className="w-4 h-4 text-slate-500" />
              <select value={periode} onChange={e => gantiPeriode(e.target.value)} className="bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer">
                <option value="hari_ini">Hari ini</option>
                <option value="bulan_ini">Bulan ini</option>
                <option value="tahun_ini">Tahun ini</option>
                <option value="custom">Pilih tanggal</option>
              </select>
              {periode === 'custom' && (
                <input type="date" value={customDate} onChange={e => { setLoading(!!e.target.value); setCustomDate(e.target.value); setHalaman(1); }}
                  className="text-sm border border-slate-300 rounded px-2 py-0.5 bg-white outline-none focus:ring-2 focus:ring-blue-100" />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter status">
          {FILTER_STATUS.map(f => {
            const aktif = filterStatus === f.key;
            return (
              <button key={f.key} role="tab" aria-selected={aktif} onClick={() => { setFilterStatus(f.key); setHalaman(1); }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-colors ${aktif ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {f.label}
                <span className={`text-xs tabular-nums px-1.5 rounded-full ${aktif ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{loading ? '·' : jumlah[f.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {galat && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">Data kehadiran belum bisa dimuat. {galat}</div>}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap min-w-[820px]">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs">
              <tr>
                <KolomUrut kunci="nama" {...kolom}>Karyawan</KolomUrut>
                <KolomUrut kunci="tanggal" {...kolom}>Tanggal</KolomUrut>
                <KolomUrut kunci="masuk" {...kolom} className="text-center">Masuk</KolomUrut>
                <KolomUrut kunci="keluar" {...kolom} className="text-center">Pulang</KolomUrut>
                <KolomUrut kunci="status" {...kolom}>Status</KolomUrut>
                <th className="px-6 py-3 font-semibold">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan="6" className="px-6 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${60 + (i % 3) * 12}%` }} /></td></tr>
                ))
              ) : potongan.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-16 text-center text-slate-500">
                  {!rentang ? 'Pilih tanggal dulu.' : cari ? `Tidak ada karyawan yang cocok dengan "${cari}".` : 'Belum ada data untuk periode dan filter ini.'}
                </td></tr>
              ) : potongan.map(r => {
                const st = STATUS_KEHADIRAN[r.status] || { label: r.status, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
                return (
                  <tr key={`${r.id_karyawan}-${r.tanggal}`} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-slate-900">{r.nama_lengkap}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="font-mono">{r.nip}</span>
                        {r.jabatan && <span> · {r.jabatan}</span>}
                        {r.nama_atasan && <span> · Tim {r.nama_atasan}</span>}
                        {r.nama_lokasi && <span> · {r.nama_lokasi}</span>}
                      </p>
                    </td>
                    <td className="px-6 py-3 text-slate-700">{formatTanggal(r.tanggal)}</td>
                    <td className="px-6 py-3 text-center">
                      {r.waktu_masuk ? (
                        <span title={r.status === 'Late' ? 'Masuk terlambat' : 'Masuk tepat waktu'}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm font-semibold tabular-nums ${r.status === 'Late' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                          <LogIn className="w-4 h-4" />{formatJam(r.waktu_masuk)}
                        </span>
                      ) : <span className="text-slate-300">–</span>}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {r.waktu_keluar ? (
                        <span title="Jam pulang" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-white text-sm font-semibold tabular-nums">
                          <LogOut className="w-4 h-4" />{formatJam(r.waktu_keluar)}
                        </span>
                      ) : <span className="text-slate-300">–</span>}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded-md border text-xs font-semibold ${st.cls}`}>{st.label}</span>
                      {r.status === 'Late' && r.durasi_telat_menit > 0 && <span className="ml-2 text-xs text-slate-500 tabular-nums">+{r.durasi_telat_menit} mnt</span>}
                      {r.status === 'Late' && !r.waktu_masuk && <span className="ml-2 text-xs text-slate-500">tanpa absen masuk</span>}
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500 max-w-[240px] truncate" title={r.keterangan || ''}>{r.keterangan || '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && tampil.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span className="tabular-nums">
              {(halamanAktif - 1) * PER_HALAMAN + 1}–{Math.min(halamanAktif * PER_HALAMAN, tampil.length)} dari {tampil.length} baris
            </span>
            {totalHalaman > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setHalaman(halamanAktif - 1)} disabled={halamanAktif === 1} aria-label="Halaman sebelumnya"
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                <span className="px-2 tabular-nums">{halamanAktif} / {totalHalaman}</span>
                <button onClick={() => setHalaman(halamanAktif + 1)} disabled={halamanAktif === totalHalaman} aria-label="Halaman berikutnya"
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
