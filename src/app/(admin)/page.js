'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Users, Clock, CalendarDays, Calendar } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({ hadir: 0, telat: 0, cutiIzin: 0 });
  const [periode, setPeriode] = useState('hari_ini');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, [periode]);

  const fetchStats = async () => {
    setLoading(true);
    const now = new Date(new Date().getTime() + (7 * 60 * 60000));
    let startDate, endDate;

    if (periode === 'hari_ini') {
      startDate = `${now.toISOString().split('T')[0]}T00:00:00+07:00`;
      endDate = `${now.toISOString().split('T')[0]}T23:59:59+07:00`;
    } else if (periode === 'bulan_ini') {
      const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, '0');
      startDate = `${y}-${m}-01T00:00:00+07:00`;
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      endDate = `${y}-${m}-${lastDay}T23:59:59+07:00`;
    } else if (periode === 'tahun_ini') {
      const y = now.getFullYear();
      startDate = `${y}-01-01T00:00:00+07:00`;
      endDate = `${y}-12-31T23:59:59+07:00`;
    }

    const { data } = await supabase.from('absensi')
      .select('status')
      .gte('waktu_masuk', startDate)
      .lte('waktu_masuk', endDate);

    if (data) {
      setStats({
        hadir: data.filter(a => a.status === 'Hadir').length,
        telat: data.filter(a => a.status === 'Late').length,
        cutiIzin: data.filter(a => a.status === 'Cuti' || a.status === 'Izin').length
      });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Utama</h1>
          <p className="text-slate-500 text-sm mt-1">Ringkasan aktivitas kehadiran karyawan.</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg">
          <Calendar className="w-4 h-4 text-slate-500" />
          <select value={periode} onChange={(e) => setPeriode(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer">
            <option value="hari_ini">Filter: Hari Ini</option>
            <option value="bulan_ini">Filter: Bulan Ini</option>
            <option value="tahun_ini">Filter: Tahun Ini</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center"><Users className="w-6 h-6"/></div>
            <div>
              <p className="text-slate-500 text-sm font-medium">Hadir Tepat Waktu</p>
              <h3 className="text-3xl font-black text-slate-900">{loading ? '...' : stats.hadir}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center"><Clock className="w-6 h-6"/></div>
            <div>
              <p className="text-slate-500 text-sm font-medium">Keterlambatan (Late)</p>
              <h3 className="text-3xl font-black text-slate-900">{loading ? '...' : stats.telat}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center"><CalendarDays className="w-6 h-6"/></div>
            <div>
              <p className="text-slate-500 text-sm font-medium">Cuti / Izin</p>
              <h3 className="text-3xl font-black text-slate-900">{loading ? '...' : stats.cutiIzin}</h3>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}