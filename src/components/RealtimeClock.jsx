'use client';
import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';

export default function RealtimeClock() {
  const [time, setTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 w-full md:w-auto">
      <div className="w-10 h-10 rounded bg-white shadow-sm border border-slate-200 flex items-center justify-center shrink-0">
        <Calendar className="w-5 h-5 text-blue-600" />
      </div>
      <div>
        <h2 className="text-slate-900 font-bold text-xl tracking-tight">
          {time.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </h2>
        <p className="text-slate-500 text-sm font-semibold mt-0.5">
          {time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB'}
        </p>
      </div>
    </div>
  );
}