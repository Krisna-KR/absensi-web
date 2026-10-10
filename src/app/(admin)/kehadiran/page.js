'use client';
import { useState, useEffect, useMemo } from 'react';
import { LogIn, LogOut, Calendar, Filter } from 'lucide-react';
import { rentangPeriode, formatJam, formatTanggal } from '@/utils/waktu';
import { ambilKehadiran, STATUS_KEHADIRAN } from '@/utils/kehadiran';
import { pesanError } from '@/utils/pesanError';

export default function KehadiranPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periode, setPeriode] = useState('hari_ini');
  const [customDate, setCustomDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('semua');
  const [galat, setGalat] = useState('');

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

  const tampil = useMemo(() => {
    if (!rentang) return [];
    if (filterStatus === 'semua') return data.filter(r => r.status !== 'Libur');
    if (filterStatus === 'semua_libur') return data;
    return data.filter(r => r.status === filterStatus);
  }, [data, filterStatus, rentang]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rekap Kehadiran</h1>
          <p className="text-slate-500 text-sm mt-1">Status per karyawan per hari: hadir, terlambat, izin, sakit, cuti, libur, atau bolos.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-lg">
            <Calendar className="w-4 h-4 text-slate-500 ml-1" />
            <select value={periode} onChange={(e) => { setLoading(e.target.value !== 'custom'); setPeriode(e.target.value); setCustomDate(''); }} className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer">
              <option value="hari_ini">Hari Ini</option>
              <option value="bulan_ini">Bulan Ini</option>
              <option value="tahun_ini">Tahun Ini</option>
              <option value="custom">Pilih Tanggal...</option>
            </select>
            {periode === 'custom' && (
              <input type="date" value={customDate} onChange={(e) => { setLoading(!!e.target.value); setCustomDate(e.target.value); }} className="text-sm border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
            )}
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-lg">
            <Filter className="w-4 h-4 text-slate-500 ml-1" />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer">
              <option value="semua">Semua (tanpa Libur)</option>
              <option value="semua_libur">Semua (dengan Libur)</option>
              {Object.entries(STATUS_KEHADIRAN).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {galat && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">Data kehadiran belum bisa dimuat. {galat}</div>}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap min-w-[800px]">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Karyawan</th>
                <th className="px-6 py-4 font-semibold">Tanggal</th>
                <th className="px-6 py-4 font-semibold text-center">Masuk</th>
                <th className="px-6 py-4 font-semibold text-center">Keluar</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-500">Memuat data kehadiran...</td></tr>
              ) : tampil.length === 0 ? (
                <tr><td colSpan="6" className="px-6 py-12 text-center text-slate-500">{rentang ? 'Belum ada data untuk periode dan filter ini.' : 'Pilih tanggal terlebih dahulu.'}</td></tr>
              ) : (
                tampil.map((r) => {
                  const st = STATUS_KEHADIRAN[r.status] || { label: r.status, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
                  return (
                    <tr key={`${r.id_karyawan}-${r.tanggal}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{r.nama_lengkap}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{r.nip} · {r.jabatan || '-'}{r.nama_atasan ? ` · Team ${r.nama_atasan}` : ''}</p>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700">{formatTanggal(r.tanggal)}</td>
                      <td className="px-6 py-4 text-center">
                        {r.waktu_masuk ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 rounded-lg border border-green-200 font-bold text-xs">
                            <LogIn className="w-3 h-3" /> {formatJam(r.waktu_masuk)}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {r.waktu_keluar ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-rose-50 text-rose-700 rounded-lg border border-rose-200 font-bold text-xs">
                            <LogOut className="w-3 h-3" /> {formatJam(r.waktu_keluar)}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded border text-xs font-bold ${st.cls}`}>{st.label}</span>
                        {r.status === 'Late' && r.durasi_telat_menit > 0 && <span className="ml-2 text-xs text-amber-600 font-semibold">+{r.durasi_telat_menit} mnt</span>}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 max-w-[240px] truncate" title={r.keterangan || ''}>{r.keterangan || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
