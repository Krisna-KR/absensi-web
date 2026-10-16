'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, LogIn, LogOut } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { kodeError } from '@/utils/sesi';
import { pesanError } from '@/utils/pesanError';
import { STATUS_KEHADIRAN } from '@/utils/kehadiran';
import { tanggalWIB, formatJam } from '@/utils/waktu';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const JUMLAH_BULAN = 3;

// Kelompok ringkasan di label bulan & minggu
const RINGKAS = [
  { key: 'tepat', label: 'Tepat', cls: 'bg-blue-50 text-blue-700', cocok: s => s === 'Hadir' },
  { key: 'telat', label: 'Telat', cls: 'bg-orange-50 text-orange-700', cocok: s => s === 'Late' },
  { key: 'izin', label: 'Izin', cls: 'bg-violet-50 text-violet-700', cocok: s => s === 'Izin' },
  { key: 'sakit', label: 'Sakit', cls: 'bg-violet-50 text-violet-700', cocok: s => s === 'Sakit' },
  { key: 'cuti', label: 'Cuti', cls: 'bg-violet-50 text-violet-700', cocok: s => s === 'Cuti' },
  { key: 'alpha', label: 'Alpha', cls: 'bg-red-50 text-red-700', cocok: s => s === 'Bolos' },
];

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const infoTanggal = (t) => {
  const [y, m, d] = String(t).slice(0, 10).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, dow };
};
// Minggu ke-n dalam bulan, minggu dimulai hari Senin (tanggal 1 selalu masuk minggu 1)
const mingguKe = (y, m, d) => {
  const dow1 = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const geser = (dow1 + 6) % 7; // Senin = 0
  return Math.floor((d + geser - 1) / 7) + 1;
};

function hitung(rows) {
  const c = Object.fromEntries(RINGKAS.map(r => [r.key, rows.filter(x => r.cocok(x.status)).length]));
  c.semuaLibur = rows.length > 0 && rows.every(x => x.status === 'Libur');
  return c;
}

