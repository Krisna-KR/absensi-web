'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Clock, LogIn, LogOut, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';

export default function KehadiranPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periode, setPeriode] = useState('hari_ini');
  const [customDate, setCustomDate] = useState('');

  useEffect(() => { fetchData(); }, [periode, customDate]);

  const fetchData = async () => {
    setLoading(true);
    const now = new Date(new Date().getTime() + (7 * 60 * 60000)); 
    let startDate, endDate;

    if (periode === 'hari_ini') {
      const today = now.toISOString().split('T')[0];
      startDate = `${today}T00:00:00+07:00`;
      endDate = `${today}T23:59:59+07:00`;
    } else if (periode === 'bulan_ini') {
      const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, '0');
      startDate = `${y}-${m}-01T00:00:00+07:00`;
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      endDate = `${y}-${m}-${lastDay}T23:59:59+07:00`;
    } else if (periode === 'tahun_ini') {
      const y = now.getFullYear();
      startDate = `${y}-01-01T00:00:00+07:00`;
      endDate = `${y}-12-31T23:59:59+07:00`;
    } else if (periode === 'custom') {
      if (!customDate) { setLoading(false); return; } 
      startDate = `${customDate}T00:00:00+07:00`;
      endDate = `${customDate}T23:59:59+07:00`;
    }

    const { data: absensiData, error } = await supabase
      .from('absensi')
      .select('*, karyawan(nama_lengkap, nip, jabatan)')
      .gte('waktu_masuk', startDate)
      .lte('waktu_masuk', endDate)
      .order('waktu_masuk', { ascending: false });

    if (error) alert("Terjadi penolakan kueri: " + error.message);
    setData(absensiData || []);
    setLoading(false);
  };

  const formatJam = (isoString) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const formatTanggal = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    const bulanArr = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sept', 'Okt', 'Nov', 'Des'];
    const hari = String(date.getDate()).padStart(2, '0');
    const bulan = bulanArr[date.getMonth()];
    const tahun = date.getFullYear();
    return `${hari} ${bulan} ${tahun}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rekap Kehadiran</h1>
          <p className="text-slate-500 text-sm mt-1">Pemantauan jam masuk dan jam keluar aktual karyawan.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto bg-slate-50 border border-slate-200 p-2 rounded-lg">
          <div className="flex items-center gap-2 px-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <select value={periode} onChange={(e) => {setPeriode(e.target.value); setCustomDate('');}} className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer">
              <option value="hari_ini">Hari Ini</option>
              <option value="bulan_ini">Bulan Ini</option>
              <option value="tahun_ini">Tahun Ini</option>
              <option value="custom">Pilih Tanggal...</option>
            </select>
          </div>
          {periode === 'custom' && (
            <input 
              type="date" 
              value={customDate} 
              onChange={(e) => setCustomDate(e.target.value)} 
              className="text-sm border border-slate-300 rounded px-2 py-1 w-full sm:w-auto focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            />
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap min-w-[700px]">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Karyawan</th>
                <th className="px-6 py-4 font-semibold">Tanggal</th>
                <th className="px-6 py-4 font-semibold text-center">Masuk</th>
                <th className="px-6 py-4 font-semibold text-center">Keluar</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-500">Memuat data kehadiran...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-500">Tidak ada catatan kehadiran pada periode ini.</td></tr>
              ) : (
                data.map((absen) => (
                  <tr key={absen.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{absen.karyawan?.nama_lengkap}</p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{absen.karyawan?.nip}</p>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">
                      {formatTanggal(absen.waktu_masuk)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 rounded-lg border border-green-200 font-bold text-xs">
                        <LogIn className="w-3 h-3" /> {formatJam(absen.waktu_masuk)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {absen.waktu_keluar ? (
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-rose-50 text-rose-700 rounded-lg border border-rose-200 font-bold text-xs">
                          <LogOut className="w-3 h-3" /> {formatJam(absen.waktu_keluar)}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">Belum Absen</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {absen.status === 'Hadir' ? (
                         <span className="flex items-center gap-1 text-green-600 font-semibold"><CheckCircle2 className="w-4 h-4" /> Tepat Waktu</span>
                      ) : absen.status === 'Late' ? (
                         <span className="flex items-center gap-1 text-amber-600 font-semibold"><AlertCircle className="w-4 h-4" /> Terlambat</span>
                      ) : (
                         <span className="font-semibold text-slate-600">{absen.status}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}