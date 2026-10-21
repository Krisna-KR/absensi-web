'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

/** State urutan tabel: klik kolom yang sama membalik arah. */
export function useUrutan(awal) {
  const [urut, setUrut] = useState(awal);
  const ganti = (kunci) => setUrut(u => (u.kunci === kunci ? { kunci, arah: u.arah === 'asc' ? 'desc' : 'asc' } : { kunci, arah: 'asc' }));
  return [urut, ganti];
}

/** Urutkan salinan rows. Nilai kosong selalu di bawah. */
export function urutkan(rows, urut, akses) {
  const ambil = akses[urut.kunci];
  if (!ambil) return rows;
  const arah = urut.arah === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = ambil(a), y = ambil(b);
    const xKosong = x === null || x === undefined || x === '';
    const yKosong = y === null || y === undefined || y === '';
    if (xKosong && yKosong) return 0;
    if (xKosong) return 1;
    if (yKosong) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * arah;
    return String(x).localeCompare(String(y), 'id', { sensitivity: 'base', numeric: true }) * arah;
  });
}

/** Header kolom yang bisa diklik untuk mengurutkan. */
export function KolomUrut({ kunci, urut, onUrut, children, className = '', rata = 'kiri', pad = 'px-6 py-3' }) {
  const aktif = urut.kunci === kunci;
  const Icon = !aktif ? ArrowUpDown : urut.arah === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`${pad} font-semibold ${className}`} aria-sort={aktif ? (urut.arah === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onUrut(kunci)}
        className={`inline-flex items-center gap-1.5 rounded px-1 -mx-1 py-0.5 hover:text-slate-900 hover:bg-slate-100 transition-colors ${rata === 'kanan' ? 'flex-row-reverse' : ''} ${aktif ? 'text-slate-900' : ''}`}>
        {children}
        <Icon className={`w-3.5 h-3.5 ${aktif ? 'text-blue-600' : 'text-slate-300'}`} />
      </button>
    </th>
  );
}
