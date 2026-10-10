'use client';
import { useState, useEffect } from 'react';
import { Users, Clock, CalendarDays, Calendar, UserX } from 'lucide-react';
import { rentangPeriode } from '@/utils/waktu';
import { ambilKehadiran, hitungStatus } from '@/utils/kehadiran';
import { pesanError } from '@/utils/pesanError';

export default function Dashboard() {
  const [stats, setStats] = useState({ hadir: 0, telat: 0, izin: 0, bolos: 0 });
  const [periode, setPeriode] = useState('hari_ini');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const { mulai, sampai } = rentangPeriode(periode);
        const c = hitungStatus(await ambilKehadiran({ mulai, sampai }));
        if (batal) return;
        setStats({ hadir: c.Hadir, telat: c.Late, izin: c.Izin + c.Sakit + c.Cuti, bolos: c.Bolos });
        setError('');
      } catch (e) {
        if (!batal) setError(pesanError(e));
      }
      if (!batal) setLoading(false);
    })();
    return () => { batal = true; };
  }, [periode]);

  const kartu = [
    { judul: 'Hadir Tepat Waktu', nilai: stats.hadir, icon: Users, warna: 'bg-blue-50 text-blue-600' },
    { judul: 'Terlambat', nilai: stats.telat, icon: Clock, warna: 'bg-amber-50 text-amber-600' },
    { judul: 'Izin / Sakit / Cuti', nilai: stats.izin, icon: CalendarDays, warna: 'bg-sky-50 text-sky-600' },
    { judul: 'Bolos', nilai: stats.bolos, icon: UserX, warna: 'bg-rose-50 text-rose-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Utama</h1>
          <p className="text-slate-500 text-sm mt-1">Ringkasan aktivitas kehadiran karyawan (hari kerja, libur tidak dihitung).</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg">
          <Calendar className="w-4 h-4 text-slate-500" />
          <select value={periode} onChange={(e) => { setLoading(true); setPeriode(e.target.value); }} className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer">
            <option value="hari_ini">Filter: Hari Ini</option>
            <option value="bulan_ini">Filter: Bulan Ini</option>
            <option value="tahun_ini">Filter: Tahun Ini</option>
          </select>
        </div>
      </div>

      {error && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">Ringkasan belum bisa dimuat. {error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kartu.map(({ judul, nilai, icon: Icon, warna }) => (
          <div key={judul} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${warna}`}><Icon className="w-6 h-6" /></div>
              <div>
                <p className="text-slate-500 text-sm font-medium">{judul}</p>
                <h3 className="text-3xl font-black text-slate-900">{loading ? '...' : nilai}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
