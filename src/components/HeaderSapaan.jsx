'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { CalendarDays } from 'lucide-react';

const TZ = 'Asia/Jakarta';

/** Kartu atas Dashboard: logo, tanggal & jam WIB berjalan, dan slogan perusahaan */
export default function HeaderSapaan() {
  const [sekarang, setSekarang] = useState(null);   // null saat render server supaya tidak beda dengan browser

  useEffect(() => {
    const tick = () => setSekarang(new Date());
    const awal = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => { clearTimeout(awal); clearInterval(t); };
  }, []);

  const tanggal = sekarang?.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
  const jam = sekarang?.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: TZ }).replace(/\./g, ':');

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-4">
      <div className="flex items-center gap-4 min-w-0 md:shrink-0">
        <Image src="/logo-gifx.png" alt="Logo GIFX" width={56} height={56} className="w-14 h-14 rounded-full shadow-sm ring-1 ring-slate-200 shrink-0" />
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><CalendarDays className="w-5 h-5" /></span>
          <div className="min-w-0">
            <p className="text-lg sm:text-xl font-bold text-slate-900 leading-tight min-h-[1.75rem] md:whitespace-nowrap">{tanggal || ' '}</p>
            <p className="text-sm font-semibold text-slate-500 tabular-nums min-h-[1.25rem]">{jam ? `${jam} WIB` : ' '}</p>
          </div>
        </div>
      </div>
      {/* Slogan dibesarkan bertahap per lebar layar; boleh turun 2 baris (rata seimbang) di tablet supaya tidak menabrak tanggal.
          pr-2: huruf miring terakhir tidak terpotong oleh bg-clip-text */}
      <p className="md:ml-auto md:text-right min-w-0 pr-2 [text-wrap:balance] text-2xl sm:text-3xl md:text-[1.9rem] lg:text-[2.25rem] xl:text-[2.6rem] italic font-semibold leading-tight tracking-tight bg-gradient-to-r from-amber-700 via-amber-600 to-yellow-600 bg-clip-text text-transparent"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
        “Your Trusted Trading Partner”
      </p>
    </section>
  );
}
