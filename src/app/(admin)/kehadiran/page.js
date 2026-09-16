'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Clock, LogIn, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';

export default function KehadiranPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Kalkulasi waktu lokal Indonesia (GMT+7) untuk filter database
      const date = new Date();
      const localDate = new Date(date.getTime() + (7 * 60 * 60000));
      const today = localDate.toISOString().split('T')[0];

      const { data: absensiData, error } = await supabase
        .from('absensi')
        .select('*, karyawan(nama_lengkap, nip, jabatan)')
        .gte('waktu_masuk', `${today}T00:00:00`)
        .order('waktu_masuk', { ascending: false });

      if (!error && absensiData) setData(absensiData);
      setLoading(false);
    };
    fetchData();
  }, []);

  const formatJam = (isoString) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kehadiran Hari Ini</h1>
          <p className="text-slate-500 text-sm mt-1">Pemantauan jam masuk dan jam keluar aktual karyawan.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Karyawan</th>
                <th className="px-6 py-4 font-semibold text-center">Jam Masuk</th>
                <th className="px-6 py-4 font-semibold text-center">Jam Keluar</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-slate-500">Memuat data kehadiran...</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-slate-500">Belum ada karyawan yang absen hari ini.</td>
                </tr>
              ) : (
                data.map((absen) => (
                  <tr key={absen.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-900">{absen.karyawan?.nama_lengkap}</p>
                      <p className="text-xs text-slate-500">{absen.karyawan?.nip} • {absen.karyawan?.jabatan}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-lg border border-green-200 font-medium">
                        <LogIn className="w-4 h-4" /> {formatJam(absen.waktu_masuk)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {absen.waktu_keluar ? (
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-50 text-rose-700 rounded-lg border border-rose-200 font-medium">
                          <LogOut className="w-4 h-4" /> {formatJam(absen.waktu_keluar)}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Belum absen</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {absen.status === 'Hadir' ? (
                         <span className="flex items-center gap-1 text-green-600 font-semibold"><CheckCircle2 className="w-4 h-4" /> Tepat Waktu</span>
                      ) : absen.status === 'Late' ? (
                         <span className="flex items-center gap-1 text-amber-600 font-semibold"><AlertCircle className="w-4 h-4" /> Terlambat</span>
                      ) : (
                         <span className="font-semibold">{absen.status}</span>
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