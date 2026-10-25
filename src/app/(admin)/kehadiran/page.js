'use client';
import { useState, useEffect, useMemo } from 'react';
import { LogIn, LogOut, Search, ChevronLeft, ChevronRight, MapPin, Users, CalendarOff, Crown, AlertTriangle } from 'lucide-react';
import { tanggalWIB, geserTanggal, formatJam, formatTanggalPanjang, formatTanggal } from '@/utils/waktu';
import { ambilKehadiran, ambilAwalData, STATUS_KEHADIRAN, kelompokPerTim, TANPA_ATASAN } from '@/utils/kehadiran';
import { pesanError } from '@/utils/pesanError';
import InfoKaryawan from '@/components/InfoKaryawan';
import MohonTunggu from '@/components/MohonTunggu';

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
const sudahMasuk = r => !!(r.waktu_masuk || r.waktu_keluar);

function Ringkas({ rows }) {
  const masuk = rows.filter(sudahMasuk).length;
  const telat = rows.filter(r => r.status === 'Late').length;
  const izin = rows.filter(r => IZIN.includes(r.status)).length;
  const tidak = rows.filter(r => r.status === 'Bolos' || r.status === 'Belum Absen').length;
  return (
    <span className="flex flex-wrap justify-end gap-1 text-[11px] font-bold">
      <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 tabular-nums">Masuk {masuk}</span>
      {telat > 0 && <span className="px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-700 tabular-nums">Telat {telat}</span>}
      {izin > 0 && <span className="px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 tabular-nums">Izin {izin}</span>}
      {tidak > 0 && <span className="px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 tabular-nums">Belum {tidak}</span>}
    </span>
  );
}

