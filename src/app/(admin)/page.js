'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Users, Clock, CalendarDays, UserX, ArrowRight } from 'lucide-react';
import { rentangPeriode, tanggalWIB, geserTanggal, formatTanggal, jamMenitWIB, NAMA_BULAN } from '@/utils/waktu';
import { ambilKehadiran, WARNA_STATUS } from '@/utils/kehadiran';
import { pesanError } from '@/utils/pesanError';
import { GrafikBatang, Legenda, BatangKomposisi, DaftarBatang } from '@/components/Grafik';
import HeaderSapaan from '@/components/HeaderSapaan';
import { PutarTunggu } from '@/components/MohonTunggu';

const PERIODE = [
  { key: 'hari_ini', label: 'Hari ini' },
  { key: 'bulan_ini', label: 'Bulan ini' },
  { key: 'tahun_ini', label: 'Tahun ini' },
];

const SERI = [
  { key: 'Hadir', label: 'Tepat waktu', warna: WARNA_STATUS.Hadir },
  { key: 'Late', label: 'Terlambat', warna: WARNA_STATUS.Late },
  { key: 'Izin', label: 'Izin / Sakit / Cuti', warna: WARNA_STATUS.Izin },
  { key: 'Bolos', label: 'Alpha', warna: WARNA_STATUS.Bolos },
];

const KELOMPOK = { Hadir: 'Hadir', Late: 'Late', Izin: 'Izin', Sakit: 'Izin', Cuti: 'Izin', Bolos: 'Bolos' };

