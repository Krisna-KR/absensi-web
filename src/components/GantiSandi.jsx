'use client';
import { useState } from 'react';
import { Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { pesanError } from '@/utils/pesanError';
import Modal from '@/components/Modal';

const MIN = 6;

/**
 * Popup ganti password sendiri (web admin & HP karyawan).
 * rpc     : 'fn_admin_ganti_sandi' atau 'fn_karyawan_ganti_sandi'
 * wajib   : true = tidak bisa ditutup (setelah password di-reset admin)
 * onSelesai(data): dipanggil setelah berhasil (HP: data.token = token sesi baru)
 */
export default function GantiSandi({ rpc, wajib = false, onClose, onSelesai }) {
  const [f, setF] = useState({ lama: '', baru: '', ulang: '' });
  const [lihat, setLihat] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');

  const cek = !f.lama ? 'Isi password lama.'
    : f.baru.length < MIN ? `Password baru minimal ${MIN} karakter.`
    : f.baru === f.lama ? 'Password baru harus beda dengan password lama.'
    : f.baru !== f.ulang ? 'Ulangi password baru dengan sama persis.' : '';

  const simpan = async (e) => {
    e.preventDefault();
    if (cek) { setGalat(cek); return; }
    setSibuk(true); setGalat('');
    const { data, error } = await supabase.rpc(rpc, { p_lama: f.lama, p_baru: f.baru });
    setSibuk(false);
    if (error) { setGalat(pesanError(error)); return; }
    onSelesai?.(data);
  };

  const kelas = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-base sm:text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
  const tipe = lihat ? 'text' : 'password';
  return (
    <Modal judul={wajib ? 'Ganti password dulu' : 'Ganti password'} onClose={onClose} tanpaTutup={wajib} lebar="sm:max-w-md">
      <form onSubmit={simpan} className="p-5 sm:p-6 space-y-3.5">
        {wajib && (
          <p className="text-sm px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex gap-2">
            <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />Password kamu baru dibuat atau di-reset. Ganti dengan password milikmu sendiri sebelum lanjut.
          </p>
        )}
        <label className="block text-sm font-semibold text-slate-700">Password lama
          <input type={tipe} autoComplete="current-password" value={f.lama} onChange={e => setF({ ...f, lama: e.target.value })} className={`${kelas} mt-1`} />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Password baru
          <input type={tipe} autoComplete="new-password" value={f.baru} onChange={e => setF({ ...f, baru: e.target.value })} className={`${kelas} mt-1`} />
          <span className="block text-xs font-normal text-slate-500 mt-1">Minimal {MIN} karakter.</span>
        </label>
        <label className="block text-sm font-semibold text-slate-700">Ulangi password baru
          <input type={tipe} autoComplete="new-password" value={f.ulang} onChange={e => setF({ ...f, ulang: e.target.value })} className={`${kelas} mt-1`} />
        </label>
        <button type="button" onClick={() => setLihat(v => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
          {lihat ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}{lihat ? 'Sembunyikan password' : 'Tampilkan password'}
        </button>
        {galat && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{galat}</p>}
        <div className="flex gap-2 pt-1">
          {!wajib && <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200">Batal</button>}
          <button type="submit" disabled={sibuk} className="flex-[2] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50">
            {sibuk && <Loader2 className="w-4 h-4 animate-spin" />}Simpan password
          </button>
        </div>
      </form>
    </Modal>
  );
}
