'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, UserPlus, Clock } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { tanggalWIB, formatJam, waktuRelatif } from '@/utils/waktu';

// Notifikasi: karyawan baru (7 hari terakhir) dan karyawan terlambat hari ini.
// Saat ini tampil untuk semua admin. Status "sudah dibaca" disimpan per browser.
const KUNCI_DIBACA = 'notif_terakhir_dibaca';
const INTERVAL_MS = 60_000;

function bacaTanda() {
  try { return Number(localStorage.getItem(KUNCI_DIBACA)) || 0; } catch { return 0; }
}

export default function Notifikasi() {
  const [buka, setBuka] = useState(false);
  const [items, setItems] = useState([]);
  const [dibaca, setDibaca] = useState(bacaTanda);
  const ref = useRef(null);

  useEffect(() => {
    let batal = false;
    const muat = async () => {
      const tujuhHariLalu = new Date(Date.now() - 7 * 86400000).toISOString();
      const [{ data: baru }, { data: telat }] = await Promise.all([
        supabase.from('karyawan').select('id, nama_lengkap, jabatan, created_at')
          .gte('created_at', tujuhHariLalu).order('created_at', { ascending: false }).limit(20),
        supabase.from('absensi').select('id, waktu_masuk, waktu_keluar, durasi_telat_menit, karyawan(nama_lengkap)')
          .eq('tanggal', tanggalWIB()).eq('status', 'Late').limit(50),
      ]);
      if (batal) return;
      const daftar = [
        ...(baru || []).map(k => ({
          id: `k-${k.id}`, jenis: 'baru', href: '/karyawan', waktu: k.created_at,
          judul: `${k.nama_lengkap} terdaftar sebagai ${k.jabatan || 'karyawan'}`,
        })),
        ...(telat || []).map(a => ({
          id: `a-${a.id}`, jenis: 'telat', href: '/kehadiran', waktu: a.waktu_masuk || a.waktu_keluar,
          judul: a.waktu_masuk
            ? `${a.karyawan?.nama_lengkap || 'Karyawan'} terlambat ${a.durasi_telat_menit ?? 0} menit`
            : `${a.karyawan?.nama_lengkap || 'Karyawan'} tidak absen masuk`,
          sub: a.waktu_masuk ? `Masuk jam ${formatJam(a.waktu_masuk)}` : `Absen pulang jam ${formatJam(a.waktu_keluar)}`,
        })),
      ].filter(i => i.waktu).sort((x, y) => new Date(y.waktu) - new Date(x.waktu));
      setItems(daftar);
    };
    muat();
    const t = setInterval(muat, INTERVAL_MS);
    return () => { batal = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!buka) return;
    const klikLuar = (e) => { if (ref.current && !ref.current.contains(e.target)) setBuka(false); };
    const esc = (e) => { if (e.key === 'Escape') setBuka(false); };
    document.addEventListener('mousedown', klikLuar);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', klikLuar); document.removeEventListener('keydown', esc); };
  }, [buka]);

  const belumDibaca = useMemo(() => items.filter(i => new Date(i.waktu).getTime() > dibaca).length, [items, dibaca]);

  const tandaiDibaca = () => {
    const sekarang = Date.now();
    try { localStorage.setItem(KUNCI_DIBACA, String(sekarang)); } catch { /* abaikan */ }
    setDibaca(sekarang);
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setBuka(b => !b)} aria-label={`Notifikasi${belumDibaca ? `, ${belumDibaca} belum dibaca` : ''}`} aria-expanded={buka}
        className="relative w-10 h-10 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition">
        <Bell className="w-5 h-5 text-slate-500" />
        {belumDibaca > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-sm">
            {belumDibaca > 9 ? '9+' : belumDibaca}
          </span>
        )}
      </button>

      {buka && (
        <div className="absolute right-0 mt-2 w-[340px] max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="font-bold text-slate-900 text-sm">Notifikasi</p>
            {belumDibaca > 0 && <button onClick={tandaiDibaca} className="text-xs font-semibold text-blue-600 hover:text-blue-700">Tandai sudah dibaca</button>}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Belum ada karyawan baru atau yang terlambat hari ini.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
              {items.map(i => {
                const baru = new Date(i.waktu).getTime() > dibaca;
                const Icon = i.jenis === 'baru' ? UserPlus : Clock;
                return (
                  <li key={i.id}>
                    <Link href={i.href} onClick={() => setBuka(false)} className={`flex gap-3 px-4 py-3 hover:bg-slate-50 ${baru ? 'bg-blue-50/40' : ''}`}>
                      <span className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${i.jenis === 'baru' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-800 leading-snug">{i.judul}</span>
                        <span className="block text-xs text-slate-400 mt-0.5">{i.sub ? `${i.sub} · ` : ''}{waktuRelatif(i.waktu)}</span>
                      </span>
                      {baru && <span className="w-2 h-2 rounded-full bg-blue-600 mt-2 shrink-0" aria-label="Belum dibaca" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
