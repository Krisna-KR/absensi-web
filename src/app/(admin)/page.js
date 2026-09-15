'use client';

import { useEffect, useState } from 'react';
import { Gem, Calendar } from 'lucide-react';

export default function Dashboard() {
  // Menggunakan waktu saat ini
  const [time, setTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date) => {
    return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
  };

  // Mencegah hydration mismatch (perbedaan waktu server dan client saat render pertama)
  if (!mounted) return null;

  return (
    <div className="space-y-6">
      
      {/* Sub-Header / Info Bar */}
      <header className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between shadow-sm gap-4">
          <div className="flex items-center gap-6 w-full md:w-auto">
              <div className="w-14 h-14 rounded-full border border-slate-700 bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                  <Gem className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-4 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 w-full md:w-auto">
                  <div className="w-10 h-10 rounded bg-slate-700 flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5 text-white" />
                  </div>
                  <div>
                      <h2 className="text-white font-bold text-xl tracking-tight">{formatDate(time)}</h2>
                      <p className="text-blue-400 font-semibold mt-0.5">{formatTime(time)}</p>
                  </div>
              </div>
          </div>
          <div className="text-left md:text-right w-full md:w-auto mt-2 md:mt-0">
              <p className="text-slate-400 italic text-lg md:text-xl font-light tracking-wide">
                  "Making the World a Better Place to Trade"
              </p>
          </div>
      </header>

      {/* Grid Kosong untuk Statistik Mendatang */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="h-32 rounded-xl border border-slate-800 border-dashed bg-slate-900/20 flex flex-col items-center justify-center text-slate-600">
            <span className="font-semibold">Karyawan Hadir</span>
            <span className="text-xs mt-1">Data belum tersedia</span>
         </div>
         <div className="h-32 rounded-xl border border-slate-800 border-dashed bg-slate-900/20 flex flex-col items-center justify-center text-slate-600">
            <span className="font-semibold">Keterlambatan</span>
            <span className="text-xs mt-1">Data belum tersedia</span>
         </div>
         <div className="h-32 rounded-xl border border-slate-800 border-dashed bg-slate-900/20 flex flex-col items-center justify-center text-slate-600">
            <span className="font-semibold">Cuti / Izin</span>
            <span className="text-xs mt-1">Data belum tersedia</span>
         </div>
      </div>

    </div>
  );
}