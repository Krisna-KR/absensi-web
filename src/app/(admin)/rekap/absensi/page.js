'use client';
import { useEffect, useMemo, useState } from 'react';
import { Search, FileSpreadsheet, ChevronDown, CalendarRange, Loader2, Info } from 'lucide-react';
import { tanggalWIB, jamMenitWIB, periodeAbsensi, labelRentang, formatJam, formatTanggal, formatTanggalPanjang, rentangPeriode } from '@/utils/waktu';
import { ambilKehadiran, STATUS_KEHADIRAN, namaTim, kelompokPerTim, bandingTim } from '@/utils/kehadiran';
import { pesanError } from '@/utils/pesanError';
import { buatXlsx, unduhBlob } from '@/utils/xlsx';
import { useFeedback } from '@/components/Feedback';
import InfoKaryawan from '@/components/InfoKaryawan';

const IZIN = ['Izin', 'Sakit', 'Cuti'];
const FILTER_STATUS = [
  { key: 'semua', label: 'Semua status', cocok: () => true },
  { key: 'Hadir', label: 'Tepat waktu', cocok: r => r.status === 'Hadir' },
  { key: 'Late', label: 'Terlambat', cocok: r => r.status === 'Late' },
  { key: 'izin', label: 'Izin / Sakit / Cuti', cocok: r => IZIN.includes(r.status) },
  { key: 'Bolos', label: 'Alpha', cocok: r => r.status === 'Bolos' },
  { key: 'Belum Absen', label: 'Belum absen (hari ini)', cocok: r => r.status === 'Belum Absen' },
  { key: 'tanpaPulang', label: 'Tidak absen pulang', cocok: r => !!r.waktu_masuk && !r.waktu_keluar },
];
const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const dow = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const akhirPekan = (ymd) => { const h = dow(ymd); return h === 0 || h === 6; };
const tglPendek = (ymd) => ymd.split('-').reverse().join('-');   // 21-09-2026

function hitung(rows, hariIni) {
  const c = { masuk: 0, telat: 0, alpha: 0, izin: 0, tanpaPulang: 0, menitTelat: 0 };
  for (const r of rows) {
    if (r.waktu_masuk || r.waktu_keluar) c.masuk++;
    if (r.status === 'Late') { c.telat++; c.menitTelat += r.durasi_telat_menit || 0; }
    if (r.status === 'Bolos') c.alpha++;
    if (IZIN.includes(r.status)) c.izin++;
    if (r.waktu_masuk && !r.waktu_keluar && r.tanggal < hariIni) c.tanpaPulang++;
  }
  return c;
}

