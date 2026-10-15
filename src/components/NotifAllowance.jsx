'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Wallet, CheckCircle2, Clock, Lock, PenLine, Loader2 } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { kodeError } from '@/utils/sesi';
import { pesanError } from '@/utils/pesanError';
import { formatRupiah } from '@/utils/rupiah';
import { formatTanggalWaktu } from '@/utils/waktu';
import PadTtd from '@/components/PadTtd';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const labelPeriode = (p) => { const [y, m] = String(p).split('-'); return `${BULAN[Number(m) - 1]} ${y}`; };

const PESAN = {
  TTD_BELUM_ADA: 'Buat tanda tangan dulu sebelum menyetujui.',
  VERSI_BERUBAH: 'Admin baru saja mengubah allowance ini. Cek angka terbaru di bawah, lalu setujui lagi.',
  SUDAH_DISETUJUI: 'Allowance ini sudah kamu setujui.',
  ALLOWANCE_DITARIK: 'Allowance ini sedang diperbarui admin. Tunggu notifikasi berikutnya.',
  TTD_TIDAK_VALID: 'Gambar tanda tangan tidak bisa disimpan. Coba coret ulang.',
};

function Status({ s }) {
  if (s === 'TERKIRIM') return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />Perlu persetujuan</span>;
  if (s === 'DISETUJUI') return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" />Disetujui</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full"><Lock className="w-3 h-3" />Final</span>;
}

/**
 * Tab Notif di HP: daftar allowance, detail slip, dan tombol setujui.
 * items  : hasil fn_allowance_saya
 * muat   : muat ulang daftar
 * punyaTtd / setPunyaTtd : status tanda tangan karyawan
 * onSesiHabis : dipanggil kalau sesi berakhir
 */
