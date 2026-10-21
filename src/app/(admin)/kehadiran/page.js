'use client';
import { useState, useEffect, useMemo } from 'react';
import { LogIn, LogOut, Search, ChevronLeft, ChevronRight, MapPin, Users, CalendarOff } from 'lucide-react';
import { tanggalWIB, geserTanggal, formatJam, formatTanggalPanjang, formatTanggal } from '@/utils/waktu';
import { ambilKehadiran, STATUS_KEHADIRAN, kelompokPerTim } from '@/utils/kehadiran';
import { pesanError } from '@/utils/pesanError';
import InfoKaryawan from '@/components/InfoKaryawan';

// Filter status: "Izin/Sakit/Cuti" digabung agar chip tidak terlalu banyak
const FILTER_STATUS = [
  { key: 'semua', label: 'Semua', cocok: r => r.status !== 'Libur' || !!r.id_absensi },
  { key: 'Hadir', label: 'Tepat Waktu', cocok: r => r.status === 'Hadir' },
  { key: 'Late', label: 'Terlambat', cocok: r => r.status === 'Late' },
  { key: 'izin', label: 'Izin / Sakit / Cuti', cocok: r => ['Izin', 'Sakit', 'Cuti'].includes(r.status) },
  { key: 'Bolos', label: 'Alpha', cocok: r => r.status === 'Bolos' },
  { key: 'Belum Absen', label: 'Belum Absen', cocok: r => r.status === 'Belum Absen' },
  { key: 'tanpaPulang', label: 'Belum absen pulang', cocok: r => !!r.waktu_masuk && !r.waktu_keluar },
];

const IZIN = ['Izin', 'Sakit', 'Cuti'];

function Ringkas({ rows }) {
  const masuk = rows.filter(r => r.waktu_masuk || r.waktu_keluar).length;
  const telat = rows.filter(r => r.status === 'Late').length;
  const izin = rows.filter(r => IZIN.includes(r.status)).length;
  const tidak = rows.filter(r => r.status === 'Bolos' || r.status === 'Belum Absen').length;
  return (
    <span className="flex flex-wrap gap-1 text-[11px] font-bold">
      <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700">Masuk {masuk}</span>
      {telat > 0 && <span className="px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-700">Telat {telat}</span>}
      {izin > 0 && <span className="px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700">Izin {izin}</span>}
      {tidak > 0 && <span className="px-1.5 py-0.5 rounded-md bg-red-50 text-red-700">Belum/Tidak masuk {tidak}</span>}
    </span>
  );
}