/** Rekap absensi per periode (default 21–20), tab per divisi/tim, tabel per hari, export Excel. */
export default function RekapAbsensiPage() {
  const hariIni = tanggalWIB();
  const { toast } = useFeedback();
  const awal = periodeAbsensi(hariIni);
  const [mulai, setMulai] = useState(awal.mulai);
  const [sampai, setSampai] = useState(awal.sampai);
  const [hasil, setHasil] = useState(null);       // { kunci, rows }
  const [galat, setGalat] = useState('');
  const [weekend, setWeekend] = useState(false);
  const [tab, setTab] = useState('semua');
  const [jabatan, setJabatan] = useState('semua');
  const [lokasi, setLokasi] = useState('semua');
  const [status, setStatus] = useState('semua');
  const [cari, setCari] = useState('');
  const [tutup, setTutup] = useState(() => new Set());   // tanggal yang dilipat
  const [idInfo, setIdInfo] = useState(null);
  const [ekspor, setEkspor] = useState(false);

  const valid = mulai && sampai && mulai <= sampai;
  const kunci = `${mulai}|${sampai}`;

  useEffect(() => {
    if (!valid) return;
    let batal = false;
    (async () => {
      try {
        const akhir = sampai < hariIni ? sampai : hariIni;
        const rows = mulai > hariIni ? [] : await ambilKehadiran({ mulai, sampai: akhir });
        if (!batal) { setHasil({ kunci, rows }); setGalat(''); }
      } catch (e) {
        if (!batal) { setGalat(pesanError(e)); setHasil({ kunci, rows: [] }); }
      }
    })();
    return () => { batal = true; };
  }, [kunci, mulai, sampai, valid, hariIni]);

  const loading = valid && hasil?.kunci !== kunci;
  const mentah = useMemo(() => (!valid || loading || !hasil ? [] : hasil.rows), [hasil, loading, valid]);

  // Hari kerja yang dihitung libur (semua baris berstatus Libur), untuk info
  const hariLibur = useMemo(() => {
    const per = new Map();
    for (const r of mentah) {
      if (akhirPekan(r.tanggal)) continue;
      const v = per.get(r.tanggal) ?? true;
      per.set(r.tanggal, v && r.status === 'Libur');
    }
    return [...per.entries()].filter(([, libur]) => libur).map(([t]) => t).sort();
  }, [mentah]);

  // Baris yang dihitung: tanpa baris Libur; Sabtu/Minggu hanya kalau dicentang
  const dasar = useMemo(() => mentah.filter(r => r.status !== 'Libur' && (weekend || !akhirPekan(r.tanggal))), [mentah, weekend]);

  const opsiLokasi = useMemo(() => [...new Set(dasar.map(r => r.nama_lokasi).filter(Boolean))].sort(), [dasar]);
  const opsiJabatan = useMemo(() => [...new Set(dasar.map(r => r.jabatan).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id')), [dasar]);

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return dasar.filter(r => (lokasi === 'semua' || r.nama_lokasi === lokasi)
      && (jabatan === 'semua' || r.jabatan === jabatan)
      && (!q || r.nama_lengkap?.toLowerCase().includes(q) || r.nip?.toLowerCase().includes(q)));
  }, [dasar, lokasi, jabatan, cari]);

  const tabs = useMemo(() => kelompokPerTim(tersaring).map(g => ({ key: g.key, nama: g.nama, divisi: g.divisi, orang: new Set(g.rows.map(r => r.id_karyawan)).size })), [tersaring]);
  const tabAktif = tabs.some(t => t.key === tab) ? tab : 'semua';
  const diTab = useMemo(() => tabAktif === 'semua' ? tersaring : tersaring.filter(r => `${r.nama_departemen || ''}|${namaTim(r)}` === tabAktif), [tersaring, tabAktif]);
  const total = hitung(diTab, hariIni);

  const tampil = useMemo(() => {
    const f = FILTER_STATUS.find(x => x.key === status) || FILTER_STATUS[0];
    return diTab.filter(f.cocok);
  }, [diTab, status]);

  // Per hari, tanggal naik. Dalam satu hari: divisi, tim, lalu nama.
  const perHari = useMemo(() => {
    const peta = new Map();
    for (const r of tampil) {
      if (!peta.has(r.tanggal)) peta.set(r.tanggal, []);
      peta.get(r.tanggal).push(r);
    }
    const urut = (a, b) => bandingTim({ divisi: a.nama_departemen, nama: namaTim(a) }, { divisi: b.nama_departemen, nama: namaTim(b) })
      || a.nama_lengkap.localeCompare(b.nama_lengkap, 'id');
    return [...peta.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, rows]) => ({ tanggal: t, rows: rows.sort(urut) }));
  }, [tampil]);

  const pilihRentang = (r) => { setMulai(r.mulai); setSampai(r.sampai); setTutup(new Set()); };
  const lalu = periodeAbsensi(hariIni, -1);
  const bulanIni = rentangPeriode('bulan_ini');
  const PINTASAN = [
    { label: `Periode ini (${labelRentang(awal.mulai, awal.sampai)})`, r: awal },
    { label: `Periode lalu (${labelRentang(lalu.mulai, lalu.sampai)})`, r: lalu },
    { label: 'Bulan ini', r: bulanIni },
    { label: 'Hari ini', r: { mulai: hariIni, sampai: hariIni } },
  ];
  const namaTab = tabAktif === 'semua' ? 'Semua' : tabs.find(t => t.key === tabAktif)?.nama;

  const exportExcel = () => {
    if (!tampil.length) { toast('Tidak ada data untuk diekspor.', 'gagal'); return; }
    setEkspor(true);
    try {
      const baris = perHari.flatMap(h => h.rows).map((r, i) => [
        i + 1, tglPendek(r.tanggal), NAMA_HARI[dow(r.tanggal)], r.nama_lengkap, r.nip, namaTim(r), r.jabatan || '', r.nama_lokasi || '',
        jamMenitWIB(r.waktu_masuk), jamMenitWIB(r.waktu_keluar),
        STATUS_KEHADIRAN[r.status]?.label || r.status, r.status === 'Late' ? (r.durasi_telat_menit || 0) : null, r.keterangan || '',
      ]);
      const perOrang = new Map();
      for (const r of tampil) {
        if (!perOrang.has(r.id_karyawan)) perOrang.set(r.id_karyawan, { r, rows: [] });
        perOrang.get(r.id_karyawan).rows.push(r);
      }
      const ringkas = [...perOrang.values()]
        .sort((a, b) => bandingTim({ divisi: a.r.nama_departemen, nama: namaTim(a.r) }, { divisi: b.r.nama_departemen, nama: namaTim(b.r) }) || a.r.nama_lengkap.localeCompare(b.r.nama_lengkap, 'id'))
        .map(({ r, rows }, i) => {
          const c = hitung(rows, hariIni);
          const n = (s) => rows.filter(x => x.status === s).length;
          return [i + 1, r.nama_lengkap, r.nip, namaTim(r), r.jabatan || '', r.nama_lokasi || '', c.masuk, n('Hadir'), c.telat, c.menitTelat, n('Izin'), n('Sakit'), n('Cuti'), c.alpha, c.tanpaPulang];
        });
      const blob = buatXlsx([
        { nama: 'Per hari', kolom: [
          { judul: 'No', lebar: 6 }, { judul: 'Tanggal', lebar: 12 }, { judul: 'Hari', lebar: 9 }, { judul: 'Nama', lebar: 30 }, { judul: 'NIP', lebar: 14 },
          { judul: 'Divisi / Tim', lebar: 24 }, { judul: 'Jabatan', lebar: 22 }, { judul: 'Lokasi', lebar: 12 }, { judul: 'Masuk', lebar: 8 }, { judul: 'Pulang', lebar: 8 },
          { judul: 'Status', lebar: 13 }, { judul: 'Telat (menit)', lebar: 12 }, { judul: 'Keterangan', lebar: 36 },
        ], baris },
        { nama: 'Per karyawan', kolom: [
          { judul: 'No', lebar: 6 }, { judul: 'Nama', lebar: 30 }, { judul: 'NIP', lebar: 14 }, { judul: 'Divisi / Tim', lebar: 24 }, { judul: 'Jabatan', lebar: 22 }, { judul: 'Lokasi', lebar: 12 },
          { judul: 'Total masuk', lebar: 11 }, { judul: 'Tepat waktu', lebar: 11 }, { judul: 'Terlambat', lebar: 10 }, { judul: 'Total telat (menit)', lebar: 17 },
          { judul: 'Izin', lebar: 7 }, { judul: 'Sakit', lebar: 7 }, { judul: 'Cuti', lebar: 7 }, { judul: 'Alpha', lebar: 7 }, { judul: 'Tidak absen pulang', lebar: 17 },
        ], baris: ringkas },
      ]);
      const label = (namaTab || 'Semua').replace(/[^\w-]+/g, '-');
      unduhBlob(blob, `Rekap-Absensi_${mulai}_sd_${sampai}_${label}.xlsx`);
    } catch (e) {
      toast(`Excel gagal dibuat. ${e.message}`, 'gagal');
    }
    setEkspor(false);
  };

  const semuaTerbuka = perHari.every(h => !tutup.has(h.tanggal));
  const lipat = (t) => setTutup(s => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const inputCls = 'px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700 outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Rekap absensi</h1>
            <p className="text-sm text-slate-500">{valid ? `${formatTanggalPanjang(mulai)} – ${formatTanggalPanjang(sampai)}` : 'Pilih rentang tanggal'}{sampai > hariIni && valid ? ' (data sampai hari ini)' : ''}</p>
          </div>
          <button onClick={exportExcel} disabled={loading || ekspor || !tampil.length}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 shrink-0">
            {ekspor ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}Export Excel
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {PINTASAN.map(p => {
            const aktif = p.r.mulai === mulai && p.r.sampai === sampai;
            return (
              <button key={p.label} onClick={() => pilihRentang(p.r)}
                className={`px-3 py-1.5 rounded-full text-sm border font-semibold ${aktif ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{p.label}</button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          <label className="col-span-1 text-xs font-semibold text-slate-500">Dari
            <input type="date" value={mulai} onChange={e => e.target.value && setMulai(e.target.value)} className={`${inputCls} w-full mt-1`} />
          </label>
          <label className="col-span-1 text-xs font-semibold text-slate-500">Sampai
            <input type="date" value={sampai} onChange={e => e.target.value && setSampai(e.target.value)} className={`${inputCls} w-full mt-1`} />
          </label>
          <label className="col-span-2 md:col-span-1 text-xs font-semibold text-slate-500">Nama
            <span className="relative block mt-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="search" value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama atau NIP" className={`${inputCls} w-full pl-9`} />
            </span>
          </label>
          <label className="text-xs font-semibold text-slate-500">Jabatan
            <select value={jabatan} onChange={e => setJabatan(e.target.value)} className={`${inputCls} w-full mt-1`}>
              <option value="semua">Semua jabatan</option>
              {opsiJabatan.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">Status
            <select value={status} onChange={e => setStatus(e.target.value)} className={`${inputCls} w-full mt-1`}>
              {FILTER_STATUS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">Lokasi
            <select value={lokasi} onChange={e => setLokasi(e.target.value)} disabled={opsiLokasi.length < 2} className={`${inputCls} w-full mt-1 disabled:opacity-60`}>
              <option value="semua">{opsiLokasi.length === 1 ? opsiLokasi[0] : 'Semua lokasi'}</option>
              {opsiLokasi.length > 1 && opsiLokasi.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={weekend} onChange={e => setWeekend(e.target.checked)} />
            Masukkan Sabtu/Minggu <span className="text-xs text-slate-400">(misalnya OB yang masuk akhir pekan)</span>
          </label>
          {!valid && <p className="text-sm text-rose-600">Tanggal &ldquo;dari&rdquo; harus sebelum atau sama dengan &ldquo;sampai&rdquo;.</p>}
        </div>

        {!loading && valid && (
          <p className="text-sm px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-blue-800 flex gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span><b className="font-semibold">Hari libur pada periode ini:</b> {hariLibur.length
              ? hariLibur.map(t => formatTanggal(t)).join(', ') + ' (kurang dari 3 orang absen).'
              : 'tidak ada selain Sabtu/Minggu.'}</span>
          </p>
        )}
      </div>

      {galat && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">Rekap belum bisa dimuat. {galat}</div>}

      {/* Tab per divisi / tim */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex gap-1 p-2 overflow-x-auto scrollbar-hide border-b border-slate-100" role="tablist" aria-label="Divisi / tim">
          {[{ key: 'semua', nama: 'Semua', orang: new Set(tersaring.map(r => r.id_karyawan)).size }, ...tabs].map(t => {
            const aktif = tabAktif === t.key;
            return (
              <button key={t.key} role="tab" aria-selected={aktif} onClick={() => setTab(t.key)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap ${aktif ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t.nama}<span className={`ml-1.5 text-xs tabular-nums ${aktif ? 'text-white/70' : 'text-slate-400'}`}>{loading ? '·' : t.orang}</span>
              </button>
            );
          })}
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-slate-100">
          {[
            ['Total absen masuk', total.masuk, 'text-slate-900'],
            ['Terlambat', total.telat, 'text-orange-600', total.menitTelat ? `${total.menitTelat} menit` : null],
            ['Tidak masuk (Alpha)', total.alpha, 'text-red-600'],
            ['Izin / Sakit / Cuti', total.izin, 'text-violet-600'],
            ['Tidak absen pulang', total.tanpaPulang, 'text-slate-700', 'tidak termasuk hari ini'],
          ].map(([label, nilai, cls, sub]) => (
            <div key={label} className="px-4 py-3">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className={`text-2xl font-black tabular-nums ${cls}`}>{loading ? '–' : nilai}</dd>
              {sub && !loading && <p className="text-[11px] text-slate-400">{sub}</p>}
            </div>
          ))}
        </dl>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          {Array.from({ length: 6 }).map((_, j) => <div key={j} className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${60 + (j % 3) * 12}%` }} />)}
        </div>
      ) : perHari.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
          <CalendarRange className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          {valid ? 'Tidak ada data absensi untuk rentang dan filter ini.' : 'Pilih rentang tanggal yang benar.'}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-slate-500 px-1">
            <span className="tabular-nums">{tampil.length} baris · {perHari.length} hari</span>
            <button onClick={() => setTutup(semuaTerbuka ? new Set(perHari.map(h => h.tanggal)) : new Set())} className="font-semibold text-blue-600 hover:text-blue-700">
              {semuaTerbuka ? 'Tutup semua hari' : 'Buka semua hari'}
            </button>
          </div>
          {perHari.map(h => {
            const terbuka = !tutup.has(h.tanggal);
            const c = hitung(h.rows, hariIni);
            return (
              <section key={h.tanggal} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <button type="button" onClick={() => lipat(h.tanggal)} aria-expanded={terbuka}
                  className="w-full flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-gradient-to-r from-slate-900 to-slate-700 text-left text-white">
                  <span className="font-bold">{NAMA_HARI[dow(h.tanggal)]}, {formatTanggalPanjang(h.tanggal)}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-md bg-white/15 tabular-nums">Masuk {c.masuk}</span>
                    {c.telat > 0 && <span className="px-2 py-0.5 rounded-md bg-orange-500/80 tabular-nums">Telat {c.telat}</span>}
                    {c.alpha > 0 && <span className="px-2 py-0.5 rounded-md bg-red-500/80 tabular-nums">Alpha {c.alpha}</span>}
                    {c.izin > 0 && <span className="px-2 py-0.5 rounded-md bg-violet-500/80 tabular-nums">Izin {c.izin}</span>}
                    <ChevronDown className={`w-4 h-4 transition-transform ${terbuka ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {terbuka && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap min-w-[980px]">
                      <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                        <tr>
                          <th className="pl-5 pr-2 py-2 font-semibold w-10">No</th>
                          <th className="px-3 py-2 font-semibold">Nama</th>
                          <th className="px-3 py-2 font-semibold">Divisi / Tim</th>
                          <th className="px-3 py-2 font-semibold">Jabatan</th>
                          <th className="px-3 py-2 font-semibold text-center">Masuk</th>
                          <th className="px-3 py-2 font-semibold text-center">Pulang</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold text-right">Telat</th>
                          <th className="px-5 py-2 font-semibold">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {h.rows.map((r, i) => {
                          const st = STATUS_KEHADIRAN[r.status] || { label: r.status, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
                          return (
                            <tr key={r.id_karyawan} className="hover:bg-slate-50/70">
                              <td className="pl-5 pr-2 py-2 text-slate-400 tabular-nums">{i + 1}</td>
                              <td className="px-3 py-2">
                                <button type="button" onClick={() => setIdInfo(r.id_karyawan)} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline underline-offset-2 text-left">{r.nama_lengkap}</button>
                              </td>
                              <td className="px-3 py-2 text-slate-700">{r.nama_departemen === 'Marketing' ? namaTim(r) : 'BO'}</td>
                              <td className="px-3 py-2 text-slate-700">{r.jabatan || '–'}</td>
                              <td className="px-3 py-2 text-center tabular-nums text-slate-800">{r.waktu_masuk ? formatJam(r.waktu_masuk) : <span className="text-slate-300">–</span>}</td>
                              <td className="px-3 py-2 text-center tabular-nums">
                                {r.waktu_keluar ? <span className="text-slate-800">{formatJam(r.waktu_keluar)}</span>
                                  : r.waktu_masuk && r.tanggal < hariIni ? <span className="px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 text-[11px] font-semibold">Tidak absen pulang</span>
                                  : <span className="text-slate-300">–</span>}
                              </td>
                              <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-md border text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
                              <td className="px-3 py-2 text-right tabular-nums text-orange-600">{r.status === 'Late' && r.durasi_telat_menit > 0 ? `${r.durasi_telat_menit} mnt` : <span className="text-slate-300">–</span>}</td>
                              <td className="px-5 py-2 text-xs text-slate-500 max-w-[240px] truncate" title={r.keterangan || ''}>{r.keterangan || '–'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}

      {idInfo && <InfoKaryawan id={idInfo} onClose={() => setIdInfo(null)} />}
    </div>
  );
}
