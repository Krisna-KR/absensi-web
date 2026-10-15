'use client';
import { angkaRupiah, bacaRupiah } from '@/utils/rupiah';

// Input nominal rupiah: tampil "2.650.000", nilai yang dikirim ke onChange berupa angka (atau null bila kosong)
export default function InputRupiah({ value, onChange, className = '', placeholder = '0', disabled, ...rest }) {
  return (
    <div className={`flex items-stretch rounded-lg border border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 ${disabled ? 'bg-slate-50 opacity-70' : ''} ${className}`}>
      <span className="px-2.5 flex items-center text-xs font-semibold text-slate-400 border-r border-slate-100">Rp</span>
      <input
        inputMode="numeric" disabled={disabled} placeholder={placeholder}
        value={value === null || value === undefined ? '' : angkaRupiah(value)}
        onChange={e => onChange(bacaRupiah(e.target.value))}
        className="w-full min-w-0 px-2.5 py-2 text-sm text-right tabular-nums bg-transparent outline-none disabled:cursor-not-allowed"
        {...rest}
      />
    </div>
  );
}
