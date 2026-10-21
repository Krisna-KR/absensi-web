'use client';
import { useEffect, useMemo, useState } from 'react';
import { UserX, CheckCircle2, MapPin, Search, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { pesanError } from '@/utils/pesanError';
import { formatHariKerja, bandingTim } from '@/utils/kehadiran';
import { useFeedback } from '@/components/Feedback';
import InfoKaryawan from '@/components/InfoKaryawan';

const SEMINGGU = 5; // hari kerja

const formatWaktu = (t) => t
  ? new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).replace(/\./g, ':')
  : null;
const labelTim = (r) => (r.nama_departemen === 'Marketing' ? `Tim ${r.nama_tim}` : r.nama_departemen || 'Tanpa departemen');

/**
 * Daftar karyawan (BO & Marketing) yang tidak masuk, minimal 1 hari kerja, urut dari absen terakhir paling lama.
 * Hari kerja: Senin-Jumat, bukan tanggal libur, bukan hari Libur (< 3 orang absen).
 * Hari Izin/Sakit/Cuti tidak dihitung. Hari ini dihitung setelah jam 17:00 WIB.
 * Sumber: fungsi database fn_tidak_masuk.
 */
export default function TidakMasuk() {
  const { toast, konfirmasi } = useFeedback();
  const [rows, setRows] = useState(null);
  const [galat, setGalat] = useState('');
  const [versi, setVersi] = useState(0);
  const [memuat, setMemuat] = useState(true);
  const [lokasi, setLokasi] = useState('semua');
  const [tim, setTim] = useState('semua');
  const [cari, setCari] = useState('');
  const [idInfo, setIdInfo] = useState(null);
  const [sibuk, setSibuk] = useState(null);   // id yang sedang dinonaktifkan

  useEffect(() => {
    let batal = false;
    (async () => {
      const { data, error } = await supabase.rpc('fn_tidak_masuk', { p_min_hari: 1 });
      if (batal) return;
      setMemuat(false);
      if (error) { setGalat(pesanError(error)); setRows([]); return; }
      setGalat(''); setRows(data || []);
    })();
    return () => { batal = true; };
  }, [versi]);

  const muatUlang = () => { setMemuat(true); setVersi(v => v + 1); };

  const opsiLokasi = useMemo(() => [...new Map((rows || []).filter(r => r.id_lokasi).map(r => [r.id_lokasi, r.nama_lokasi])).entries()], [rows]);
  const opsiTim = useMemo(() => {
    const peta = new Map();
    (rows || []).forEach(r => { const nama = labelTim(r); if (!peta.has(nama)) peta.set(nama, { nama, divisi: r.nama_departemen }); });
    return [...peta.values()].sort(bandingTim).map(t => t.nama);
  }, [rows]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (rows || []).filter(r => (lokasi === 'semua' || r.id_lokasi === lokasi)
      && (tim === 'semua' || labelTim(r) === tim)
      && (!q || r.nama_lengkap?.toLowerCase().includes(q) || r.nip?.toLowerCase().includes(q)));
  }, [rows, lokasi, tim, cari]);

  const lebihSeminggu = tampil.filter(r => r.hari_kerja >= SEMINGGU).length;
  const belumPernah = tampil.filter(r => !r.terakhir_absen).length;

  const hapus = async (r) => {
    const ok = await konfirmasi({
      judul: `Hapus ${r.nama_lengkap}?`,
      pesan: `${r.nama_lengkap} dinonaktifkan: hilang dari daftar, keluar dari HP, dan tidak bisa login. Riwayat absensinya tetap tersimpan dan bisa diaktifkan lagi dari tab Karyawan → Nonaktif.`,
      tombolYa: 'Hapus (nonaktifkan)', nada: 'bahaya',
    });
    if (!ok) return;
    setSibuk(r.id_karyawan);
    const { error } = await supabase.from('karyawan').update({ is_aktif: false }).eq('id', r.id_karyawan);
    setSibuk(null);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    setRows(rs => rs.filter(x => x.id_karyawan !== r.id_karyawan));
    toast(`${r.nama_lengkap} sudah dinonaktifkan.`);
  };

  const kelasHari = (n) => n >= SEMINGGU * 2 ? 'bg-rose-600 text-white border-rose-600'
    : n >= SEMINGGU ? 'bg-rose-50 text-rose-700 border-rose-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0"><UserX className="w-5 h-5" /></span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Tidak masuk</h1>
              <p className="text-sm text-slate-500">Dihitung per hari kerja (Senin–Jumat, 1 minggu = 5 hari). Izin, sakit, cuti, dan hari libur tidak dihitung. Hari ini ikut dihitung setelah jam 17.00.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <label className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="search" value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama atau NIP"
                className="w-full sm:w-52 pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none" />
            </label>
            <select value={tim} onChange={e => setTim(e.target.value)} aria-label="Divisi / tim"
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 font-semibold text-slate-700 outline-none">
              <option value="semua">Semua divisi & tim</option>
              {opsiTim.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {opsiLokasi.length > 1 && (
              <select value={lokasi} onChange={e => setLokasi(e.target.value)} aria-label="Lokasi"
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 font-semibold text-slate-700 outline-none">
                <option value="semua">Semua lokasi</option>
                {opsiLokasi.map(([id, nama]) => <option key={id} value={id}>{nama}</option>)}
              </select>
            )}
            <button onClick={muatUlang} disabled={memuat} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${memuat ? 'animate-spin' : ''}`} />Muat ulang
            </button>
          </div>
        </div>
        {rows && !galat && (
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 tabular-nums">{tampil.length} orang</span>
            <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 tabular-nums">{lebihSeminggu} orang ≥ 1 minggu</span>
            {belumPernah > 0 && <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 tabular-nums">{belumPernah} belum pernah absen</span>}
          </div>
        )}
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {galat ? (
          <p className="px-5 py-4 text-sm text-rose-700 bg-rose-50">Daftar belum bisa dimuat. {galat}</p>
        ) : rows === null ? (
          <div className="px-5 py-4 space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${70 - i * 10}%` }} />)}</div>
        ) : tampil.length === 0 ? (
          <p className="px-5 py-6 text-sm text-emerald-700 inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{rows.length === 0 ? 'Semua karyawan masuk. Tidak ada yang bolos hari kerja.' : 'Tidak ada yang cocok dengan filter ini.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap min-w-[860px]">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="pl-5 pr-2 py-2.5 font-semibold w-10">No</th>
                  <th className="px-3 py-2.5 font-semibold">Karyawan</th>
                  <th className="px-3 py-2.5 font-semibold">Divisi</th>
                  <th className="px-3 py-2.5 font-semibold">Jabatan</th>
                  <th className="px-3 py-2.5 font-semibold">Terakhir absen</th>
                  <th className="px-3 py-2.5 font-semibold">Tidak masuk (hari kerja)</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tampil.map((r, i) => (
                  <tr key={r.id_karyawan} className="hover:bg-slate-50/70">
                    <td className="pl-5 pr-2 py-2.5 text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => setIdInfo(r.id_karyawan)} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline underline-offset-2 text-left">{r.nama_lengkap}</button>
                      <p className="text-xs text-slate-400"><span className="font-mono">{r.nip}</span>{r.nama_lokasi && <span className="inline-flex items-center gap-0.5 ml-1.5"><MapPin className="w-3 h-3" />{r.nama_lokasi}</span>}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-md border ${r.nama_departemen === 'Marketing' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{labelTim(r)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{r.jabatan || '–'}</td>
                    <td className="px-3 py-2.5 text-slate-700 tabular-nums">{formatWaktu(r.terakhir_absen) || <span className="text-amber-700 font-semibold">Belum pernah absen</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-md border text-xs font-bold tabular-nums ${kelasHari(r.hari_kerja)}`} title={`${r.hari_kerja} hari kerja`}>{formatHariKerja(r.hari_kerja)}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <button onClick={() => hapus(r)} disabled={sibuk === r.id_karyawan} title="Nonaktifkan karyawan"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded-lg disabled:opacity-50">
                        {sibuk === r.id_karyawan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {idInfo && <InfoKaryawan id={idInfo} onClose={() => setIdInfo(null)} />}
    </div>
  );
}