// Satu baris karyawan. `beku` = baris kepala tim yang menempel di atas saat isi kartu di-scroll.
function Baris({ r, beku, onInfo, tampilLokasi }) {
  const st = STATUS_KEHADIRAN[r.status] || { label: r.status, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  const td = `py-2 border-b ${beku ? 'bg-emerald-50 border-emerald-200 font-normal normal-case tracking-normal text-sm text-slate-600' : 'border-slate-100'}`;
  return (
    <tr className={beku ? '' : 'hover:bg-slate-50/70'}>
      <td className={`${td} pl-4 pr-2`}>
        <button type="button" onClick={() => onInfo(r.id_karyawan)} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline underline-offset-2 text-left inline-flex items-center gap-1">
          {beku && <Crown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}{r.nama_lengkap}
        </button>
        <p className="text-[11px] text-slate-500">
          {r.jabatan || '–'}{beku && <span className="ml-1 font-semibold text-emerald-700">· kepala tim</span>}
          {tampilLokasi && r.nama_lokasi && <span className="inline-flex items-center gap-0.5 ml-1.5"><MapPin className="w-3 h-3" />{r.nama_lokasi}</span>}
        </p>
      </td>
      <td className={`${td} px-2`}>
        <span className={`px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap ${st.cls}`}>{st.label}</span>
        {r.status === 'Late' && r.durasi_telat_menit > 0 && <span className="ml-1 text-[11px] text-orange-600 tabular-nums">+{r.durasi_telat_menit}m</span>}
        {r.keterangan && <p className="text-[11px] text-slate-500 truncate max-w-[160px] mt-0.5" title={r.keterangan}>{r.keterangan}</p>}
      </td>
      <td className={`${td} px-2 text-center`}>
        {r.waktu_masuk ? (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs font-semibold tabular-nums ${r.status === 'Late' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <LogIn className="w-3.5 h-3.5" />{formatJam(r.waktu_masuk)}
          </span>
        ) : <span className="text-slate-300">–</span>}
      </td>
      <td className={`${td} pl-2 pr-4 text-center`}>
        {r.waktu_keluar ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800 text-white text-xs font-semibold tabular-nums">
            <LogOut className="w-3.5 h-3.5" />{formatJam(r.waktu_keluar)}
          </span>
        ) : <span className="text-slate-300">–</span>}
      </td>
    </tr>
  );
}

/**
 * Kehadiran per hari, satu kartu per tim (divisi A-Z, lalu nama tim A-Z).
 * Semua kartu tingginya sama; isinya di-scroll di dalam kartu, kepala tim menempel di atas.
 */
export default function KehadiranPage() {
  const hariIni = tanggalWIB();
  const [tanggal, setTanggal] = useState(hariIni);
  const [hasil, setHasil] = useState(null);       // { tanggal, rows }
  const [galat, setGalat] = useState('');
  const [filterStatus, setFilterStatus] = useState('semua');
  const [cari, setCari] = useState('');
  const [lokasi, setLokasi] = useState('semua');
  const [tim, setTim] = useState('semua');
  const [idInfo, setIdInfo] = useState(null);
  // Tanggal absen pertama di aplikasi: hari kerja sebelum itu ditampilkan "belum ada data", bukan libur
  const [awalData, setAwalData] = useState(null);
  useEffect(() => { let batal = false; ambilAwalData().then(t => { if (!batal) setAwalData(t); }); return () => { batal = true; }; }, []);

  useEffect(() => {
    // Dibatalkan saat tanggal diganti lagi atau pindah halaman
    const ac = new AbortController();
    (async () => {
      try {
        const rows = await ambilKehadiran({ mulai: tanggal, sampai: tanggal, signal: ac.signal });
        if (!ac.signal.aborted) { setHasil({ tanggal, rows }); setGalat(''); }
      } catch (e) {
        if (!ac.signal.aborted) { setGalat(pesanError(e)); setHasil({ tanggal, rows: [] }); }
      }
    })();
    return () => ac.abort();
  }, [tanggal]);

  const loading = hasil?.tanggal !== tanggal;
  const data = useMemo(() => (loading ? [] : hasil.rows), [hasil, loading]);

  const opsiLokasi = useMemo(() => [...new Set(data.map(r => r.nama_lokasi).filter(Boolean))].sort(), [data]);
  // Dasar: lokasi + pencarian (tanpa filter status & tim) -> dipakai untuk angka di chip tim
  const dasar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return data.filter(r => FILTER_STATUS[0].cocok(r) && (lokasi === 'semua' || r.nama_lokasi === lokasi)
      && (!q || r.nama_lengkap?.toLowerCase().includes(q) || r.nip?.toLowerCase().includes(q)));
  }, [data, cari, lokasi]);

  const semuaTim = useMemo(() => kelompokPerTim(dasar), [dasar]);
  const timAktif = semuaTim.some(g => g.key === tim) ? tim : 'semua';
  const diTim = useMemo(() => (timAktif === 'semua' ? dasar : semuaTim.find(g => g.key === timAktif).rows), [dasar, semuaTim, timAktif]);

  const jumlah = useMemo(() => Object.fromEntries(FILTER_STATUS.map(f => [f.key, diTim.filter(f.cocok).length])), [diTim]);
  const kelompok = useMemo(() => {
    const f = FILTER_STATUS.find(x => x.key === filterStatus) || FILTER_STATUS[0];
    return kelompokPerTim(diTim.filter(f.cocok)).map(g => {
      const urut = [...g.rows].sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap, 'id'));
      const kepala = urut.find(r => r.kepala_tim) || null;
      return { ...g, kepala, anggota: urut.filter(r => r !== kepala) };
    });
  }, [diTim, filterStatus]);

  const semuaLibur = !loading && data.length > 0 && data.every(r => r.status === 'Libur' && !r.id_absensi);
  const pindah = (t) => { if (t && t <= hariIni) setTanggal(t); };
  const satuTim = timAktif !== 'semua';
  const tampilLokasi = lokasi === 'semua' && opsiLokasi.length > 1;

  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Kehadiran harian</h1>
            <p className="text-sm text-slate-500">{formatTanggal(tanggal)}{tanggal === hariIni ? ' · hari ini' : ''}. Klik nama untuk info & rekap karyawan.</p>
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

        {/* Chip tim: angka = sudah masuk / jumlah orang */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide sm:flex-wrap" role="tablist" aria-label="Divisi / tim">
          {[{ key: 'semua', nama: 'Semua tim', rows: dasar }, ...semuaTim].map(g => {
            const aktif = timAktif === g.key;
            const titik = g.key === 'semua' ? null : g.nama === TANPA_ATASAN ? 'bg-rose-500' : g.divisi === 'Marketing' ? 'bg-emerald-500' : 'bg-blue-500';
            return (
              <button key={g.key} role="tab" aria-selected={aktif} onClick={() => setTim(g.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border font-semibold whitespace-nowrap transition-colors ${aktif ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {titik && <span className={`w-2 h-2 rounded-full ${aktif ? 'bg-white' : titik}`} />}
                {g.nama}
                <span className={`text-xs tabular-nums ${aktif ? 'text-white/70' : 'text-slate-400'}`}>{loading ? '·' : `${g.rows.filter(sudahMasuk).length}/${g.rows.length}`}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100" role="tablist" aria-label="Filter status">
          {FILTER_STATUS.map(f => {
            const aktif = filterStatus === f.key;
            return (
              <button key={f.key} role="tab" aria-selected={aktif} onClick={() => setFilterStatus(f.key)}
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border font-semibold transition-colors ${aktif ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {f.label}
                <span className={`tabular-nums px-1.5 rounded-full ${aktif ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{loading ? '·' : jumlah[f.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {galat && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">Data kehadiran belum bisa dimuat. {galat}</div>}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl"><MohonTunggu className="h-[26rem]" /></div>
      ) : semuaLibur && filterStatus === 'semua' ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
          <CalendarOff className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          {data[0]?.keterangan !== 'Akhir pekan' && (!awalData || tanggal < awalData) ? (
            <>
              <p className="font-semibold text-slate-700">Belum ada data absensi di {formatTanggalPanjang(tanggal)}</p>
              <p className="text-sm">{awalData ? `Data di aplikasi mulai ${formatTanggalPanjang(awalData)}.` : 'Belum ada absen tercatat di aplikasi.'}</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-700">{formatTanggalPanjang(tanggal)} hari libur</p>
              <p className="text-sm">{data[0]?.keterangan === 'Akhir pekan' ? 'Akhir pekan.' : 'Kurang dari 3 orang absen, dihitung libur.'}</p>
            </>
          )}
        </div>
      ) : kelompok.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          {cari ? `Tidak ada karyawan yang cocok dengan "${cari}".` : 'Tidak ada data untuk filter ini.'}
        </div>
      ) : (
        <div className={`grid gap-4 ${satuTim ? '' : 'lg:grid-cols-2 2xl:grid-cols-3'}`}>
          {kelompok.map(g => {
            const tanpaAtasan = g.nama === TANPA_ATASAN;
            return (
              <section key={g.key} className={`bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col ${satuTim ? 'h-[calc(100dvh-20rem)] min-h-[26rem]' : 'h-[26rem]'} ${tanpaAtasan ? 'border-rose-200' : 'border-slate-200'}`}>
                <div className={`shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b ${tanpaAtasan ? 'bg-rose-50/70 border-rose-100' : 'bg-slate-50/60 border-slate-100'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tanpaAtasan ? 'bg-rose-100 text-rose-600' : g.divisi === 'Marketing' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                      {tanpaAtasan ? <AlertTriangle className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-bold text-slate-900 truncate">{g.nama}</h2>
                      <p className="text-[11px] text-slate-500">{tanpaAtasan ? 'Pilih atasan di halaman Karyawan' : `${g.divisi || 'Tanpa departemen'} · ${g.rows.length} orang`}</p>
                    </div>
                  </div>
                  <Ringkas rows={g.rows} />
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain">
                  <table className="w-full text-left text-sm text-slate-600 border-separate border-spacing-0">
                    {/* Judul kolom + baris kepala tim ada di thead yang menempel, jadi ikut diam saat isi di-scroll */}
                    <thead className="sticky top-0 z-20 bg-white text-slate-400 text-[11px] uppercase tracking-wider shadow-[0_2px_4px_-2px_rgba(0,0,0,0.12)]">
                      <tr>
                        <th className="h-8 pl-4 pr-2 font-semibold border-b border-slate-100">Nama</th>
                        <th className="h-8 px-2 font-semibold border-b border-slate-100">Status</th>
                        <th className="h-8 px-2 font-semibold border-b border-slate-100 text-center">Masuk</th>
                        <th className="h-8 pl-2 pr-4 font-semibold border-b border-slate-100 text-center">Pulang</th>
                      </tr>
                      {g.kepala && <Baris r={g.kepala} beku onInfo={setIdInfo} tampilLokasi={tampilLokasi} />}
                    </thead>
                    <tbody>
                      {g.anggota.map(r => <Baris key={r.id_karyawan} r={r} onInfo={setIdInfo} tampilLokasi={tampilLokasi} />)}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {idInfo && <InfoKaryawan id={idInfo} onClose={() => setIdInfo(null)} />}
    </div>
  );
}