function Chips({ c }) {
  const ada = RINGKAS.filter(r => c[r.key] > 0);
  if (!ada.length) return <span className="text-[11px] text-slate-400">{c.semuaLibur ? 'Libur' : 'Belum ada absen'}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {ada.map(r => <span key={r.key} className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${r.cls}`}>{r.label} {c[r.key]}</span>)}
    </span>
  );
}

/** Tab History di HP: 3 bulan terakhir, dikelompokkan bulan > minggu > hari */
export default function RiwayatKehadiran({ onSesiHabis }) {
  const [rows, setRows] = useState(null);
  const [galat, setGalat] = useState('');
  const sesiHabisRef = useRef(onSesiHabis);
  useEffect(() => { sesiHabisRef.current = onSesiHabis; });
  const hariIni = tanggalWIB();
  const [bukaBulan, setBukaBulan] = useState(() => new Set([hariIni.slice(0, 7)]));
  const [bukaMinggu, setBukaMinggu] = useState(() => {
    const { y, m, d } = infoTanggal(hariIni);
    return new Set([`${hariIni.slice(0, 7)}-w${mingguKe(y, m, d)}`]);
  });

  useEffect(() => {
    let batal = false;
    (async () => {
      const [y, m] = hariIni.split('-').map(Number);
      const awal = new Date(Date.UTC(y, m - 1 - (JUMLAH_BULAN - 1), 1));
      const { data, error } = await supabase.rpc('fn_kehadiran_saya', {
        p_mulai: ymd(awal.getUTCFullYear(), awal.getUTCMonth() + 1, 1), p_sampai: hariIni,
      });
      if (batal) return;
      if (error) {
        if (kodeError(error) === 'SESI_HABIS') { sesiHabisRef.current(); return; }
        setGalat(pesanError(error)); setRows([]); return;
      }
      setRows(data || []);
    })();
    return () => { batal = true; };
  }, [hariIni]);

  const bulan = useMemo(() => {
    const peta = new Map();
    (rows || []).forEach(r => {
      const t = String(r.tanggal).slice(0, 10);
      const { y, m, d, dow } = infoTanggal(t);
      const kb = t.slice(0, 7);
      if (!peta.has(kb)) peta.set(kb, { key: kb, label: `${BULAN[m - 1]} ${y}`, minggu: new Map(), hari: [] });
      const b = peta.get(kb);
      const w = mingguKe(y, m, d);
      if (!b.minggu.has(w)) b.minggu.set(w, { key: `${kb}-w${w}`, no: w, hari: [] });
      const item = { ...r, t, d, dow, m };
      b.minggu.get(w).hari.push(item);
      b.hari.push(item);
    });
    return [...peta.values()]
      .sort((a, b) => b.key.localeCompare(a.key))   // bulan terbaru di atas
      .map(b => ({
        ...b,
        c: hitung(b.hari),
        minggu: [...b.minggu.values()].sort((a, c) => a.no - c.no).map(w => {
          const hari = w.hari.sort((a, c) => a.t.localeCompare(c.t));
          const dari = hari[0], sampai = hari[hari.length - 1];
          return { ...w, hari, c: hitung(hari), rentang: dari.d === sampai.d ? `${dari.d} ${BULAN_PENDEK[dari.m - 1]}` : `${dari.d}–${sampai.d} ${BULAN_PENDEK[sampai.m - 1]}` };
        }),
      }));
  }, [rows]);

  const toggle = (set, setter, key) => setter(() => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  return (
    <div className="flex-1 px-5 pt-6 pb-28 space-y-4">
      <div>
        <h2 className="text-2xl font-black text-slate-900">Riwayat Kehadiran</h2>
        <p className="text-sm text-slate-500">{JUMLAH_BULAN} bulan terakhir. Ketuk bulan, lalu minggu, untuk melihat per hari.</p>
      </div>
      {galat && <div className="p-3 rounded-xl text-sm border bg-rose-50 border-rose-200 text-rose-700">Riwayat belum bisa dimuat. {galat}</div>}
      {rows === null && <div className="py-12 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>}
      {rows && bulan.length === 0 && !galat && <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-sm text-slate-500">Belum ada riwayat kehadiran.</div>}

      <ul className="space-y-3">
        {bulan.map(b => {
          const terbuka = bukaBulan.has(b.key);
          return (
            <li key={b.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <button onClick={() => toggle(bukaBulan, setBukaBulan, b.key)} aria-expanded={terbuka}
                className="w-full flex items-center gap-3 p-4 text-left active:bg-slate-50">
                <span className="flex-1 min-w-0">
                  <span className="block font-black text-slate-900">{b.label}</span>
                  <span className="block mt-1.5"><Chips c={b.c} /></span>
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${terbuka ? 'rotate-180' : ''}`} />
              </button>

              {terbuka && (
                <ul className="border-t border-slate-100 divide-y divide-slate-100">
                  {b.minggu.map(w => {
                    const wBuka = bukaMinggu.has(w.key);
                    return (
                      <li key={w.key}>
                        <button onClick={() => toggle(bukaMinggu, setBukaMinggu, w.key)} aria-expanded={wBuka}
                          className="w-full flex items-center gap-3 pl-6 pr-4 py-3 text-left bg-slate-50/60 active:bg-slate-100">
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-bold text-slate-800">Minggu {w.no} <span className="font-medium text-slate-400">· {w.rentang}</span></span>
                            <span className="block mt-1"><Chips c={w.c} /></span>
                          </span>
                          <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${wBuka ? 'rotate-180' : ''}`} />
                        </button>

                        {wBuka && (
                          <ul className="divide-y divide-slate-100">
                            {w.hari.map(h => {
                              const st = STATUS_KEHADIRAN[h.status] || { label: h.status, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
                              const libur = h.status === 'Libur';
                              return (
                                <li key={h.t} className={`pl-8 pr-4 py-2.5 flex items-center gap-3 ${libur ? 'opacity-60' : ''}`}>
                                  <span className="w-14 shrink-0">
                                    <span className="block text-[11px] font-semibold text-slate-400 uppercase">{HARI[h.dow]}</span>
                                    <span className="block text-base font-black text-slate-900 leading-tight">{h.d} <span className="text-xs font-semibold text-slate-400">{BULAN_PENDEK[h.m - 1]}</span></span>
                                  </span>
                                  <span className="flex-1 min-w-0">
                                    <span className={`inline-block px-2 py-0.5 text-[11px] font-bold rounded-md border ${st.cls}`}>{st.label}</span>
                                    {h.status === 'Late' && h.durasi_telat_menit > 0 && <span className="ml-1.5 text-[11px] font-semibold text-orange-600">+{h.durasi_telat_menit} mnt</span>}
                                    {h.keterangan && <span className="block text-[11px] text-slate-500 truncate mt-0.5">{h.keterangan}</span>}
                                  </span>
                                  {(h.waktu_masuk || h.waktu_keluar) && (
                                    <span className="shrink-0 text-right text-xs tabular-nums text-slate-600 space-y-0.5">
                                      <span className="flex items-center justify-end gap-1"><LogIn className="w-3 h-3 text-slate-400" />{h.waktu_masuk ? formatJam(h.waktu_masuk) : '--.--'}</span>
                                      <span className="flex items-center justify-end gap-1"><LogOut className="w-3 h-3 text-slate-400" />{h.waktu_keluar ? formatJam(h.waktu_keluar) : '--.--'}</span>
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
