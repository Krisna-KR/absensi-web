'use client';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, CalendarPlus, AtSign, Smartphone, LogIn } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { pesanError } from '@/utils/pesanError';
import { ambilKehadiran, STATUS_KEHADIRAN } from '@/utils/kehadiran';
import { tanggalWIB, periodeAbsensi, labelRentang, formatTanggalPanjang, formatTanggal, formatJam } from '@/utils/waktu';
import Modal from '@/components/Modal';
import MohonTunggu from '@/components/MohonTunggu';

const KOLOM = 'id, nip, nama_lengkap, username, jabatan, id_departemen, id_atasan, id_lokasi, device_id, is_approved, is_aktif, created_at';

// Kotak angka rekap
const KOTAK = [
  { key: 'masuk', label: 'Masuk', cls: 'text-slate-900' },
  { key: 'telat', label: 'Telat', cls: 'text-orange-600' },
  { key: 'alpha', label: 'Alpha', cls: 'text-red-600' },
  { key: 'izin', label: 'Izin', cls: 'text-violet-600' },
  { key: 'sakit', label: 'Sakit', cls: 'text-violet-600' },
  { key: 'cuti', label: 'Cuti', cls: 'text-violet-600' },
  { key: 'tanpaPulang', label: 'Tanpa absen pulang', cls: 'text-slate-700' },
  { key: 'libur', label: 'Libur', cls: 'text-slate-400' },
];

function ringkas(rows, hariIni) {
  const c = { masuk: 0, telat: 0, alpha: 0, izin: 0, sakit: 0, cuti: 0, tanpaPulang: 0, libur: 0, menitTelat: 0 };
  for (const r of rows) {
    if (r.waktu_masuk || r.waktu_keluar) c.masuk++;
    if (r.status === 'Late') { c.telat++; c.menitTelat += r.durasi_telat_menit || 0; }
    if (r.status === 'Bolos') c.alpha++;
    if (r.status === 'Izin') c.izin++;
    if (r.status === 'Sakit') c.sakit++;
    if (r.status === 'Cuti') c.cuti++;
    if (r.status === 'Libur' && !r.id_absensi) c.libur++;
    if (r.waktu_masuk && !r.waktu_keluar && r.tanggal < hariIni) c.tanpaPulang++;
  }
  return c;
}

/**
 * Popup info satu karyawan: tanggal daftar, username, absen terakhir, dan rekap per periode absensi (21–20).
 * id: id karyawan. Dipakai di Karyawan, Kehadiran, Tidak masuk, dan Rekap absensi.
 */
