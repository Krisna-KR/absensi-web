'use client';
import { useEffect, useMemo, useState } from 'react';
import { Search, Save, Send, Lock, FileText, Printer, X, Loader2, CheckCircle2, Clock, RotateCcw, PenLine, RefreshCw } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { pesanError } from '@/utils/pesanError';
import { useFeedback } from '@/components/Feedback';
import InputRupiah from '@/components/InputRupiah';
import { formatRupiah, rupiahSingkat } from '@/utils/rupiah';
import { tanggalWIB, formatTanggalWaktu } from '@/utils/waktu';

const NAMA_PERUSAHAAN = 'PT. GLORI INVESTAMA BERJANGKA';
const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const STATUS = {
  BARU:      { label: 'Belum diproses',   cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  DRAFT:     { label: 'Draft',            cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  TERKIRIM:  { label: 'Menunggu approve', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  DISETUJUI: { label: 'Disetujui',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  FINAL:     { label: 'Final',            cls: 'bg-slate-900 text-white border-slate-900' },
};
const FILTER_STATUS = [
  { key: 'semua', label: 'Semua', cocok: () => true },
  { key: 'belum', label: 'Belum diproses', cocok: r => r.status === 'BARU' || r.status === 'DRAFT' },
  { key: 'TERKIRIM', label: 'Menunggu approve', cocok: r => r.status === 'TERKIRIM' },
  { key: 'DISETUJUI', label: 'Disetujui', cocok: r => r.status === 'DISETUJUI' },
  { key: 'FINAL', label: 'Final', cocok: r => r.status === 'FINAL' },
];

const bisaDiedit = (s) => s === 'BARU' || s === 'DRAFT' || s === 'TERKIRIM';
const kelasSelect = 'px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

/** Satu slip tanda terima (dipakai di preview & cetak) */
function Slip({ r, periodeLabel }) {
  const info = r.info || {};
  const baris = [
    ['PERUSAHAAN', `${NAMA_PERUSAHAAN}${(info.lokasi || r.lokasi) ? ` BRANCH ${(info.lokasi || r.lokasi).toUpperCase()}` : ''}`],
    ['DIVISI', info.departemen || r.departemen || '-'],
    ['JABATAN', info.jabatan || r.jabatan || '-'],
    ['TEAM', info.tim || r.tim || '-'],
    ['NAMA', info.nama || r.nama],
  ];
  return (
    <article className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 print:p-6 break-inside-avoid print:rounded-none print:border-slate-400 print:mb-4">
      <h3 className="text-center font-bold underline underline-offset-4 text-slate-900">TANDA TERIMA ALLOWANCE {periodeLabel.toUpperCase()}</h3>
      <dl className="mt-5 grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
        {baris.map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="text-slate-900">: {v}</dd></div>
        ))}
      </dl>
      <table className="mt-5 w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          <tr>
            <td className="py-1.5 text-slate-600">Allowance{r.hangus && <span className="block text-[11px] text-rose-600">Tidak dibayarkan: 3 bulan berturut-turut tanpa komisi</span>}</td>
            <td className="py-1.5 text-right tabular-nums">{formatRupiah(r.nominalTampil)}</td>
          </tr>
          <tr><td className="py-1.5 text-slate-600">Potongan</td><td className="py-1.5 text-right tabular-nums text-rose-700">− {formatRupiah(r.potonganTampil)}</td></tr>
          <tr><td className="py-1.5 text-slate-600">Komisi</td><td className="py-1.5 text-right tabular-nums text-emerald-700">+ {formatRupiah(r.komisiTampil)}</td></tr>
          <tr className="border-t-2 border-slate-300">
            <td className="py-2 font-semibold text-slate-900">Penerimaan allowance sebesar</td>
            <td className="py-2 text-right font-bold text-slate-900 tabular-nums">{formatRupiah(r.totalTampil)}<span className="block text-[11px] font-normal text-slate-500">({rupiahSingkat(r.totalTampil)} rupiah)</span></td>
          </tr>
        </tbody>
      </table>
      <div className="mt-6 flex justify-end">
        <div className="w-56 text-center">
          <p className="text-sm text-slate-600">Karyawan</p>
          <div className="h-20 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {r.ttd ? <img src={r.ttd} alt={`Tanda tangan ${r.nama}`} className="max-h-20 max-w-full object-contain" /> : <span className="text-xs text-slate-300">belum ditandatangani</span>}
          </div>
          <p className="text-sm font-semibold text-slate-900 border-t border-slate-400 pt-1">{info.nama || r.nama}</p>
          {r.disetujui_at && <p className="text-[11px] text-slate-500 mt-0.5">Disetujui {formatTanggalWaktu(r.disetujui_at)}</p>}
        </div>
      </div>
    </article>
  );
}

export default function RekapAllowance() {
  const { toast, konfirmasi } = useFeedback();
  const sekarang = tanggalWIB();
  const [tahun, setTahun] = useState(Number(sekarang.slice(0, 4)));
  const [bulan, setBulan] = useState(Number(sekarang.slice(5, 7)));
  const periode = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
  const periodeLabel = `${BULAN_PANJANG[bulan - 1]} ${tahun}`;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState('');
  const [versi, setVersi] = useState(0);
  const muatUlang = () => setVersi(v => v + 1);

  const [ubah, setUbah] = useState({});          // { id_karyawan: { potongan, komisi } }
  const [pilih, setPilih] = useState(new Set());  // id_karyawan terpilih
  const [cari, setCari] = useState('');
  const [grup, setGrup] = useState('semua');
  const [lokasi, setLokasi] = useState('semua');
  const [filterStatus, setFilterStatus] = useState('semua');
  const [sibuk, setSibuk] = useState('');
  const [slip, setSlip] = useState(null);          // daftar baris yang dipreview
  const [segarkan, setSegarkan] = useState(false);  // sedang refresh data (tanpa mengosongkan tabel)
  const [dimuatAt, setDimuatAt] = useState(null);   // jam data terakhir diambil

  useEffect(() => {
    let batal = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('fn_allowance_daftar', { p_periode: periode });
      if (batal) return;
      setLoading(false);
      if (error) { setGalat(pesanError(error)); setRows([]); return; }
      setGalat(''); setRows(data || []); setDimuatAt(new Date());
    })();
    return () => { batal = true; };
  }, [periode, versi]);

  // Ambil ulang data saja: filter, pencarian, pilihan, dan isian yang belum disimpan tetap
  const refresh = async () => {
    setSegarkan(true);
    const { data, error } = await supabase.rpc('fn_allowance_daftar', { p_periode: periode });
    setSegarkan(false);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    const baru = data || [];
    const bisaDiubah = new Set(baru.filter(r => bisaDiedit(r.status)).map(r => r.id_karyawan));
    // isian untuk baris yang sudah terkunci (mis. sudah dikirim dari tab lain) dibuang
    setUbah(u => Object.fromEntries(Object.entries(u).filter(([id]) => bisaDiubah.has(id))));
    setRows(baru); setGalat(''); setDimuatAt(new Date());
  };

  // Nilai yang tampil = hasil edit (kalau ada) atau data tersimpan
  const lengkap = useMemo(() => rows.map(r => {
    const e = ubah[r.id_karyawan];
    const terkunci = !bisaDiedit(r.status);
    const potonganTampil = e?.potongan ?? Number(r.potongan ?? 0);
    const komisiTampil = e?.komisi ?? Number(r.komisi ?? 0);
    // Aturan Marketing: komisi bulan ini 0 + 2 bulan sebelumnya tanpa komisi -> allowance 0
    const hangus = terkunci ? !!r.allowance_hangus : (!!r.tanpa_komisi_2_bulan && komisiTampil === 0);
    const nominalTampil = terkunci ? Number(r.nominal) : hangus ? 0 : Number(r.nominal_sekarang);
    const kotor = e && (e.potongan !== Number(r.potongan ?? 0) || e.komisi !== Number(r.komisi ?? 0));
    return { ...r, terkunci, hangus, nominalTampil, potonganTampil, komisiTampil, kotor: !!kotor, totalTampil: nominalTampil - potonganTampil + komisiTampil };
  }), [rows, ubah]);

  const opsiGrup = useMemo(() => {
    const tim = [...new Set(rows.filter(r => r.departemen === 'Marketing').map(r => r.tim).filter(Boolean))].sort();
    return [{ v: 'semua', l: 'Semua divisi / tim' }, { v: 'Backoffice', l: 'Backoffice' }, ...tim.map(t => ({ v: `tim:${t}`, l: `Tim ${t}` }))];
  }, [rows]);
  const opsiLokasi = useMemo(() => [...new Set(rows.map(r => r.lokasi).filter(Boolean))].sort(), [rows]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const fs = FILTER_STATUS.find(f => f.key === filterStatus);
    return lengkap.filter(r =>
      (grup === 'semua' || (grup === 'Backoffice' ? r.departemen === 'Backoffice' : grup === `tim:${r.tim}` && r.departemen === 'Marketing')) &&
      (lokasi === 'semua' || r.lokasi === lokasi) &&
      fs.cocok(r) &&
      (!q || [r.nama, r.nip, r.jabatan, r.tim].some(v => v?.toLowerCase().includes(q))));
  }, [lengkap, cari, grup, lokasi, filterStatus]);

  const jumlahStatus = useMemo(() => Object.fromEntries(FILTER_STATUS.map(f => [f.key, lengkap.filter(f.cocok).length])), [lengkap]);
  const kotor = lengkap.filter(r => r.kotor);
  const dipilih = tampil.filter(r => pilih.has(r.id_karyawan));
  // Proses & kirim / Finalisasi hanya untuk baris yang dicentang
  const targetKirim = dipilih.filter(r => bisaDiedit(r.status));
  const targetFinal = dipilih.filter(r => r.status === 'DISETUJUI');
  const totalTampil = tampil.reduce((t, r) => t + r.totalTampil, 0);

  const aturNilai = (id, kolom, nilai) => {
    const r = lengkap.find(x => x.id_karyawan === id);
    setUbah(u => ({ ...u, [id]: { potongan: r.potonganTampil, komisi: r.komisiTampil, ...u[id], [kolom]: nilai ?? 0 } }));
  };

  const togglePilih = (id) => setPilih(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pilihSemua = (cek) => setPilih(cek ? new Set(tampil.map(r => r.id_karyawan)) : new Set());

  const gantiPeriode = async (fn) => {
    if (kotor.length && !(await konfirmasi({ judul: 'Ada perubahan yang belum disimpan', pesan: `${kotor.length} perubahan potongan/komisi akan hilang kalau pindah periode.`, tombolYa: 'Buang & pindah', nada: 'bahaya' }))) return;
    setUbah({}); setPilih(new Set()); fn();
  };

  const simpan = async ({ diam = false } = {}) => {
    if (!kotor.length) return true;
    const minus = kotor.find(r => r.totalTampil < 0);
    if (minus) { toast(`Total ${minus.nama} jadi minus. Kurangi potongannya.`, 'gagal'); return false; }
    setSibuk('simpan');
    const { data, error } = await supabase.rpc('fn_allowance_simpan', {
      p_periode: periode,
      p_data: kotor.map(r => ({ id_karyawan: r.id_karyawan, potongan: r.potonganTampil, komisi: r.komisiTampil })),
    });
    setSibuk('');
    if (error) { toast(pesanError(error), 'gagal'); return false; }
    setUbah({}); muatUlang();
    if (!diam) {
      const bagian = [];
      if (data.disimpan) bagian.push(`${data.disimpan} tersimpan sebagai draft`);
      if (data.dikirim_ulang) bagian.push(`${data.dikirim_ulang} dikirim ulang ke HP (notifikasi lama terganti)`);
      if (data.dilewati?.length) bagian.push(`${data.dilewati.length} dilewati karena sudah disetujui`);
      toast(bagian.join(', ') + '.');
    }
    return true;
  };

  const kirim = async () => {
    if (!targetKirim.length) return;
    const tanpaNominal = targetKirim.filter(r => !r.nominalTampil && !r.hangus);
    const hangus = targetKirim.filter(r => r.hangus);
    const ok = await konfirmasi({
      judul: `Kirim allowance ${periodeLabel} ke ${targetKirim.length} karyawan?`,
      pesan: (
        <div className="space-y-2">
          <p>Karyawan akan menerima notifikasi di HP dan menyetujuinya dengan tanda tangan. Selama belum disetujui, potongan & komisi masih bisa diubah dan otomatis terkirim ulang.</p>
          {tanpaNominal.length > 0 && <p className="text-amber-700">{tanpaNominal.length} karyawan allowance-nya Rp 0 (job role belum diisi nominalnya).</p>}
          {hangus.length > 0 && <p className="text-rose-700">{hangus.length} Marketing allowance-nya Rp 0 karena 3 bulan berturut-turut tanpa komisi. Isi komisinya dulu kalau mereka sebenarnya dapat.</p>}
        </div>
      ),
      tombolYa: 'Proses & kirim',
    });
    if (!ok) return;
    if (!(await simpan({ diam: true }))) return;
    setSibuk('kirim');
    const { data, error } = await supabase.rpc('fn_allowance_kirim', { p_periode: periode, p_id_karyawan: targetKirim.map(r => r.id_karyawan) });
    setSibuk('');
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`${data.dikirim} allowance terkirim ke HP karyawan.${data.dilewati?.length ? ` ${data.dilewati.length} dilewati.` : ''}`);
    setPilih(new Set()); muatUlang();
  };

  const finalisasi = async () => {
    if (!targetFinal.length) return;
    const ok = await konfirmasi({
      judul: `Finalisasi ${targetFinal.length} allowance?`,
      pesan: 'Allowance yang sudah final terkunci dan tidak bisa diubah lagi.',
      tombolYa: 'Finalisasi',
    });
    if (!ok) return;
    setSibuk('final');
    const { data, error } = await supabase.rpc('fn_allowance_final', { p_periode: periode, p_id_karyawan: targetFinal.map(r => r.id_karyawan) });
    setSibuk('');
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`${data.final} allowance difinalisasi.`);
    setPilih(new Set()); muatUlang();
  };

  const semuaTerpilih = tampil.length > 0 && tampil.every(r => pilih.has(r.id_karyawan));

  return (
    <div className="space-y-4 pb-24">
      {/* ===== Header & filter ===== */}
      <div className={`bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 ${slip ? 'print:hidden' : ''}`}>
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div><h1 className="text-2xl font-bold text-slate-900">Allowance</h1><p className="text-sm text-slate-500 mt-1">Allowance {periodeLabel} · {rows.length} karyawan{dimuatAt && <span className="text-slate-400"> · diperbarui {dimuatAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}</span>}</p></div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-500">Bulan
              <select value={bulan} onChange={e => gantiPeriode(() => setBulan(Number(e.target.value)))} className={`${kelasSelect} block mt-1`}>
                {BULAN_PANJANG.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">Tahun
              <input type="number" value={tahun} min="2024" max="2100" onChange={e => { const v = Number(e.target.value); if (v > 2000) gantiPeriode(() => setTahun(v)); }} className={`${kelasSelect} block mt-1 w-24`} />
            </label>
            <button onClick={refresh} disabled={segarkan || loading} title="Ambil data terbaru tanpa mengubah filter"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40">
              <RefreshCw className={`w-4 h-4 ${segarkan ? 'animate-spin' : ''}`} />Refresh
            </button>
            <button onClick={() => setSlip(dipilih.length ? dipilih : tampil)} disabled={!tampil.length}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40">
              <FileText className="w-4 h-4" />Preview slip{dipilih.length ? ` (${dipilih.length})` : ''}
            </button>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama, NIP, jabatan, atau tim" className={`${kelasSelect} w-full pl-9`} />
          </div>
          <select value={grup} onChange={e => setGrup(e.target.value)} className={kelasSelect}>
            {opsiGrup.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          {opsiLokasi.length > 1 && (
            <select value={lokasi} onChange={e => setLokasi(e.target.value)} className={kelasSelect}>
              <option value="semua">Semua lokasi</option>
              {opsiLokasi.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTER_STATUS.map(f => (
            <button key={f.key} onClick={() => setFilterStatus(f.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${filterStatus === f.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              {f.label}<span className={`text-xs tabular-nums px-1.5 rounded-full ${filterStatus === f.key ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{jumlahStatus[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {galat && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm print:hidden">Allowance belum bisa dimuat. {galat}</div>}

      {/* ===== Tabel ===== */}
      <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${slip ? 'print:hidden' : ''}`}>
        {/* Tabel punya scroll sendiri supaya header kolom (dan baris total) tetap terlihat saat di-scroll */}
        <div className="overflow-auto max-h-[calc(100vh-10rem)] min-h-[16rem]">
          <table className="w-full text-sm text-left text-slate-600 min-w-[1080px]">
            <thead className="sticky top-0 z-20 bg-slate-50 text-slate-500 text-xs shadow-[inset_0_-1px_0_rgb(226,232,240)]">
              <tr>
                <th className="px-4 py-3 w-10"><input type="checkbox" aria-label="Pilih semua" checked={semuaTerpilih} onChange={e => pilihSemua(e.target.checked)} /></th>
                <th className="px-4 py-3 font-semibold">Karyawan</th>
                <th className="px-4 py-3 font-semibold text-right">Allowance</th>
                <th className="px-4 py-3 font-semibold w-40">Potongan</th>
                <th className="px-4 py-3 font-semibold w-40">Komisi</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Tanda tangan</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan="9" className="px-4 py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
              {!loading && tampil.length === 0 && <tr><td colSpan="9" className="px-4 py-12 text-center text-slate-500">Tidak ada karyawan yang cocok dengan filter ini.</td></tr>}
              {!loading && tampil.map(r => {
                const st = STATUS[r.status] || STATUS.BARU;
                return (
                  <tr key={r.id_karyawan} className={r.kotor ? 'bg-amber-50/40' : pilih.has(r.id_karyawan) ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                    <td className="px-4 py-3"><input type="checkbox" aria-label={`Pilih ${r.nama}`} checked={pilih.has(r.id_karyawan)} onChange={() => togglePilih(r.id_karyawan)} /></td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{r.nama}{!r.is_aktif && <span className="ml-1.5 text-[10px] font-bold text-rose-600">NONAKTIF</span>}</p>
                      <p className="text-xs text-slate-500"><span className="font-mono">{r.nip}</span> · {r.jabatan} · {r.departemen === 'Marketing' ? `Tim ${r.tim || '-'}` : 'Backoffice'}{r.lokasi ? ` · ${r.lokasi}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      {r.nominalTampil ? formatRupiah(r.nominalTampil) : <span className={r.hangus ? 'text-rose-600 font-semibold' : 'text-amber-600'}>Rp 0</span>}
                      {r.hangus && <span className="block text-[10px] font-semibold text-rose-600 leading-tight">hangus · 3 bulan<br />tanpa komisi</span>}
                      {!r.hangus && !r.terkunci && r.tanpa_komisi_2_bulan && <span className="block text-[10px] font-semibold text-amber-600 leading-tight">2 bulan lalu<br />tanpa komisi</span>}
                      {!r.hangus && !r.terkunci && r.allowance_khusus !== null && <span className="block text-[10px] font-semibold text-violet-600">khusus</span>}
                    </td>
                    <td className="px-4 py-3"><InputRupiah value={r.potonganTampil} disabled={r.terkunci} onChange={v => aturNilai(r.id_karyawan, 'potongan', v)} aria-label={`Potongan ${r.nama}`} /></td>
                    <td className="px-4 py-3"><InputRupiah value={r.komisiTampil} disabled={r.terkunci} onChange={v => aturNilai(r.id_karyawan, 'komisi', v)} aria-label={`Komisi ${r.nama}`} /></td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${r.totalTampil < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{formatRupiah(r.totalTampil)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md border ${st.cls}`}>
                        {r.status === 'FINAL' && <Lock className="w-3 h-3" />}{r.status === 'TERKIRIM' && <Clock className="w-3 h-3" />}{st.label}
                      </span>
                      {r.status === 'TERKIRIM' && <p className="text-[11px] text-slate-400 mt-0.5">Dikirim {formatTanggalWaktu(r.dikirim_at)}{r.versi > 1 ? ` · kiriman ke-${r.versi}` : ''}</p>}
                      {r.kotor && <p className="text-[11px] font-medium text-amber-700 mt-0.5">{r.status === 'TERKIRIM' ? 'Belum disimpan · akan dikirim ulang' : 'Belum disimpan'}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {r.ttd ? (
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r.ttd} alt={`Tanda tangan ${r.nama}`} className="h-9 max-w-[90px] object-contain" />
                          <span className="text-[11px] text-slate-500 leading-tight">{formatTanggalWaktu(r.disetujui_at)}</span>
                        </div>
                      ) : r.status === 'TERKIRIM' ? (
                        <span className="text-[11px] text-slate-400 inline-flex items-center gap-1"><PenLine className="w-3 h-3" />{r.punya_ttd ? 'Menunggu approve' : 'Belum punya TTD'}</span>
                      ) : <span className="text-slate-300">–</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setSlip([r])} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Lihat slip"><FileText className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {!loading && tampil.length > 0 && (
              <tfoot className="sticky bottom-0 z-20 bg-slate-50 text-sm shadow-[inset_0_1px_0_rgb(226,232,240)]">
                <tr>
                  <td colSpan="5" className="px-4 py-3 text-right font-semibold text-slate-600">Total {tampil.length} karyawan</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">{formatRupiah(totalTampil)}</td>
                  <td colSpan="3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ===== Bar aksi ===== */}
      <div className={`fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] ${slip ? 'hidden' : 'print:hidden'}`}>
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex flex-wrap items-center gap-3">
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${kotor.length ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{kotor.length} perubahan</span>
          {dipilih.length > 0
            ? <span className="text-sm text-blue-700">{dipilih.length} dipilih</span>
            : <span className="text-sm text-slate-500">Centang karyawan untuk diproses atau difinalisasi</span>}
          <div className="ml-auto flex flex-wrap gap-2">
            {kotor.length > 0 && (
              <button onClick={() => setUbah({})} disabled={!!sibuk} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-100"><RotateCcw className="w-4 h-4" />Batalkan</button>
            )}
            <button onClick={() => simpan()} disabled={!kotor.length || !!sibuk}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 text-sm font-semibold hover:bg-blue-100 disabled:opacity-40">
              {sibuk === 'simpan' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Simpan
            </button>
            <button onClick={kirim} disabled={!targetKirim.length || !!sibuk}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
              {sibuk === 'kirim' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Proses & kirim{targetKirim.length ? ` (${targetKirim.length})` : ''}
            </button>
            <button onClick={finalisasi} disabled={!targetFinal.length || !!sibuk}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40">
              {sibuk === 'final' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Finalisasi{targetFinal.length ? ` (${targetFinal.length})` : ''}
            </button>
          </div>
        </div>
      </div>

      {/* ===== Preview & cetak slip ===== */}
      {slip && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm overflow-y-auto print:static print:bg-white print:backdrop-blur-0 print:overflow-visible">
          <div className="max-w-2xl mx-auto min-h-full sm:min-h-0 sm:my-8 bg-slate-100 sm:rounded-2xl shadow-xl print:shadow-none print:bg-white print:my-0 print:max-w-none">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-5 py-3 bg-white sm:rounded-t-2xl border-b border-slate-200 print:hidden">
              <p className="font-semibold text-slate-900 min-w-0 text-sm sm:text-base">Slip allowance {periodeLabel} · {slip.length} karyawan</p>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"><Printer className="w-4 h-4" /><span className="hidden sm:inline">Cetak / PDF</span><span className="sm:hidden">Cetak</span></button>
                <button onClick={() => setSlip(null)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Tutup"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-3 sm:p-5 space-y-4 print:p-0 print:space-y-0">
              {slip.map(r => <Slip key={r.id_karyawan} r={lengkap.find(x => x.id_karyawan === r.id_karyawan) || r} periodeLabel={periodeLabel} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