/** Kehadiran per hari, dikelompokkan per tim: divisi A-Z, lalu nama tim A-Z. */
export default function KehadiranPage() {
  const hariIni = tanggalWIB();
  const [tanggal, setTanggal] = useState(hariIni);
  const [hasil, setHasil] = useState(null);       // { tanggal, rows }
  const [galat, setGalat] = useState('');
  const [filterStatus, setFilterStatus] = useState('semua');
  const [cari, setCari] = useState('');
  const [lokasi, setLokasi] = useState('semua');
  const [idInfo, setIdInfo] = useState(null);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const rows = await ambilKehadiran({ mulai: tanggal, sampai: tanggal });
        if (!batal) { setHasil({ tanggal, rows }); setGalat(''); }
      } catch (e) {
        if (!batal) { setGalat(pesanError(e)); setHasil({ tanggal, rows: [] }); }
      }
    })();
    return () => { batal = true; };
  }, [tanggal]);

  const loading = hasil?.tanggal !== tanggal;
  const data = useMemo(() => (loading ? [] : hasil.rows), [hasil, loading]);

  const opsiLokasi = useMemo(() => [...new Set(data.map(r => r.nama_lokasi).filter(Boolean))].sort(), [data]);
  const dasar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return data.filter(r => (lokasi === 'semua' || r.nama_lokasi === lokasi)
      && (!q || r.nama_lengkap?.toLowerCase().includes(q) || r.nip?.toLowerCase().includes(q)));
  }, [data, cari, lokasi]);

  const jumlah = useMemo(() => Object.fromEntries(FILTER_STATUS.map(f => [f.key, dasar.filter(f.cocok).length])), [dasar]);
  const kelompok = useMemo(() => {
    const f = FILTER_STATUS.find(x => x.key === filterStatus) || FILTER_STATUS[0];
    return kelompokPerTim(dasar.filter(f.cocok).sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap, 'id')));
  }, [dasar, filterStatus]);

  const semuaLibur = !loading && data.length > 0 && data.every(r => r.status === 'Libur' && !r.id_absensi);
  const pindah = (t) => { if (t && t <= hariIni) setTanggal(t); };

  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Kehadiran harian</h1>
            <p className="text-sm text-slate-500">{formatTanggal(tanggal)}{tanggal === hariIni ? ' · hari ini' : ''}. Per tim: Backoffice dulu, lalu tim Marketing A–Z.</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <label className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="search" value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama atau NIP"
                className="w-full sm:w-52 pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none" />
            </label>
            {opsiLokasi.length > 1 && (
              <select value={lokasi} onChange={e => setLokasi(e.target.value)} aria-label="Lokasi"
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 font-semibold text-slate-700 outline-none">
                <option value="semua">Semua lokasi</option>
                {opsiLokasi.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
              <button onClick={() => pindah(geserTanggal(tanggal, -1))} aria-label="Hari sebelumnya" className="p-1.5 rounded-md hover:bg-white text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
              <input type="date" value={tanggal} max={hariIni} onChange={e => pindah(e.target.value)} aria-label="Tanggal"
                className="text-sm font-semibold text-slate-700 bg-transparent outline-none px-1" />
              <button onClick={() => pindah(geserTanggal(tanggal, 1))} disabled={tanggal >= hariIni} aria-label="Hari berikutnya" className="p-1.5 rounded-md hover:bg-white text-slate-500 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              {tanggal !== hariIni && <button onClick={() => setTanggal(hariIni)} className="px-2 py-1 text-xs font-semibold text-blue-600 rounded-md hover:bg-white">Hari ini</button>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter status">
          {FILTER_STATUS.map(f => {
            const aktif = filterStatus === f.key;
            return (
              <button key={f.key} role="tab" aria-selected={aktif} onClick={() => setFilterStatus(f.key)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-colors ${aktif ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {f.label}
                <span className={`text-xs tabular-nums px-1.5 rounded-full ${aktif ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{loading ? '·' : jumlah[f.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {galat && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">Data kehadiran belum bisa dimuat. {galat}</div>}

      {loading ? (
        <div className="grid xl:grid-cols-2 gap-4">
          {[0, 1].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, j) => <div key={j} className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${60 + (j % 3) * 12}%` }} />)}
            </div>
          ))}
        </div>
      ) : semuaLibur && filterStatus === 'semua' ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
          <CalendarOff className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <p className="font-semibold text-slate-700">{formatTanggalPanjang(tanggal)} hari libur</p>
          <p className="text-sm">{data[0]?.keterangan === 'Akhir pekan' ? 'Akhir pekan.' : 'Kurang dari 3 orang absen, dihitung libur.'}</p>
        </div>
      ) : kelompok.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          {cari ? `Tidak ada karyawan yang cocok dengan "${cari}".` : 'Tidak ada data untuk filter ini.'}
        </div>
      ) : (
        <div className="grid xl:grid-cols-2 gap-4 items-start">
          {kelompok.map(g => (
            <section key={g.key} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${g.divisi === 'Marketing' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}><Users className="w-4 h-4" /></span>
                  <div className="min-w-0">
                    <h2 className="font-bold text-slate-900 truncate">{g.nama}</h2>
                    <p className="text-[11px] text-slate-500">{g.divisi || 'Tanpa departemen'} · {g.rows.length} orang</p>
                  </div>
                </div>
                <Ringkas rows={g.rows} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                  <thead className="text-slate-400 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-2 font-semibold">Nama</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold text-center">Masuk</th>
                      <th className="px-3 py-2 font-semibold text-center">Pulang</th>
                      <th className="px-5 py-2 font-semibold">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {g.rows.map(r => {
                      const st = STATUS_KEHADIRAN[r.status] || { label: r.status, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
                      const kepala = r.nama_departemen === 'Marketing' && !r.id_atasan;
                      return (
                        <tr key={r.id_karyawan} className="hover:bg-slate-50/70">
                          <td className="px-5 py-2.5">
                            <button type="button" onClick={() => setIdInfo(r.id_karyawan)} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline underline-offset-2 text-left">{r.nama_lengkap}</button>
                            <p className="text-[11px] text-slate-500">
                              {r.jabatan || '–'}{kepala && <span className="ml-1 font-semibold text-emerald-700">· kepala tim</span>}
                              {lokasi === 'semua' && opsiLokasi.length > 1 && r.nama_lokasi && <span className="inline-flex items-center gap-0.5 ml-1.5"><MapPin className="w-3 h-3" />{r.nama_lokasi}</span>}
                            </p>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-0.5 rounded-md border text-xs font-semibold ${st.cls}`}>{st.label}</span>
                            {r.status === 'Late' && r.durasi_telat_menit > 0 && <span className="ml-1.5 text-[11px] text-orange-600 tabular-nums">+{r.durasi_telat_menit} mnt</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {r.waktu_masuk ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold tabular-nums ${r.status === 'Late' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                <LogIn className="w-3.5 h-3.5" />{formatJam(r.waktu_masuk)}
                              </span>
                            ) : <span className="text-slate-300">–</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {r.waktu_keluar ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-white text-xs font-semibold tabular-nums">
                                <LogOut className="w-3.5 h-3.5" />{formatJam(r.waktu_keluar)}
                              </span>
                            ) : <span className="text-slate-300">–</span>}
                          </td>
                          <td className="px-5 py-2.5 text-xs text-slate-500 max-w-[200px] truncate" title={r.keterangan || ''}>{r.keterangan || '–'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {idInfo && <InfoKaryawan id={idInfo} onClose={() => setIdInfo(null)} />}
    </div>
  );
}
