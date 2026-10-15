'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { MapPin, Maximize, History, Trophy, CheckCircle2, Clock, LogIn, LogOut, UserRoundCheck, Users } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { hapusToken, kodeError } from '@/utils/sesi';
import { pesanError } from '@/utils/pesanError';
import { formatJam, TZ } from '@/utils/waktu';

// Layar Presensi untuk TV. QR dibuat server (bertanda tangan + lokasi), berganti tiap 10 detik.
const INTERVAL_QR = 10;
const INTERVAL_SCAN_MS = 3000;     // cek scan baru
const INTERVAL_PAPAN_MS = 60_000;  // segarkan daftar & leaderboard
const LAMA_BUBBLE_MS = 3000;
const KUNCI_LOKASI = 'kiosk_lokasi';
// Kecepatan running text: 8% tinggi layar per detik (sekitar 85 px/detik di TV 1080p)
const KECEPATAN_VH_PER_DETIK = 8;

const fmtHariTanggal = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const fmtJam = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const fmtBulan = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, month: 'long' });

const MEDALI = [
  'bg-gradient-to-br from-amber-200 to-amber-500 text-amber-950 ring-amber-300/70',
  'bg-gradient-to-br from-slate-100 to-slate-400 text-slate-800 ring-slate-300/70',
  'bg-gradient-to-br from-orange-200 to-orange-500 text-orange-950 ring-orange-300/70',
];

// Warna persen kehadiran tim
const warnaPersen = (p) => (p >= 80 ? { isi: 'bg-emerald-100', teks: 'text-emerald-700' } : p >= 50 ? { isi: 'bg-amber-100', teks: 'text-amber-700' } : { isi: 'bg-rose-100', teks: 'text-rose-700' });

function ChipTim({ t }) {
  const w = warnaPersen(t.persen ?? 0);
  return (
    <span className="relative shrink-0 inline-flex items-center gap-[1.2vh] h-[4.4vh] pl-[1.6vh] pr-[1vh] rounded-full border border-slate-200 bg-white overflow-hidden">
      <span className={`absolute inset-y-0 left-0 ${w.isi}`} style={{ width: `${t.persen ?? 0}%` }} aria-hidden="true" />
      <span className="relative text-[1.9vh] font-bold text-slate-900 whitespace-nowrap">{t.nama}</span>
      <span className="relative text-[1.9vh] font-semibold text-slate-600 tabular-nums">{t.hadir}/{t.total}</span>
      <span className={`relative text-[1.7vh] font-bold tabular-nums px-[0.9vh] py-[0.2vh] rounded-full bg-white/80 ${w.teks}`}>{t.persen ?? 0}%</span>
    </span>
  );
}

// Running text bergerak dari kiri ke kanan. Isi digandakan supaya berputar tanpa jeda.
function RunningTim({ tim }) {
  const trackRef = useRef(null);
  const [durasi, setDurasi] = useState(40);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const lebarSatuPutaran = el.scrollWidth / 2;
      const pxPerDetik = (window.innerHeight * KECEPATAN_VH_PER_DETIK) / 100;
      setDurasi(Math.max(12, lebarSatuPutaran / pxPerDetik));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Tiap separuh berisi minimal 8 chip supaya selalu lebih lebar dari layar (tidak ada celah kosong)
  const ulang = Math.max(1, Math.ceil(8 / tim.length));
  const isi = Array.from({ length: ulang }, (_, u) => tim.map(t => ({ ...t, k: `${u}-${t.nama}` }))).flat();
  const salinan = (kunci) => (
    <div key={kunci} className="flex shrink-0 items-center gap-[2.4vh] pr-[2.4vh]" aria-hidden={kunci === 'b'}>
      {isi.map(t => <ChipTim key={`${kunci}-${t.k}`} t={t} />)}
    </div>
  );
  return (
    <div className="relative flex-1 min-w-0 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
      <div ref={trackRef} className="flex w-max animasi-jalan-kanan motion-reduce:animate-none" style={{ animationDuration: `${durasi}s` }}>
        {salinan('a')}{salinan('b')}
      </div>
    </div>
  );
}