export default function NotifAllowance({ items, muat, punyaTtd, setPunyaTtd, onSesiHabis, konfirmasi }) {
  const [idBuka, setIdBuka] = useState(null);
  const [modeTtd, setModeTtd] = useState(false);   // tampilkan pad tanda tangan
  const [lanjutSetujui, setLanjutSetujui] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState(null);         // { nada, teks }

  const buka = items.find(i => i.id === idBuka);

  const tanganiError = (error) => {
    const kode = kodeError(error);
    if (kode === 'SESI_HABIS') { onSesiHabis(); return; }
    setPesan({ nada: 'gagal', teks: PESAN[kode] || pesanError(error) });
    if (kode === 'VERSI_BERUBAH' || kode === 'ALLOWANCE_DITARIK' || kode === 'SUDAH_DISETUJUI') muat();
  };

  const setujui = async (item) => {
    setSibuk(true); setPesan(null);
    const { error } = await supabase.rpc('fn_allowance_setujui', { p_id: item.id, p_versi: item.versi });
    setSibuk(false);
    if (error) {
      if (kodeError(error) === 'TTD_BELUM_ADA') { setPunyaTtd(false); setModeTtd(true); setLanjutSetujui(true); }
      tanganiError(error);
      return;
    }
    setPesan({ nada: 'sukses', teks: 'Allowance disetujui. Tanda tanganmu sudah menempel di slip.' });
    muat();
  };

  const klikSetujui = async (item) => {
    if (!punyaTtd) { setModeTtd(true); setLanjutSetujui(true); setPesan(null); return; }
    const ok = await konfirmasi({
      judul: `Setujui allowance ${labelPeriode(item.periode)}?`,
      pesan: `Kamu menerima ${formatRupiah(item.total)}. Tanda tanganmu akan otomatis menempel di slip.`,
      tombolYa: 'Setujui',
    });
    if (ok) setujui(item);
  };

  const simpanTtd = async (gambar) => {
    setSibuk(true); setPesan(null);
    const { error } = await supabase.rpc('fn_ttd_saya_simpan', { p_ttd: gambar });
    setSibuk(false);
    if (error) { tanganiError(error); return; }
    setPunyaTtd(true); setModeTtd(false);
    if (lanjutSetujui && buka?.status === 'TERKIRIM') { setLanjutSetujui(false); await setujui(buka); return; }
    setLanjutSetujui(false);
    setPesan({ nada: 'sukses', teks: 'Tanda tangan tersimpan.' });
  };

  const kotakPesan = pesan && (
    <div className={`p-3 rounded-xl text-sm border ${pesan.nada === 'sukses' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{pesan.teks}</div>
  );

  // ---------- Pad tanda tangan ----------
  if (modeTtd) {
    return (
      <div className="flex-1 px-5 pt-6 pb-28 space-y-4">
        <button onClick={() => { setModeTtd(false); setLanjutSetujui(false); }} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500"><ChevronLeft className="w-4 h-4" />Kembali</button>
        <div>
          <h2 className="text-xl font-black text-slate-900">{punyaTtd ? 'Ganti tanda tangan' : 'Buat tanda tangan'}</h2>
          <p className="text-sm text-slate-500 mt-1">Coret pakai jari. Tanda tangan ini dipakai setiap kamu menyetujui allowance.</p>
        </div>
        {kotakPesan}
        <PadTtd sibuk={sibuk} onSimpan={simpanTtd} tombolSimpan={lanjutSetujui ? 'Simpan & setujui' : 'Simpan'} />
      </div>
    );
  }

  // ---------- Detail slip ----------
  if (buka) {
    return (
      <div className="flex-1 px-5 pt-6 pb-28 space-y-4">
        <button onClick={() => { setIdBuka(null); setPesan(null); }} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500"><ChevronLeft className="w-4 h-4" />Semua notifikasi</button>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Tanda terima allowance</p>
              <h2 className="text-xl font-black text-slate-900">{labelPeriode(buka.periode)}</h2>
            </div>
            <Status s={buka.status} />
          </div>
          {buka.info && (
            <p className="text-xs text-slate-500 mt-2">{buka.info.jabatan} · {buka.info.departemen === 'Marketing' ? `Tim ${buka.info.tim}` : buka.info.departemen}{buka.info.lokasi ? ` · ${buka.info.lokasi}` : ''}</p>
          )}
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Allowance</dt><dd className="font-semibold tabular-nums">{formatRupiah(buka.nominal)}</dd></div>
            {buka.allowance_hangus && <p className="text-xs text-rose-600 -mt-1">Allowance tidak dibayarkan karena 3 bulan berturut-turut tanpa komisi.</p>}
            <div className="flex justify-between"><dt className="text-slate-500">Potongan</dt><dd className="font-semibold tabular-nums text-rose-600">− {formatRupiah(buka.potongan)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Komisi</dt><dd className="font-semibold tabular-nums text-emerald-600">+ {formatRupiah(buka.komisi)}</dd></div>
            <div className="flex justify-between pt-3 mt-1 border-t border-slate-200"><dt className="font-bold text-slate-900">Diterima</dt><dd className="text-lg font-black tabular-nums text-slate-900">{formatRupiah(buka.total)}</dd></div>
          </dl>
          {buka.catatan && <p className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-lg p-2">Catatan admin: {buka.catatan}</p>}
          {buka.ttd && (
            <div className="mt-5 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={buka.ttd} alt="Tanda tanganmu" className="h-16 mx-auto object-contain" />
              <p className="text-[11px] text-slate-500 border-t border-slate-200 pt-1 mt-1">Disetujui {formatTanggalWaktu(buka.disetujui_at)}</p>
            </div>
          )}
        </div>
        {kotakPesan}
        {buka.status === 'TERKIRIM' && (
          <button onClick={() => klikSetujui(buka)} disabled={sibuk}
            className="w-full py-4 rounded-2xl bg-blue-600 text-white font-extrabold shadow-md active:scale-[0.99] disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {sibuk ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {punyaTtd ? 'Setujui' : 'Buat tanda tangan & setujui'}
          </button>
        )}
      </div>
    );
  }

  // ---------- Daftar ----------
  return (
    <div className="flex-1 px-5 pt-6 pb-28 space-y-4">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-black text-slate-900">Notifikasi</h2>
        <button onClick={() => { setModeTtd(true); setPesan(null); }} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600"><PenLine className="w-3.5 h-3.5" />{punyaTtd ? 'Ganti tanda tangan' : 'Buat tanda tangan'}</button>
      </div>
      {kotakPesan}
      {items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-sm text-slate-500">Belum ada notifikasi allowance.</div>
      ) : (
        <ul className="space-y-3">
          {items.map(i => (
            <li key={i.id}>
              <button onClick={() => { setIdBuka(i.id); setPesan(null); }}
                className={`w-full text-left bg-white rounded-2xl border p-4 flex items-center gap-3 shadow-sm active:bg-slate-50 ${i.status === 'TERKIRIM' ? 'border-amber-200' : 'border-slate-200'}`}>
                <span className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${i.status === 'TERKIRIM' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}><Wallet className="w-5 h-5" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-slate-900">Allowance {labelPeriode(i.periode)}</span>
                  <span className="block text-sm text-slate-600 tabular-nums">{formatRupiah(i.total)}</span>
                  <span className="block mt-1"><Status s={i.status} /></span>
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