export default function InfoKaryawan({ id, onClose }) {
  const hariIni = tanggalWIB();
  const [info, setInfo] = useState(null);     // { kar, dept, atasan, lokasi, terakhir }
  const [galat, setGalat] = useState('');
  const [geser, setGeser] = useState(0);       // 0 = periode berjalan, -1 = sebelumnya, ...
  const [rekap, setRekap] = useState(null);    // { key, c } ; key = periode yang dimuat

  const periode = periodeAbsensi(hariIni, geser);
  const kunciPeriode = `${id}|${periode.mulai}`;

  useEffect(() => {
    const ac = new AbortController();   // dihentikan saat popup ditutup
    const sig = ac.signal;
    (async () => {
      const { data: kar, error } = await supabase.from('karyawan').select(KOLOM).eq('id', id).maybeSingle().abortSignal(sig);
      if (sig.aborted) return;
      if (error || !kar) { setGalat(error ? pesanError(error) : 'Karyawan tidak ditemukan.'); return; }
      const [d, a, l, t] = await Promise.all([
        kar.id_departemen ? supabase.from('master_departemen').select('nama_departemen').eq('id', kar.id_departemen).maybeSingle().abortSignal(sig) : { data: null },
        kar.id_atasan ? supabase.from('karyawan').select('nama_lengkap').eq('id', kar.id_atasan).maybeSingle().abortSignal(sig) : { data: null },
        kar.id_lokasi ? supabase.from('master_lokasi').select('nama_cabang').eq('id', kar.id_lokasi).maybeSingle().abortSignal(sig) : { data: null },
        supabase.from('absensi').select('tanggal, waktu_masuk, waktu_keluar, status').eq('id_karyawan', id)
          .or('waktu_masuk.not.is.null,waktu_keluar.not.is.null').order('tanggal', { ascending: false }).limit(1).maybeSingle().abortSignal(sig),
      ]);
      if (sig.aborted) return;
      setInfo({ kar, dept: d.data?.nama_departemen || null, atasan: a.data?.nama_lengkap || null, lokasi: l.data?.nama_cabang || null, terakhir: t.data || null });
    })();
    return () => ac.abort();
  }, [id]);

  useEffect(() => {
    const ac = new AbortController();   // dihentikan saat ganti periode / popup ditutup
    (async () => {
      try {
        const sampai = periode.sampai < hariIni ? periode.sampai : hariIni;
        const rows = periode.mulai > hariIni ? [] : await ambilKehadiran({ mulai: periode.mulai, sampai, idKaryawan: id, signal: ac.signal });
        if (!ac.signal.aborted) setRekap({ key: kunciPeriode, c: ringkas(rows, hariIni) });
      } catch (e) {
        if (!ac.signal.aborted) setRekap({ key: kunciPeriode, galat: pesanError(e) });
      }
    })();
    return () => ac.abort();
  }, [kunciPeriode, id, periode.mulai, periode.sampai, hariIni]);

  const kar = info?.kar;
  const tim = info?.dept === 'Marketing' ? `Tim ${info.atasan || kar?.nama_lengkap}` : info?.dept;
  const st = info?.terakhir && (STATUS_KEHADIRAN[info.terakhir.status] || { label: info.terakhir.status, cls: 'bg-slate-50 text-slate-600 border-slate-200' });
  const rekapSiap = rekap?.key === kunciPeriode;

  return (
    <Modal judul={kar ? kar.nama_lengkap : 'Info karyawan'} onClose={onClose} lebar="sm:max-w-lg" tutupDiLuar>
      <div className="p-5 sm:p-6 space-y-5">
        {galat ? <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">{galat}</p>
        : !info ? <MohonTunggu className="py-10" />
        : (
          <>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-mono text-slate-500 mr-1">{kar.nip}</span>
              {tim && <span className={`px-2 py-0.5 rounded-md border font-semibold ${info.dept === 'Marketing' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{tim}</span>}
              {kar.jabatan && <span className="px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 font-semibold">{kar.jabatan}</span>}
              {info.lokasi && <span className="inline-flex items-center gap-0.5 text-slate-500"><MapPin className="w-3 h-3" />{info.lokasi}</span>}
              {!kar.is_aktif && <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 font-semibold">Nonaktif</span>}
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1"><CalendarPlus className="w-3.5 h-3.5" />Tanggal daftar</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">{kar.created_at ? formatTanggalPanjang(tanggalWIB(new Date(kar.created_at))) : '–'}</dd>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1"><AtSign className="w-3.5 h-3.5" />Username</dt>
                <dd className="font-semibold text-slate-900 mt-0.5 font-mono">{kar.username || '–'}</dd>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1"><LogIn className="w-3.5 h-3.5" />Terakhir absen</dt>
                <dd className="mt-0.5">
                  {info.terakhir ? (
                    <>
                      <span className="font-semibold text-slate-900">{formatTanggal(info.terakhir.tanggal)}</span>
                      <span className="block text-xs text-slate-500 tabular-nums mt-0.5">
                        {formatJam(info.terakhir.waktu_masuk || info.terakhir.waktu_keluar)}
                        {st && <span className={`ml-1.5 px-1.5 py-0.5 rounded border text-[11px] font-semibold ${st.cls}`}>{st.label}</span>}
                      </span>
                    </>
                  ) : <span className="text-slate-400">Belum pernah absen</span>}
                </dd>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" />Akun</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">{!kar.is_approved ? 'Menunggu approve' : kar.device_id ? 'HP tertaut' : 'Belum login'}</dd>
              </div>
            </dl>

            <section className="rounded-xl border border-slate-200">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100">
                <button type="button" onClick={() => setGeser(g => g - 1)} aria-label="Periode sebelumnya" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
                <div className="text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Rekap periode absensi</p>
                  <p className="text-sm font-semibold text-slate-900">{labelRentang(periode.mulai, periode.sampai)}</p>
                </div>
                <button type="button" onClick={() => setGeser(g => g + 1)} disabled={geser >= 0} aria-label="Periode berikutnya" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              </div>
              {!rekapSiap ? (
                <MohonTunggu className="py-8" />
              ) : rekap.galat ? (
                <p className="p-3 text-sm text-rose-700">{rekap.galat}</p>
              ) : (
                <>
                  <dl className="grid grid-cols-4 divide-x divide-y divide-slate-100 [&>div:nth-child(-n+4)]:border-t-0">
                    {KOTAK.map(k => (
                      <div key={k.key} className="px-2 py-2.5 text-center border-slate-100">
                        <dd className={`text-xl font-black tabular-nums ${k.cls}`}>{rekap.c[k.key]}</dd>
                        <dt className="text-[11px] text-slate-500 leading-tight">{k.label}</dt>
                      </div>
                    ))}
                  </dl>
                  {rekap.c.menitTelat > 0 && <p className="px-3 py-2 border-t border-slate-100 text-xs text-slate-500">Total telat {rekap.c.menitTelat} menit.</p>}
                </>
              )}
            </section>
            <p className="text-[11px] text-slate-400">Hari ini dihitung sampai saat ini.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