function teksBubble(s) {
  if (s.jenis === 'MASUK') {
    return s.status === 'Late'
      ? { ikon: Clock, warna: 'bg-orange-500', label: `Masuk ${formatJam(s.waktu)}`, sub: `Terlambat ${s.telat_menit} menit` }
      : { ikon: CheckCircle2, warna: 'bg-emerald-500', label: `Masuk ${formatJam(s.waktu)}`, sub: 'Tepat waktu' };
  }
  return {
    ikon: LogOut, warna: 'bg-blue-600', label: `Pulang ${formatJam(s.waktu)}`,
    sub: s.status === 'TANPA_MASUK' ? 'Tanpa absen masuk' : 'Hati-hati di jalan',
  };
}

// Baris kosong supaya tinggi daftar tetap rapi walau isinya kurang dari 5
function BarisKosong({ n }) {
  return Array.from({ length: n }, (_, i) => (
    <li key={`k${i}`} className="flex-1 min-h-0 flex items-center border-t border-slate-100 first:border-t-0">
      <span className="h-[1.2vh] w-1/3 rounded-full bg-slate-100" />
    </li>
  ));
}

function Kartu({ ikon: Ikon, judul, sub, children }) {
  return (
    <section className="flex-1 min-h-0 flex flex-col bg-white border border-slate-200/80 rounded-[2vh] shadow-sm px-[2.4vh] pt-[2vh] pb-[1.2vh]">
      <header className="flex items-center gap-[1.1vh] pb-[1.2vh]">
        <Ikon className="w-[2.4vh] h-[2.4vh] text-blue-600 shrink-0" />
        <h2 className="text-[2.1vh] font-bold text-slate-900 leading-none">{judul}</h2>
        {sub && <p className="ml-auto text-[1.35vh] text-slate-400 leading-none truncate">{sub}</p>}
      </header>
      <ol className="flex-1 min-h-0 flex flex-col">{children}</ol>
    </section>
  );
}

