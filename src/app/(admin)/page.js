import Image from 'next/image';
import RealtimeClock from '@/components/RealtimeClock';
import { supabase } from '@/utils/supabase/client';

// Tambahkan baris ini untuk membunuh sistem cache
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const { data: absensi } = await supabase.from('absensi').select('status');
  
  // ... sisa kode ke bawah biarkan sama persis ...
  // Perbaikan logika kalkulasi
  const totalHadir = absensi?.filter(a => a.status === 'Hadir' || a.status === 'Late').length || 0;
  const totalTelat = absensi?.filter(a => a.status === 'Late').length || 0;
  const totalCutiIzin = absensi?.filter(a => a.status === 'Cuti' || a.status === 'Izin').length || 0;

  return (
    <div className="space-y-6">
      <header className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between shadow-sm gap-4">
          <div className="flex items-center gap-6 w-full md:w-auto">
              <div className="w-14 h-14 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden relative shadow-sm">
                  <Image src="/logo.png" alt="Logo" fill className="object-cover" />
              </div>
              <RealtimeClock />
          </div>
          <div className="text-left md:text-right w-full md:w-auto mt-2 md:mt-0">
              <p className="text-slate-500 italic text-lg md:text-xl font-light tracking-wide">
                  "With the power of Sarung Sakti"
              </p>
          </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="h-32 rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center shadow-sm">
            <span className="font-semibold text-slate-500">Karyawan Hadir</span>
            <span className="text-4xl font-bold text-blue-600 mt-2">{totalHadir}</span>
         </div>
         <div className="h-32 rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center shadow-sm">
            <span className="font-semibold text-slate-500">Keterlambatan</span>
            <span className="text-4xl font-bold text-rose-500 mt-2">{totalTelat}</span>
         </div>
         <div className="h-32 rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center shadow-sm">
            <span className="font-semibold text-slate-500">Cuti / Izin</span>
            <span className="text-4xl font-bold text-amber-500 mt-2">{totalCutiIzin}</span>
         </div>
      </div>
    </div>
  );
}