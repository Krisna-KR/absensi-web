'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Wallet, PenLine, Loader2, Eye, Info } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { kodeError } from '@/utils/sesi';
import { pesanError } from '@/utils/pesanError';
import { formatRupiah } from '@/utils/rupiah';
import { formatTanggalWaktu } from '@/utils/waktu';
import PadTtd from '@/components/PadTtd';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const labelPeriode = (p) => { const [y, m] = String(p).split('-'); return `${BULAN[Number(m) - 1]} ${y}`; };

const PESAN = {
  TTD_TIDAK_VALID: 'Gambar tanda tangan tidak bisa disimpan. Coba coret ulang.',
  TTD_SUDAH_ADA: 'Kamu sudah punya tanda tangan. Untuk mengganti, hubungi admin.',
};

/**
 * Tab Notif di HP: daftar slip allowance yang dikirim admin.
 * Tanda tangan dibuat sekali di sini; menggantinya hanya lewat admin (web).
 * items  : hasil fn_allowance_saya
 * muat   : muat ulang daftar
 * punyaTtd / setPunyaTtd : status tanda tangan karyawan
 * onSesiHabis : dipanggil kalau sesi berakhir
 */
export default function NotifAllowance({ items, muat, punyaTtd, setPunyaTtd, onSesiHabis, konfirmasi }) {
  const [idBuka, setIdBuka] = useState(null);
  const [mode, setMode] = useState(null);          // null | 'buat_ttd' | 'lihat_ttd'
  const [ttdSaya, setTtdSaya] = useState(undefined);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState(null);        // { nada, teks }

  const buka = items.find(i => i.id === idBuka);

  const tanganiError = (error) => {
    const kode = kodeError(error);
    if (kode === 'SESI_HABIS') { onSesiHabis(); return; }
    if (kode === 'TTD_SUDAH_ADA') { setPunyaTtd(true); setMode(null); }
    setPesan({ nada: 'gagal', teks: PESAN[kode] || pesanError(error) });
  };

  const bukaSlip = async (item) => {
    setIdBuka(item.id); setPesan(null);
    if (item.baru) {
      const { error } = await supabase.rpc('fn_allowance_dilihat', { p_id: item.id });
      if (error && kodeError(error) === 'SESI_HABIS') { onSesiHabis(); return; }
      muat();
    }
  };

  const lihatTtd = async () => {
    setMode('lihat_ttd'); setPesan(null); setTtdSaya(undefined);
    const { data, error } = await supabase.rpc('fn_ttd_saya');
    if (error) { tanganiError(error); setTtdSaya(null); return; }
    setTtdSaya(data?.ttd || null);
  };

  const simpanTtd = async (gambar) => {
    const ok = await konfirmasi({
      judul: 'Simpan tanda tangan ini?',
      pesan: 'Tanda tangan dipakai di setiap slip allowance. Setelah disimpan, kamu tidak bisa menggantinya sendiri. Kalau perlu diganti, hubungi admin.',
      tombolYa: 'Simpan',
    });
    if (!ok) return;
    setSibuk(true); setPesan(null);
    const { error } = await supabase.rpc('fn_ttd_saya_simpan', { p_ttd: gambar });
    setSibuk(false);
    if (error) { tanganiError(error); return; }
    setPunyaTtd(true); setMode(null);
    setPesan({ nada: 'sukses', teks: 'Tanda tangan tersimpan. Admin sekarang bisa mengirim allowance-mu.' });
  };

  const kotakPesan = pesan && (
    <div className={`p-3 rounded-xl text-sm border ${pesan.nada === 'sukses' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{pesan.teks}</div>
  );
  const kembali = (teks = 'Kembali') => (
    <button onClick={() => { setMode(null); setIdBuka(null); setPesan(null); }} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500"><ChevronLeft className="w-4 h-4" />{teks}</button>
  );

  // ---------- Buat tanda tangan (sekali) ----------
  if (mode === 'buat_ttd') {
    return (
      <div className="flex-1 px-5 pt-6 pb-28 space-y-4">
        {kembali()}
        <div>
          <h2 className="text-xl font-black text-slate-900">Buat tanda tangan</h2>
          <p className="text-sm text-slate-500 mt-1">Coret pakai jari. Tanda tangan ini menempel di setiap slip allowance dan tidak bisa kamu ganti sendiri.</p>
        </div>
        {kotakPesan}
        <PadTtd sibuk={sibuk} onSimpan={simpanTtd} tombolSimpan="Simpan tanda tangan" />
      </div>
    );
  }

  // ---------- Lihat tanda tangan ----------
  if (mode === 'lihat_ttd') {
    return (
      <div className="flex-1 px-5 pt-6 pb-28 space-y-4">
        {kembali()}
        <h2 className="text-xl font-black text-slate-900">Tanda tanganku</h2>
        {kotakPesan}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex items-center justify-center min-h-40">
          {ttdSaya === undefined ? <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            /* eslint-disable-next-line @next/next/no-img-element */
            : ttdSaya ? <img src={ttdSaya} alt="Tanda tanganku" className="max-h-32 max-w-full object-contain" />
            : <p className="text-sm text-slate-500">Belum ada tanda tangan.</p>}
        </div>
        <p className="text-xs text-slate-500 flex gap-1.5"><Info className="w-4 h-4 shrink-0" />Kalau tanda tangan ini salah, minta admin untuk menggantinya.</p>
      </div>
    );
  }

  // ---------- Detail slip ----------
  if (buka) {
    const potongan = Number(buka.potongan || 0);
    return (
      <div className="flex-1 px-5 pt-6 pb-28 space-y-4">
        {kembali('Semua notifikasi')}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Tanda terima allowance</p>
          <h2 className="text-xl font-black text-slate-900">{labelPeriode(buka.periode)}</h2>
          {buka.info && (
            <p className="text-xs text-slate-500 mt-2">{buka.info.jabatan} · {buka.info.departemen === 'Marketing' ? `Tim ${buka.info.tim}` : buka.info.departemen}{buka.info.lokasi ? ` · ${buka.info.lokasi}` : ''}</p>
          )}
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Allowance</dt><dd className="font-semibold tabular-nums">{formatRupiah(buka.nominal)}</dd></div>
            {potongan > 0 && <div className="flex justify-between"><dt className="text-slate-500">Potongan</dt><dd className="font-semibold tabular-nums text-rose-600">− {formatRupiah(potongan)}</dd></div>}
            <div className="flex justify-between"><dt className="text-slate-500">Komisi</dt><dd className="font-semibold tabular-nums text-emerald-600">+ {formatRupiah(buka.komisi)}</dd></div>
            <div className="flex justify-between pt-3 mt-1 border-t border-slate-200"><dt className="font-bold text-slate-900">Diterima</dt><dd className="text-lg font-black tabular-nums text-slate-900">{formatRupiah(buka.total)}</dd></div>
          </dl>
          {buka.catatan && <p className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-lg p-2">Catatan admin: {buka.catatan}</p>}
          {buka.ttd && (
            <div className="mt-5 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={buka.ttd} alt="Tanda tanganmu" className="h-16 mx-auto object-contain" />
              <p className="text-[11px] text-slate-500 border-t border-slate-200 pt-1 mt-1">Dikirim {formatTanggalWaktu(buka.dikirim_at)}{buka.versi > 1 ? ' · sudah diperbarui admin' : ''}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- Daftar ----------
  return (
    <div className="flex-1 px-5 pt-6 pb-28 space-y-4">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-black text-slate-900">Notifikasi</h2>
        {punyaTtd && (
          <button onClick={lihatTtd} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600"><Eye className="w-3.5 h-3.5" />Lihat tanda tangan</button>
        )}
      </div>
      {kotakPesan}
      {!punyaTtd && (
        <button onClick={() => { setMode('buat_ttd'); setPesan(null); }}
          className="w-full text-left bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 active:bg-amber-100">
          <span className="w-11 h-11 rounded-full bg-white text-amber-600 flex items-center justify-center shrink-0"><PenLine className="w-5 h-5" /></span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-amber-900">Buat tanda tangan dulu</span>
            <span className="block text-sm text-amber-800">Allowance baru bisa dikirim admin kalau kamu sudah punya tanda tangan.</span>
          </span>
          <ChevronRight className="w-5 h-5 text-amber-400" />
        </button>
      )}
      {items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-sm text-slate-500">Belum ada notifikasi allowance.</div>
      ) : (
        <ul className="space-y-3">
          {items.map(i => (
            <li key={i.id}>
              <button onClick={() => bukaSlip(i)}
                className={`w-full text-left bg-white rounded-2xl border p-4 flex items-center gap-3 shadow-sm active:bg-slate-50 ${i.baru ? 'border-blue-200' : 'border-slate-200'}`}>
                <span className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${i.baru ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}><Wallet className="w-5 h-5" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-slate-900">Allowance {labelPeriode(i.periode)}</span>
                  <span className="block text-sm text-slate-600 tabular-nums">{formatRupiah(i.total)}</span>
                  {i.baru && <span className="inline-block mt-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">{i.versi > 1 ? 'Diperbarui' : 'Baru'}</span>}
                </span>
                <ChevronRight className="w-5 h-5 text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