// Jam digital (state sendiri supaya detik berjalan tanpa merender ulang seluruh layar)
function JamDigital() {
  const [kini, setKini] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setKini(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const [jam, menit, detik] = fmtJam.format(kini).split(':');
  return (
    <p className="ml-auto shrink-0 flex items-baseline gap-[0.6vh] leading-none tabular-nums" aria-label={`Jam ${jam}.${menit}`}>
      <span className="text-[5vh] font-bold text-slate-900 tracking-tight">{jam}:{menit}</span>
      <span className="text-[2.4vh] font-semibold text-slate-400">{detik}</span>
      <span className="text-[1.5vh] font-semibold text-blue-600 ml-[0.4vh]">WIB</span>
    </p>
  );
}

function Kosong({ teks }) {
  return <li className="flex-1 flex items-center justify-center text-[1.7vh] text-slate-400">{teks}</li>;
}

export default function LayarPresensi() {
  const router = useRouter();
  const [lokasiList, setLokasiList] = useState([]);
  const [idLokasi, setIdLokasi] = useState('');
  const [qr, setQr] = useState('');
  const [countdown, setCountdown] = useState(INTERVAL_QR);
  const [galat, setGalat] = useState('');
  const [sekarang, setSekarang] = useState(() => new Date());
  const [papan, setPapan] = useState({ top: [], papan: [], hari_kerja: 0, tim: [], ob: [] });
  const [bubble, setBubble] = useState(null);
  const [antre, setAntre] = useState(0);
  const [layarPenuh, setLayarPenuh] = useState(false);

  const tanganiError = useCallback((error) => {
    if (kodeError(error) === 'SESI_HABIS') {
      hapusToken('admin');
      router.replace('/login?next=/qr-kiosk');
      return;
    }
    setGalat(pesanError(error));
  }, [router]);

  // Daftar lokasi + lokasi terakhir yang dipilih di browser ini
  useEffect(() => {
    let batal = false;
    (async () => {
      const { data, error } = await supabase.from('master_lokasi').select('id, nama_cabang').order('nama_cabang');
      if (batal) return;
      if (error) { tanganiError(error); return; }
      setLokasiList(data || []);
      let simpanan = '';
      try { simpanan = localStorage.getItem(KUNCI_LOKASI) || ''; } catch { /* abaikan */ }
      setIdLokasi((data || []).some(l => l.id === simpanan) ? simpanan : (data?.[0]?.id || ''));
    })();
    return () => { batal = true; };
  }, [tanganiError]);

  // Tanggal (diperbarui tiap 30 detik supaya ganti sendiri lewat tengah malam)
  useEffect(() => {
    const t = setInterval(() => setSekarang(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // QR berganti tiap 10 detik
  useEffect(() => {
    if (!idLokasi) return;
    let batal = false;
    const ambil = async () => {
      const { data, error } = await supabase.rpc('fn_qr_kiosk', { p_id_lokasi: idLokasi });
      if (batal) return;
      if (error) { tanganiError(error); setQr(''); return; }
      setGalat(''); setQr(data.qr); setCountdown(INTERVAL_QR);
    };
    ambil();
    const tQr = setInterval(ambil, INTERVAL_QR * 1000);
    const tDetik = setInterval(() => setCountdown(c => (c > 1 ? c - 1 : INTERVAL_QR)), 1000);
    return () => { batal = true; clearInterval(tQr); clearInterval(tDetik); };
  }, [idLokasi, tanganiError]);

  // Papan: 5 absen pertama hari ini + leaderboard bulan ini, plus bubble scan baru (khusus lokasi ini)
  useEffect(() => {
    if (!idLokasi) return;
    let batal = false;
    let kursor = null;
    let sibuk = false;
    const antrean = [];
    const timer = new Set();
    const tunda = (fn, ms) => {
      const t = setTimeout(() => { timer.delete(t); if (!batal) fn(); }, ms);
      timer.add(t);
    };

    const muatPapan = async () => {
      const { data, error } = await supabase.rpc('fn_layar_papan', { p_id_lokasi: idLokasi });
      if (batal) return;
      if (error) { tanganiError(error); return; }
      setPapan(data);
    };

    const berikutnya = () => {
      const s = antrean.shift();
      setAntre(antrean.length);
      if (!s) { sibuk = false; setBubble(null); return; }
      sibuk = true;
      setBubble({ ...s, tampil: true });
      tunda(() => {
        setBubble(b => (b ? { ...b, tampil: false } : b));
        tunda(berikutnya, 350);
      }, LAMA_BUBBLE_MS);
    };

    const cekScan = async () => {
      const { data, error } = await supabase.rpc('fn_layar_scan', { p_id_lokasi: idLokasi, p_setelah: kursor });
      if (batal) return;
      if (error) { tanganiError(error); return; }
      kursor = data.kursor;
      if (data.scan.length === 0) return;
      antrean.push(...data.scan);
      setAntre(antrean.length);
      if (!sibuk) berikutnya();
      muatPapan();
    };

    muatPapan();
    cekScan();
    const tScan = setInterval(cekScan, INTERVAL_SCAN_MS);
    const tPapan = setInterval(muatPapan, INTERVAL_PAPAN_MS);
    return () => {
      batal = true;
      clearInterval(tScan); clearInterval(tPapan);
      timer.forEach(clearTimeout);
      setBubble(null); setAntre(0);
    };
  }, [idLokasi, tanganiError]);

  useEffect(() => {
    const ubah = () => setLayarPenuh(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', ubah);
    return () => document.removeEventListener('fullscreenchange', ubah);
  }, []);

  const gantiLokasi = (id) => {
    setIdLokasi(id);
    try { localStorage.setItem(KUNCI_LOKASI, id); } catch { /* abaikan */ }
  };

  const namaLokasi = lokasiList.find(l => l.id === idLokasi)?.nama_cabang || '';
  const isiBubble = bubble && teksBubble(bubble);
  const IkonBubble = isiBubble?.ikon;
  const persenQr = (countdown / INTERVAL_QR) * 100;

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-100 p-[2.4vh] grid grid-cols-[minmax(0,40fr)_minmax(0,60fr)] grid-rows-[minmax(0,1fr)_auto] gap-[2.4vh] select-none">

      {/* ================= KIRI ================= */}
      <div className="min-h-0 flex flex-col gap-[2vh]">
        <section className="flex items-center gap-[1.8vh] px-[0.4vh] py-[0.6vh]">
          <Image src="/logo-gifx.png" alt="Logo GIFX" width={96} height={96} priority className="w-[6.4vh] h-[6.4vh] rounded-full shadow-sm shrink-0" />
          <div className="min-w-0">
            <p className="text-[1.5vh] font-semibold uppercase tracking-[0.14em] text-blue-600 flex items-center gap-[0.5vh] leading-none">
              <MapPin className="w-[1.5vh] h-[1.5vh]" /> Presensi {namaLokasi}
            </p>
            <p className="mt-[0.7vh] text-[3.6vh] font-bold text-slate-900 leading-none truncate">{fmtHariTanggal.format(sekarang)}</p>
          </div>
          <JamDigital />
        </section>

        <Kartu ikon={History} judul="Absen terakhir" sub="5 scan terbaru hari ini">
          {papan.top.length === 0 && <Kosong teks="Belum ada yang scan hari ini." />}
          {papan.top.map((t) => {
            const masuk = t.jenis === 'MASUK';
            const IkonJenis = masuk ? LogIn : LogOut;
            const label = !masuk ? (t.status === 'TANPA_MASUK' ? 'Pulang · tanpa masuk' : 'Pulang')
              : t.status === 'Late' ? `Telat ${t.telat_menit}m` : 'Tepat waktu';
            const warna = !masuk ? 'bg-blue-50 text-blue-700' : t.status === 'Late' ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700';
            return (
              <li key={t.id} className="flex-1 min-h-0 flex items-center gap-[1.6vh] border-t border-slate-100 first:border-t-0">
                <IkonJenis className={`w-[2.2vh] h-[2.2vh] shrink-0 ${masuk ? 'text-slate-300' : 'text-blue-300'}`} aria-label={masuk ? 'Masuk' : 'Pulang'} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[2.1vh] font-semibold text-slate-900 truncate leading-tight">{t.nama}</span>
                  <span className="block text-[1.4vh] text-slate-400 truncate leading-tight">{t.keterangan}</span>
                </span>
                <span className={`shrink-0 text-[1.3vh] font-semibold px-[1vh] py-[0.35vh] rounded-full ${warna}`}>{label}</span>
                <span className="shrink-0 w-[7vh] text-right text-[2.3vh] font-bold text-slate-900 tabular-nums">{formatJam(t.waktu)}</span>
              </li>
            );
          })}
          {papan.top.length > 0 && <BarisKosong n={5 - papan.top.length} />}
        </Kartu>

        <Kartu ikon={Trophy} judul={`Paling sering datang pertama · ${fmtBulan.format(sekarang)}`}
          sub={papan.hari_kerja > 0 ? `dari ${papan.hari_kerja} hari kerja` : 'reset tiap tanggal 1'}>
          {papan.papan.length === 0 && <Kosong teks="Muncul setelah ada absen bulan ini." />}
          {papan.papan.map((p, i) => (
            <li key={p.nama} className="flex-1 min-h-0 flex items-center gap-[1.6vh] border-t border-slate-100 first:border-t-0">
              {i < 3 ? (
                <span className={`w-[3.6vh] h-[3.6vh] rounded-full ring-2 shadow-sm flex items-center justify-center text-[1.7vh] font-extrabold shrink-0 ${MEDALI[i]}`}>{i + 1}</span>
              ) : (
                <span className="w-[3.6vh] text-center text-[1.9vh] font-bold text-slate-300 tabular-nums shrink-0">{i + 1}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-[1vh]">
                  <span className="text-[2.1vh] font-semibold text-slate-900 truncate leading-tight">{p.nama}</span>
                  <span className="text-[1.4vh] text-slate-400 truncate shrink-0">{p.keterangan}</span>
                </span>
                <span className="mt-[0.6vh] block h-[0.7vh] rounded-full bg-slate-100 overflow-hidden">
                  <span className={`block h-full rounded-full ${i === 0 ? 'bg-amber-400' : 'bg-blue-500'}`} style={{ width: `${Math.max(p.persen, 2)}%` }} />
                </span>
              </span>
              <span className="shrink-0 w-[7vh] text-right">
                <span className="block text-[2.3vh] font-bold text-slate-900 tabular-nums leading-tight">{p.persen}%</span>
                <span className="block text-[1.25vh] text-slate-400 tabular-nums leading-tight">{p.hari_pertama} hari</span>
              </span>
            </li>
          ))}
          {papan.papan.length > 0 && <BarisKosong n={5 - papan.papan.length} />}
        </Kartu>
      </div>

      {/* ================= KANAN: QR ================= */}
      <section className="relative min-h-0 bg-white border border-slate-200/80 rounded-[2.4vh] shadow-sm flex flex-col items-center justify-center px-[4vh] py-[3vh]">
        {lokasiList.length > 1 && (
          <div className="absolute top-[2vh] left-[2vh] inline-flex p-[0.35vh] bg-slate-100 rounded-[1vh]">
            {lokasiList.map(l => (
              <button key={l.id} onClick={() => gantiLokasi(l.id)}
                className={`px-[1.1vh] py-[0.4vh] rounded-[0.8vh] text-[1.35vh] font-semibold transition ${idLokasi === l.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}>
                {l.nama_cabang}
              </button>
            ))}
          </div>
        )}
        {!layarPenuh && (
          <button onClick={() => document.documentElement.requestFullscreen?.()} aria-label="Layar penuh"
            className="absolute top-[2vh] right-[2vh] p-[0.9vh] rounded-[1vh] text-slate-300 hover:text-slate-700 hover:bg-slate-100 transition">
            <Maximize className="w-[2.2vh] h-[2.2vh]" />
          </button>
        )}

        <h1 className="text-[3.4vh] font-bold text-slate-900 text-center leading-tight">Scan untuk absen</h1>
        <p className="text-[1.8vh] text-slate-500 text-center mt-[0.6vh]">Buka aplikasi absensi di HP, lalu arahkan kamera ke kode ini.</p>

        <div className="mt-[2.4vh] h-[52vh] aspect-square max-w-full p-[2.2vh] rounded-[2vh] bg-white ring-1 ring-slate-200 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.18)]">
          {qr ? (
            <QRCodeSVG value={qr} level="M" marginSize={0} className="w-full h-full" />
          ) : (
            <div className="w-full h-full rounded-[1.4vh] bg-slate-100 animate-pulse flex items-center justify-center text-[1.8vh] text-slate-400 text-center p-[3vh]">
              {galat || 'Menyiapkan kode...'}
            </div>
          )}
        </div>

        <div className="mt-[2.8vh] flex items-center gap-[1.1vh] text-[1.8vh] text-slate-500">
          <svg viewBox="0 0 36 36" className="w-[3vh] h-[3vh] -rotate-90" aria-hidden="true">
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" className="stroke-slate-200" />
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" strokeLinecap="round" pathLength="100"
              strokeDasharray={`${persenQr} 100`} className={`transition-[stroke-dasharray] duration-700 ${countdown <= 3 ? 'stroke-orange-500' : 'stroke-blue-600'}`} />
          </svg>
          <span>Kode berganti dalam <strong className="text-slate-900 tabular-nums">{countdown}</strong> detik</span>
        </div>
        {galat && qr && <p className="mt-[1.2vh] text-[1.6vh] text-rose-600">{galat}</p>}
      </section>

      {/* ================= BAR BAWAH: OB bertugas + kehadiran tim ================= */}
      <section className="min-w-0 h-[7.6vh] bg-white border border-slate-200/80 rounded-[2vh] shadow-sm flex items-center gap-[1.4vh] px-[2vh]">
        <span className="w-[4.4vh] h-[4.4vh] rounded-full bg-violet-50 text-violet-600 flex items-center justify-center shrink-0"><UserRoundCheck className="w-[2.4vh] h-[2.4vh]" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[1.3vh] font-semibold uppercase tracking-[0.12em] text-violet-600 leading-none">OB bertugas</p>
          {papan.ob?.length ? (
            <p className="mt-[0.6vh] flex items-center gap-[1.6vh] text-[1.9vh] text-slate-900 leading-tight overflow-hidden whitespace-nowrap">
              {papan.ob.map(o => (
                <span key={`${o.nama}-${o.masuk}`} className="inline-flex items-center gap-[0.7vh] min-w-0" title={`${o.shift} ${o.jam}`}>
                  <b className="font-semibold truncate">{o.nama}</b>
                  <span className="shrink-0 text-[1.4vh] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-[0.8vh] py-[0.1vh]">{o.shift}</span>
                </span>
              ))}
            </p>
          ) : <p className="mt-[0.5vh] text-[1.7vh] text-slate-400 leading-tight">Belum ada OB yang absen masuk.</p>}
        </div>
      </section>
      <section className="min-w-0 h-[7.6vh] bg-white border border-slate-200/80 rounded-[2vh] shadow-sm flex items-center gap-[1.6vh] pl-[2vh] overflow-hidden">
        <span className="shrink-0 flex items-center gap-[1vh]">
          <Users className="w-[2.4vh] h-[2.4vh] text-blue-600" />
          <span className="text-[1.3vh] font-semibold uppercase tracking-[0.12em] text-blue-600 leading-tight">Hadir<br />per tim</span>
        </span>
        {papan.tim?.length ? <RunningTim tim={papan.tim} /> : <p className="text-[1.7vh] text-slate-400">Belum ada data tim.</p>}
      </section>

      {/* ================= BUBBLE SCAN (kiri bawah, di atas bar, khusus lokasi ini) ================= */}
      {bubble && isiBubble && (
        <div aria-live="polite" className="fixed left-[3vh] bottom-[12.5vh] z-50 w-[30vw] max-w-[560px]">
          <div key={bubble.id}
            className={`animasi-bubble flex items-center gap-[1.5vh] bg-white/95 backdrop-blur border border-slate-200 rounded-[2vh] shadow-2xl shadow-slate-900/20 p-[1.6vh] pr-[2.2vh] transition-all duration-300 ${bubble.tampil ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[2vh]'}`}>
            <span className={`w-[5.4vh] h-[5.4vh] rounded-full ${isiBubble.warna} text-white flex items-center justify-center shrink-0`}>
              <IkonBubble className="w-[2.8vh] h-[2.8vh]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[2.2vh] font-bold text-slate-900 truncate leading-tight">{bubble.nama}</span>
              <span className="block text-[1.6vh] text-slate-500 truncate">
                <span className="font-semibold text-slate-800 tabular-nums">{isiBubble.label}</span> · {isiBubble.sub}
              </span>
            </span>
            {antre > 0 && (
              <span className="self-start shrink-0 text-[1.3vh] font-semibold text-blue-700 bg-blue-50 rounded-full px-[1vh] py-[0.25vh]">
                +{antre}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
