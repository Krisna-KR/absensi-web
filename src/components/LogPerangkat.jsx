'use client';
// Audit perangkat karyawan: login pertama (HP terkunci), ditolak karena HP lain, dan Lepas HP oleh admin.
// Tanda bahaya: akun dicoba dari HP yang terikat ke karyawan lain (indikasi titip absen),
// atau HP dilepas berulang kali.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { pesanError } from '@/utils/pesanError';
import { formatTanggalWaktu } from '@/utils/waktu';
import { namaBrowser } from '@/utils/perangkat';
import Modal from '@/components/Modal';
import MohonTunggu from '@/components/MohonTunggu';

const KEJADIAN = {
  IKAT: { label: 'Login pertama, HP terkunci', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  MASUK: { label: 'Login', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  HP_LAIN: { label: 'Ditolak: HP lain', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  LEPAS_HP: { label: 'Lepas HP oleh admin', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};
const RENTANG = [{ v: 7, l: '7 hari' }, { v: 30, l: '30 hari' }, { v: 90, l: '90 hari' }];
const kode = (id) => (id ? `#${String(id).slice(0, 4).toUpperCase()}` : '');

export default function LogPerangkat({ karyawan, onClose }) {
  const [hari, setHari] = useState(30);
  const [rows, setRows] = useState(null);
  const [galat, setGalat] = useState('');
  const [pilihKar, setPilihKar] = useState(null);
  const [cari, setCari] = useState('');
  const [lihatLogin, setLihatLogin] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setRows(null);
      const sejak = new Date(Date.now() - hari * 86400000).toISOString();
      const { data, error } = await supabase.from('log_perangkat')
        .select('id, waktu, id_karyawan, kejadian, device_id, device_terkunci, user_agent, ip, oleh')
        .gte('waktu', sejak).order('waktu', { ascending: false }).limit(3000).abortSignal(ac.signal);
      if (ac.signal.aborted) return;
      if (error) { setGalat(pesanError(error)); setRows([]); return; }
      setGalat(''); setRows(data || []);
    })();
    return () => ac.abort();
  }, [hari]);

  const karById = useMemo(() => Object.fromEntries(karyawan.map(k => [k.id, k])), [karyawan]);
  // Pemilik perangkat: yang sekarang terikat, ditambah yang pernah login pertama dari perangkat itu
  const pemilik = useMemo(() => {
    const m = {};
    (rows || []).filter(r => r.kejadian === 'IKAT' && r.device_id).forEach(r => { m[r.device_id] ??= r.id_karyawan; });
    karyawan.forEach(k => { if (k.device_id) m[k.device_id] = k.id; });
    return m;
  }, [rows, karyawan]);

  const baris = useMemo(() => (rows || []).map(r => {
    const milik = r.kejadian === 'HP_LAIN' && r.device_id ? pemilik[r.device_id] : null;
    return { ...r, milikLain: milik && milik !== r.id_karyawan ? milik : null };
  }), [rows, pemilik]);

  // Ringkasan per karyawan, yang paling perlu dicek di atas
  const ringkas = useMemo(() => {
    const m = {};
    baris.forEach(r => {
      const x = (m[r.id_karyawan] ||= { id: r.id_karyawan, ditolak: 0, lepas: 0, ikat: 0, hpLain: new Set() });
      if (r.kejadian === 'HP_LAIN') x.ditolak++;
      if (r.kejadian === 'LEPAS_HP') x.lepas++;
      if (r.kejadian === 'IKAT') x.ikat++;
      if (r.milikLain) x.hpLain.add(r.milikLain);
    });
    return Object.values(m)
      .map(x => ({ ...x, skor: x.hpLain.size * 100 + (x.lepas >= 2 ? 10 * x.lepas : 0) + (x.ditolak >= 3 ? x.ditolak : 0) }))
      .filter(x => x.skor > 0)
      .sort((a, b) => b.skor - a.skor);
  }, [baris]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return baris.filter(r =>
      (lihatLogin || r.kejadian !== 'MASUK') &&
      (!pilihKar || r.id_karyawan === pilihKar) &&
      (!q || (karById[r.id_karyawan]?.nama_lengkap || '').toLowerCase().includes(q)));
  }, [baris, lihatLogin, pilihKar, cari, karById]);

  const nama = (id) => karById[id]?.nama_lengkap || '(karyawan dihapus)';

  return (
    <Modal judul="Log HP karyawan" onClose={onClose} lebar="sm:max-w-5xl">
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">Catatan login pertama, penolakan karena HP lain, dan Lepas HP. Mulai tercatat 30 Okt 2026.</p>
          <div className="inline-flex p-1 bg-slate-100 rounded-lg text-sm">
            {RENTANG.map(r => (
              <button key={r.v} type="button" onClick={() => setHari(r.v)}
                className={`px-3 py-1 rounded-md font-semibold ${hari === r.v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{r.l}</button>
            ))}
          </div>
        </div>

        {galat && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">Log belum bisa dimuat. {galat}</div>}

        {rows === null ? <MohonTunggu className="py-12" /> : (
          <>
            <section>
              <h3 className="text-sm font-semibold text-slate-900 mb-2 inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-500" />Perlu dicek</h3>
              {ringkas.length === 0 ? (
                <p className="text-sm text-slate-500">Tidak ada pola mencurigakan di rentang ini.</p>
              ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {ringkas.map(x => (
                    <li key={x.id}>
                      <button type="button" onClick={() => setPilihKar(p => (p === x.id ? null : x.id))}
                        className={`w-full text-left px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-slate-50 ${pilihKar === x.id ? 'bg-blue-50' : ''}`}>
                        <span className="font-semibold text-slate-900">{nama(x.id)}</span>
                        {x.hpLain.size > 0 && <span className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-0.5">Dicoba dari HP milik {[...x.hpLain].map(nama).join(', ')}</span>}
                        {x.lepas >= 2 && <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">HP dilepas {x.lepas}×</span>}
                        {x.ditolak >= 3 && <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">Ditolak {x.ditolak}×</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input type="search" value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama" aria-label="Cari nama di log"
                    className="w-56 pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400" />
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={lihatLogin} onChange={e => setLihatLogin(e.target.checked)} /> Tampilkan login biasa
                </label>
                {pilihKar && <button type="button" onClick={() => setPilihKar(null)} className="text-sm font-semibold text-blue-600">Hanya {nama(pilihKar)} · tampilkan semua</button>}
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm text-left min-w-[760px]">
                  <thead className="text-xs text-slate-500 bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Waktu</th>
                      <th className="px-3 py-2 font-semibold">Karyawan</th>
                      <th className="px-3 py-2 font-semibold">Kejadian</th>
                      <th className="px-3 py-2 font-semibold">Perangkat</th>
                      <th className="px-3 py-2 font-semibold">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tampil.length === 0 ? (
                      <tr><td colSpan="5" className="px-3 py-8 text-center text-slate-500">Belum ada catatan.</td></tr>
                    ) : tampil.map(r => (
                      <tr key={r.id} className={r.milikLain ? 'bg-rose-50/60' : ''}>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatTanggalWaktu(r.waktu)}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{nama(r.id_karyawan)}</td>
                        <td className="px-3 py-2"><span className={`text-xs font-semibold border rounded-md px-2 py-0.5 whitespace-nowrap ${KEJADIAN[r.kejadian]?.cls || ''}`}>{KEJADIAN[r.kejadian]?.label || r.kejadian}</span></td>
                        <td className="px-3 py-2 text-slate-600">
                          {r.kejadian === 'LEPAS_HP' ? <span>Dilepas {kode(r.device_terkunci)}</span>
                            : <span>{namaBrowser(r.user_agent) || '–'} <span className="text-slate-400 font-mono text-xs">{kode(r.device_id)}</span></span>}
                          {r.kejadian === 'HP_LAIN' && <span className="block text-[11px] text-slate-400">Terkunci di {kode(r.device_terkunci)}</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {r.milikLain && <span className="font-semibold text-rose-700">HP ini terikat ke {nama(r.milikLain)}</span>}
                          {r.kejadian === 'LEPAS_HP' && <span>oleh {r.oleh || 'admin'}</span>}
                          {r.ip && <span className="block text-[11px] text-slate-400 font-mono">{r.ip}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400">Kode #XXXX = perangkat (browser) yang sama. Browser lain di HP yang sama tercatat sebagai perangkat berbeda.</p>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
