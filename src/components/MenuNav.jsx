'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';

// Tab navbar dengan dropdown (dipakai Kehadiran & Rekap). Menu memakai posisi fixed supaya tidak terpotong
// oleh container nav yang bisa di-scroll horizontal di layar kecil.
// items: [{ href, label, pendek, sub, icon }] ; base: awalan path untuk menandai tab aktif
export default function MenuNav({ label, icon: IconTab, base, items }) {
  const pathname = usePathname();
  const tombolRef = useRef(null);
  const menuRef = useRef(null);
  const [posisi, setPosisi] = useState(null); // null = tertutup

  const aktif = pathname === base || pathname.startsWith(`${base}/`);
  const sekarang = items.find(i => i.href === pathname);

  const toggle = () => {
    if (posisi) { setPosisi(null); return; }
    const r = tombolRef.current.getBoundingClientRect();
    setPosisi({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 300) });
  };

  useEffect(() => {
    if (!posisi) return;
    const tutup = (e) => {
      if (menuRef.current?.contains(e.target) || tombolRef.current?.contains(e.target)) return;
      setPosisi(null);
    };
    const esc = (e) => { if (e.key === 'Escape') setPosisi(null); };
    const geser = () => setPosisi(null);
    document.addEventListener('mousedown', tutup);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', geser);
    window.addEventListener('scroll', geser, true);
    return () => {
      document.removeEventListener('mousedown', tutup);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', geser);
      window.removeEventListener('scroll', geser, true);
    };
  }, [posisi]);

  if (!items.length) return null;
  return (
    <>
      <button ref={tombolRef} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={!!posisi}
        className={aktif
          ? 'flex items-center gap-2 bg-blue-50 text-blue-700 px-2.5 2xl:px-3 py-2 rounded-lg border border-blue-100 font-semibold shrink-0'
          : 'flex items-center gap-2 hover:text-slate-900 transition-colors text-slate-500 font-medium px-2.5 2xl:px-3 py-2 shrink-0'}>
        <IconTab className="w-4 h-4 shrink-0" />
        {label}{aktif && sekarang && <span className="font-medium text-blue-500">· {sekarang.pendek}</span>}
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${posisi ? 'rotate-180' : ''}`} />
      </button>
      {posisi && (
        <div ref={menuRef} role="menu" style={{ top: posisi.top, left: posisi.left }}
          className="fixed z-50 w-[280px] bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 whitespace-normal">
          {items.map(i => {
            const Icon = i.icon;
            const dipilih = pathname === i.href;
            return (
              <Link key={i.href} href={i.href} role="menuitem" onClick={() => setPosisi(null)}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-lg ${dipilih ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${dipilih ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon className="w-4 h-4" /></span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-semibold ${dipilih ? 'text-blue-700' : 'text-slate-900'}`}>{i.label}</span>
                  <span className="block text-xs text-slate-500">{i.sub}</span>
                </span>
                {dipilih && <Check className="w-4 h-4 text-blue-600 mt-1.5" />}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
