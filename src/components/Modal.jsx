'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Popup: di HP muncul dari bawah selebar layar (bottom sheet), di laptop di tengah layar.
 * Lebar desktop diatur lewat prop `lebar` (kelas sm:max-w-*).
 * tutupDiLuar: klik area gelap di luar popup / tombol Esc ikut menutup (jangan dipakai untuk form, isian bisa hilang).
 */
export default function Modal({ judul, onClose, children, lebar = 'sm:max-w-lg', tutupDiLuar = false }) {
  const tutupRef = useRef(null);
  useEffect(() => { tutupRef.current = tutupDiLuar ? onClose : null; });
  useEffect(() => {
    const awal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';   // halaman di belakang tidak ikut ter-scroll
    const esc = (e) => { if (e.key === 'Escape') tutupRef.current?.(); };
    document.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = awal; document.removeEventListener('keydown', esc); };
  }, []);
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-6"
      onMouseDown={e => { if (tutupDiLuar && e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={judul}
        className={`bg-white w-full ${lebar} flex flex-col overflow-hidden border border-slate-200 shadow-xl rounded-t-2xl sm:rounded-2xl max-h-[94dvh] sm:max-h-[94vh]`}>
        <div className="px-5 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 bg-white shrink-0">
          <h2 className="text-lg font-bold text-slate-900 min-w-0 truncate">{judul}</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
