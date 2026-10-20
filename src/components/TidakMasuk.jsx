'use client';
import { useEffect, useMemo, useState } from 'react';
import { UserX, ChevronDown, CheckCircle2, MapPin } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { pesanError } from '@/utils/pesanError';

const BATAS = 7;          // hari kerja
const AWAL_TAMPIL = 10;

const formatWaktu = (t) => t
  ? new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).replace(/\./g, ':')
  : null;

/**
 * Daftar karyawan (BO & Marketing) yang tidak masuk >= 7 hari kerja berturut-turut.
 * Hari kerja: Senin-Jumat, bukan tanggal libur, bukan hari Libur (< 3 orang absen); hari Cuti tidak dihitung.
 * Sumber: fungsi database fn_tidak_masuk.
 */
export default function TidakMasuk() {
  const [rows, setRows] = useState(null);
  const [galat, setGalat] = useState('');
  const [lokasi, setLokasi] = useState('semua');
  const [semua, setSemua] = useState(false);

  useEffect(() => {
    let batal = false;
    (async () => {
      const { data, error } = await supabase.rpc('fn_tidak_masuk', { p_min_hari: BATAS });
      if (batal) return;
      if (error) { setGalat(pesanError(error)); setRows([]); return; }
      setRows(data || []);
    })();
    return () => { batal = true; };
  }, []);

  const opsiLokasi = useMemo(() => [...new Map((rows || []).filter(r => r.id_lokasi).map(r => [r.id_lokasi, r.nama_lokasi])).entries()], [rows]);
  const tampil = useMemo(() => (rows || []).filter(r => lokasi === 'semua' || r.id_lokasi === lokasi), [rows, lokasi]);
  const daftar = semua ? tampil : tampil.slice(0, AWAL_TAMPIL);

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <span className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500" />
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0"><UserX className="w-5 h-5" /></span>
          <div>
            <h2 className="font-semibold text-slate-900">Tidak masuk {BATAS} hari kerja atau lebih</h2>
            <p className="text-xs text-slate-500">Backoffice & Marketing. Sabtu/Minggu, tanggal merah, dan cuti tidak dihitung. Hari ini belum dihitung.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {opsiLokasi.length > 1 && (
            <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs">
              {[['semua', 'Semua'], ...opsiLokasi].map(([id, nama]) => (
                <button key={id} onClick={() => setLokasi(id)}
                  className={`px-2.5 py-1 rounded-md font-semibold ${lokasi === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{nama}</button>
              ))}
            </div>
          )}
          {rows && <span className={`text-xs font-bold rounded-full px-2.5 py-1 tabular-nums ${tampil.length ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{tampil.length} orang</span>}
        </div>
      </div>

      {galat ? (
        <p className="px-5 py-4 text-sm text-rose-700 bg-rose-50">Daftar belum bisa dimuat. {galat}</p>
      ) : rows === null ? (
        <div className="px-5 py-4 space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${70 - i * 12}%` }} />)}</div>
      ) : tampil.length === 0 ? (
        <p className="px-5 py-5 text-sm text-emerald-700 inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Tidak ada karyawan yang tidak masuk {BATAS} hari kerja atau lebih.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap min-w-[760px]">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Karyawan</th>
                  <th className="px-5 py-2.5 font-semibold">Divisi</th>
                  <th className="px-5 py-2.5 font-semibold">Jabatan</th>
                  <th className="px-5 py-2.5 font-semibold">Terakhir absen</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Tidak masuk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {daftar.map(r => (
                  <tr key={r.id_karyawan} className="hover:bg-slate-50/70">
                    <td className="px-5 py-2.5">
                      <p className="font-semibold text-slate-900">{r.nama_lengkap}</p>
                      <p className="text-xs text-slate-400"><span className="font-mono">{r.nip}</span>{r.nama_lokasi && <span className="inline-flex items-center gap-0.5 ml-1.5"><MapPin className="w-3 h-3" />{r.nama_lokasi}</span>}</p>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-md border ${r.nama_departemen === 'Marketing' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                        {r.nama_departemen === 'Marketing' ? `Tim ${r.nama_tim}` : 'Backoffice'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-700">{r.jabatan || '–'}</td>
                    <td className="px-5 py-2.5 text-slate-700 tabular-nums">{formatWaktu(r.terakhir_absen) || <span className="text-slate-400">Belum pernah absen</span>}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold tabular-nums ${r.hari_kerja >= BATAS * 2 ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{r.hari_kerja} hari kerja</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tampil.length > AWAL_TAMPIL && (
            <button onClick={() => setSemua(v => !v)} className="w-full px-5 py-2.5 border-t border-slate-100 text-sm font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1">
              {semua ? 'Tampilkan lebih sedikit' : `Lihat semua (${tampil.length})`}<ChevronDown className={`w-4 h-4 transition-transform ${semua ? 'rotate-180' : ''}`} />
            </button>
          )}
        </>
      )}
    </section>
  );
}
