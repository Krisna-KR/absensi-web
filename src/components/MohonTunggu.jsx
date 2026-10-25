'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

// Tampil hanya kalau loading lebih lama dari ini, supaya tidak berkedip saat data cepat datang
const TUNDA_MS = 200;

function useTampilTertunda(tunda) {
  const [tampil, setTampil] = useState(tunda <= 0);
  useEffect(() => {
    if (tunda <= 0) return;
    const t = setTimeout(() => setTampil(true), tunda);
    return () => clearTimeout(t);
  }, [tunda]);
  return tampil;
}

/**
 * Penanda loading "Mohon tunggu..." dengan titik bergerak.
 * className mengatur tinggi area (default py-16) supaya halaman tidak loncat saat data muncul.
 */
export default function MohonTunggu({ teks = 'Mohon tunggu', className = 'py-16', tunda = TUNDA_MS }) {
  const tampil = useTampilTertunda(tunda);
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-center text-sm font-medium text-slate-500 ${className}`}>
      {tampil && (
        <span>{teks}<span className="titik-tunggu" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></span>
      )}
    </div>
  );
}

/** Ikon putar abu-abu tanpa tulisan (kartu dashboard). */
export function PutarTunggu({ className = 'h-40', ukuran = 'w-6 h-6', tunda = TUNDA_MS }) {
  const tampil = useTampilTertunda(tunda);
  return (
    <div role="status" aria-label="Mohon tunggu" className={`flex items-center justify-center ${className}`}>
      {tampil && <Loader2 className={`${ukuran} text-slate-300 animate-spin`} aria-hidden="true" />}
    </div>
  );
}