// Jam kerja kantor (status Tepat/Terlambat tetap dihitung database: masuk lewat 09.00 = Terlambat)
const JAM_MASUK = 9 * 60;   // 09.00
const jj = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}.${String(m % 60).padStart(2, '0')}`;

// Bin jam masuk per 15 menit (menit sejak 00:00 WIB), 1,5 jam sebelum s/d 1 jam sesudah jam masuk
const BIN_JAM = (() => {
  const awal = JAM_MASUK - 90, akhir = JAM_MASUK + 60;
  const bins = [{ label: `≤${jj(awal)}`, judul: `Sampai ${jj(awal)}`, sampai: awal }];
  for (let m = awal + 15; m <= akhir; m += 15) bins.push({ label: jj(m), judul: `${jj(m - 14)}–${jj(m)}`, sampai: m });
  bins.push({ label: `>${jj(akhir)}`, judul: `Setelah ${jj(akhir)}`, sampai: Infinity });
  return bins;
})();
const INDEX_BATAS = BIN_JAM.findIndex(b => b.sampai === JAM_MASUK);

function rentangDashboard(periode) {
  const hariIni = tanggalWIB();
  if (periode === 'hari_ini') return { mulai: geserTanggal(hariIni, -29), sampai: hariIni, keteranganTren: 'Per hari, 30 hari terakhir', label: '30 hari terakhir' };
  const r = rentangPeriode(periode);
  return periode === 'bulan_ini'
    ? { ...r, keteranganTren: 'Per hari, bulan ini', label: 'Bulan ini' }
    : { ...r, keteranganTren: 'Per bulan, tahun ini', label: 'Tahun ini' };
}

function olahData(rows, periode) {
  const hariIni = tanggalWIB();
  const kerja = rows.filter(r => KELOMPOK[r.status]);
  const kpiRows = periode === 'hari_ini' ? kerja.filter(r => r.tanggal === hariIni) : kerja;

  const hitung = (list) => {
    const c = { Hadir: 0, Late: 0, Izin: 0, Bolos: 0 };
    list.forEach(r => { c[KELOMPOK[r.status]]++; });
    return c;
  };
  const kpi = hitung(kpiRows);
  const totalKpi = kpiRows.length;

  // Tren
  const perKunci = new Map();
  const bulanan = periode === 'tahun_ini';
  kerja.forEach(r => {
    const k = bulanan ? r.tanggal.slice(0, 7) : r.tanggal;
    if (!perKunci.has(k)) perKunci.set(k, []);
    perKunci.get(k).push(r);
  });
  const tren = [...perKunci.keys()].sort().map(k => {
    const [y, m, d] = k.split('-');
    return {
      label: bulanan ? NAMA_BULAN[Number(m) - 1] : String(Number(d)),
      judulTooltip: bulanan ? `${NAMA_BULAN[Number(m) - 1]} ${y}` : formatTanggal(k),
      nilai: hitung(perKunci.get(k)),
    };
  });

  // Distribusi jam masuk
  const hist = BIN_JAM.map(b => ({ label: b.label, judulTooltip: b.judul, nilai: { Hadir: 0, Late: 0 } }));
  kerja.forEach(r => {
    if (!r.waktu_masuk) return;
    const [hh, mm] = jamMenitWIB(r.waktu_masuk).split(':').map(Number);
    const menit = hh * 60 + mm;
    const i = BIN_JAM.findIndex(b => menit <= b.sampai);
    hist[i].nilai[r.status === 'Late' ? 'Late' : 'Hadir']++;
  });

  // Ketepatan waktu per tim
  const tim = new Map();
  kerja.forEach(r => {
    // Marketing tanpa atasan = Business Manager (kepala tim), timnya memakai namanya sendiri
    const nama = r.nama_departemen === 'Marketing' ? `Tim ${r.nama_atasan || r.nama_lengkap}` : 'Backoffice';
    const t = tim.get(nama) || { total: 0, tepat: 0 };
    t.total++; if (r.status === 'Hadir') t.tepat++;
    tim.set(nama, t);
  });
  const perTim = [...tim.entries()]
    .map(([nama, t]) => ({ key: nama, label: nama, nilai: Math.round((t.tepat / t.total) * 100), teks: `${Math.round((t.tepat / t.total) * 100)}%` }))
    .sort((a, b) => b.nilai - a.nilai);

  // Paling sering terlambat
  const telat = new Map();
  kerja.filter(r => r.status === 'Late').forEach(r => {
    const t = telat.get(r.id_karyawan) || { nama: r.nama_lengkap, n: 0, menit: 0, nMenit: 0 };
    t.n++;
    if (r.durasi_telat_menit != null) { t.menit += r.durasi_telat_menit; t.nMenit++; }
    telat.set(r.id_karyawan, t);
  });
  const topTelat = [...telat.entries()].map(([id, t]) => ({
    key: id, label: t.nama, nilai: t.n, teks: `${t.n}x`,
    sub: t.nMenit ? `rata-rata ${Math.round(t.menit / t.nMenit)} mnt` : '',
  })).sort((a, b) => b.nilai - a.nilai).slice(0, 5);

  return { kpi, totalKpi, tren, hist, perTim, topTelat, adaJam: hist.some(h => h.nilai.Hadir + h.nilai.Late > 0) };
}

function Kartu({ judul, sub, aksi, children, className = '' }) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-slate-900">{judul}</h2>
          {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        </div>
        {aksi}
      </div>
      {children}
    </section>
  );
}

const Kosong = ({ teks = 'Belum ada data untuk periode ini.' }) => (
  <div className="h-40 flex items-center justify-center text-sm text-slate-400">{teks}</div>
);

export default function Dashboard() {
  const [periode, setPeriode] = useState('hari_ini');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const rentang = useMemo(() => rentangDashboard(periode), [periode]);

  useEffect(() => {
    const ac = new AbortController();   // dihentikan saat ganti periode / pindah halaman
    (async () => {
      try {
        const data = await ambilKehadiran({ mulai: rentang.mulai, sampai: rentang.sampai, signal: ac.signal });
        if (ac.signal.aborted) return;
        setRows(data); setError('');
      } catch (e) {
        if (!ac.signal.aborted) setError(pesanError(e));
      }
      if (!ac.signal.aborted) setLoading(false);
    })();
    return () => ac.abort();
  }, [rentang]);

  const d = useMemo(() => olahData(rows, periode), [rows, periode]);
  const persen = (n) => (d.totalKpi ? Math.round((n / d.totalKpi) * 1000) / 10 : 0);
  const tingkatHadir = d.totalKpi ? Math.round(((d.kpi.Hadir + d.kpi.Late) / d.totalKpi) * 1000) / 10 : null;
  const labelPeriode = PERIODE.find(p => p.key === periode).label.toLowerCase();

  const kartuKpi = [
    { key: 'Hadir', judul: 'Tepat waktu', icon: Users },
    { key: 'Late', judul: 'Terlambat', icon: Clock },
    { key: 'Izin', judul: 'Izin / Sakit / Cuti', icon: CalendarDays },
    { key: 'Bolos', judul: 'Alpha', icon: UserX },
  ];

  return (
    <div className="space-y-5">
      <HeaderSapaan />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <div className="inline-flex p-1 bg-white border border-slate-200 rounded-lg shadow-sm" role="tablist" aria-label="Periode">
          {PERIODE.map(p => (
            <button key={p.key} role="tab" aria-selected={periode === p.key}
              onClick={() => { if (p.key !== periode) { setLoading(true); setPeriode(p.key); } }}
              className={`px-3.5 py-1.5 text-sm font-semibold rounded-md transition-colors ${periode === p.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">Ringkasan belum bisa dimuat. {error}</div>}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="col-span-2 lg:col-span-1 rounded-xl p-5 bg-slate-900 text-white shadow-sm flex flex-col justify-between min-h-[132px]">
          <p className="text-sm text-slate-300">Tingkat kehadiran {labelPeriode}</p>
          {loading ? <PutarTunggu className="h-10 justify-start" ukuran="w-5 h-5" /> : tingkatHadir === null ? (
            <p className="text-lg font-semibold">{periode === 'hari_ini' ? 'Hari ini libur' : 'Belum ada hari kerja'}</p>
          ) : (
            <p className="text-4xl font-bold tracking-tight">{tingkatHadir.toLocaleString('id-ID')}<span className="text-2xl text-slate-400">%</span></p>
          )}
          <p className="text-xs text-slate-400">{d.totalKpi ? `${d.kpi.Hadir + d.kpi.Late} dari ${d.totalKpi} hari kerja karyawan` : 'Sabtu, Minggu, dan tanggal merah tidak dihitung'}</p>
        </div>
        {kartuKpi.map(({ key, judul, icon: Icon }) => (
          <div key={key} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 relative overflow-hidden min-h-[132px] flex flex-col justify-between">
            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: WARNA_STATUS[key] }} />
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Icon className="w-4 h-4" style={{ color: WARNA_STATUS[key] }} />{judul}
            </div>
            {loading ? <PutarTunggu className="h-9 justify-start" ukuran="w-5 h-5" /> : (
              <p className="text-3xl font-bold text-slate-900">{d.kpi[key].toLocaleString('id-ID')}</p>
            )}
            <p className="text-xs text-slate-500 tabular-nums">{loading ? ' ' : `${persen(d.kpi[key]).toLocaleString('id-ID')}% dari hari kerja`}</p>
          </div>
        ))}
      </div>

      {/* Tren + komposisi */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Kartu judul="Tren kehadiran" sub={rentang.keteranganTren} className="lg:col-span-2" aksi={<Legenda seri={SERI} />}>
          {loading ? <PutarTunggu className="h-[240px]" /> : d.tren.length ? (
            <GrafikBatang data={d.tren} seri={SERI} tinggi={240} />
          ) : <Kosong />}
        </Kartu>

        <Kartu judul="Komposisi status" sub={periode === 'hari_ini' ? 'Hari ini' : rentang.label}>
          {loading ? <PutarTunggu className="h-40" /> : d.totalKpi ? (
            <div className="space-y-5">
              <BatangKomposisi bagian={SERI.map(s => ({ ...s, nilai: d.kpi[s.key] }))} />
              <ul className="space-y-3">
                {SERI.map(s => (
                  <li key={s.key} className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-700"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.warna }} />{s.label}</span>
                    <span className="tabular-nums text-slate-500"><b className="text-slate-900 font-semibold">{d.kpi[s.key]}</b> · {persen(d.kpi[s.key]).toLocaleString('id-ID')}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <Kosong teks={periode === 'hari_ini' ? 'Hari ini bukan hari kerja.' : undefined} />}
        </Kartu>
      </div>

      {/* Jam masuk, per tim, terlambat */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Kartu judul="Jam absen masuk" sub={`Sebaran per 15 menit, ${rentang.label.toLowerCase()}`}
          aksi={<Legenda seri={[{ key: 'Hadir', label: 'Tepat', warna: WARNA_STATUS.Hadir }, { key: 'Late', label: 'Telat', warna: WARNA_STATUS.Late }]} />}>
          {loading ? <PutarTunggu className="h-[200px]" /> : d.adaJam ? (
            <GrafikBatang data={d.hist} tinggi={200} garisAcuan={{ setelahIndex: INDEX_BATAS, label: `Batas ${jj(JAM_MASUK)}` }}
              seri={[{ key: 'Hadir', label: 'Tepat waktu', warna: WARNA_STATUS.Hadir }, { key: 'Late', label: 'Terlambat', warna: WARNA_STATUS.Late }]} />
          ) : <Kosong />}
        </Kartu>

        <Kartu judul="Ketepatan waktu per tim" sub={`Hari kerja dengan absen masuk sampai ${jj(JAM_MASUK)}, ${rentang.label.toLowerCase()}`}>
          {loading ? <PutarTunggu className="h-40" /> : d.perTim.length ? (
            <DaftarBatang items={d.perTim} warna={WARNA_STATUS.Hadir} maks={100} />
          ) : <Kosong />}
        </Kartu>

        <Kartu judul="Paling sering terlambat" sub={rentang.label}
          aksi={<Link href="/kehadiran" className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">Rekap <ArrowRight className="w-3 h-3" /></Link>}>
          {loading ? <PutarTunggu className="h-40" /> : d.topTelat.length ? (
            <DaftarBatang items={d.topTelat} warna={WARNA_STATUS.Late} />
          ) : <Kosong teks="Tidak ada yang terlambat di periode ini." />}
        </Kartu>
      </div>
    </div>
  );
}
