'use client';
import { useEffect, useMemo, useState } from 'react';
import { Printer, Users, Briefcase, Megaphone, MapPin, Crown, ChevronDown } from 'lucide-react';
import RekapAllowance from '@/components/RekapAllowance';
import { supabase } from '@/utils/supabase/client';
import { pesanError } from '@/utils/pesanError';
import { formatTanggal, tanggalWIB } from '@/utils/waktu';

const LABEL_DIVISI = {
  Marketing: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Backoffice: 'bg-blue-50 text-blue-700 border-blue-200',
};

function Kartu({ icon: Icon, judul, nilai, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 print:shadow-none">
      <p className="text-sm text-slate-500 inline-flex items-center gap-1.5"><Icon className="w-4 h-4" />{judul}</p>
      <p className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{nilai}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function TabelGrup({ judul, sub, aksen, baris }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden break-inside-avoid print:shadow-none">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 relative">
        <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: aksen }} />
        <div>
          <h2 className="font-semibold text-slate-900">{judul}</h2>
          {sub && <p className="text-xs text-slate-500">{sub}</p>}
        </div>
        <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2.5 py-1 tabular-nums">{baris.length} orang</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-600 min-w-[640px]">
          <thead className="text-xs text-slate-500 bg-slate-50">
            <tr>
              <th className="px-5 py-2 font-semibold w-10">No</th>
              <th className="px-5 py-2 font-semibold">Nama</th>
              <th className="px-5 py-2 font-semibold">Jabatan</th>
              <th className="px-5 py-2 font-semibold">Divisi</th>
              <th className="px-5 py-2 font-semibold">Team Leader</th>
              <th className="px-5 py-2 font-semibold">Lokasi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {baris.map((k, i) => (
              <tr key={k.id}>
                <td className="px-5 py-2.5 text-slate-400 tabular-nums">{i + 1}</td>
                <td className="px-5 py-2.5">
                  <p className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                    {k.atasanTim && <Crown className="w-3.5 h-3.5 text-amber-500" aria-label="Team leader" />}{k.nama_lengkap}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">{k.nip}</p>
                </td>
                <td className="px-5 py-2.5"><span className="px-2 py-0.5 text-xs font-semibold rounded-md border border-slate-200 text-slate-700 bg-white">{k.jabatan}</span></td>
                <td className="px-5 py-2.5"><span className={`px-2 py-0.5 text-xs font-semibold rounded-md border ${LABEL_DIVISI[k.divisi] || 'border-slate-200'}`}>{k.divisi}</span></td>
                <td className="px-5 py-2.5 text-slate-700">{k.teamLeader || <span className="text-slate-300">–</span>}</td>
                <td className="px-5 py-2.5 text-slate-700">{k.lokasi}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const JENIS = [
  { v: 'rekap', l: 'Rekap struktur karyawan' },
  { v: 'allowance', l: 'Allowance' },
];
const KUNCI_JENIS = 'rekap_jenis';

// Dropdown pemilih laporan (Rekap / Allowance), menggantikan judul halaman
function PilihJenis({ value, onChange }) {
  return (
    <div className="relative inline-flex items-center print:hidden">
      <label htmlFor="jenis-rekap" className="sr-only">Jenis laporan</label>
      <select id="jenis-rekap" value={value} onChange={e => onChange(e.target.value)}
        className="appearance-none bg-transparent text-2xl font-bold text-slate-900 pr-9 py-0.5 rounded-lg cursor-pointer outline-none hover:bg-slate-50 focus:ring-2 focus:ring-blue-100">
        {JENIS.map(j => <option key={j.v} value={j.v}>{j.l}</option>)}
      </select>
      <ChevronDown className="w-5 h-5 text-slate-400 absolute right-2 pointer-events-none" />
    </div>
  );
}

export default function RekapPage() {
  const [jenis, setJenis] = useState(() => {
    try { return localStorage.getItem(KUNCI_JENIS) === 'allowance' ? 'allowance' : 'rekap'; } catch { return 'rekap'; }
  });
  const ganti = (v) => { setJenis(v); try { localStorage.setItem(KUNCI_JENIS, v); } catch { /* abaikan */ } };
  const pilih = <PilihJenis value={jenis} onChange={ganti} />;
  return jenis === 'allowance' ? <RekapAllowance pilihJenis={pilih} /> : <RekapStruktur pilihJenis={pilih} />;
}

function RekapStruktur({ pilihJenis }) {
  const [data, setData] = useState({ karyawan: [], departemen: [], lokasi: [], jabatan: [] });
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState('');
  const [filterLokasi, setFilterLokasi] = useState('semua');

  useEffect(() => {
    let batal = false;
    (async () => {
      const [k, d, l, j] = await Promise.all([
        supabase.from('karyawan').select('id, nip, nama_lengkap, jabatan, id_departemen, id_atasan, id_lokasi').eq('is_aktif', true).eq('is_approved', true).order('nama_lengkap'),
        supabase.from('master_departemen').select('id, nama_departemen'),
        supabase.from('master_lokasi').select('id, nama_cabang').order('nama_cabang'),
        supabase.from('master_jabatan').select('nama, bisa_jadi_atasan'),
      ]);
      if (batal) return;
      const e = [k, d, l, j].find(r => r.error)?.error;
      if (e) setGalat(pesanError(e));
      setData({ karyawan: k.data || [], departemen: d.data || [], lokasi: l.data || [], jabatan: j.data || [] });
      setLoading(false);
    })();
    return () => { batal = true; };
  }, []);

  const laporan = useMemo(() => {
    const dept = Object.fromEntries(data.departemen.map(d => [d.id, d.nama_departemen]));
    const lok = Object.fromEntries(data.lokasi.map(l => [l.id, l.nama_cabang]));
    const atasanRole = new Set(data.jabatan.filter(j => j.bisa_jadi_atasan).map(j => j.nama));
    const byId = Object.fromEntries(data.karyawan.map(k => [k.id, k]));
    const semua = data.karyawan.map(k => ({
      ...k,
      divisi: dept[k.id_departemen] || '-',
      lokasi: lok[k.id_lokasi] || '-',
      teamLeader: byId[k.id_atasan]?.nama_lengkap || '',
    }));
    const tampil = filterLokasi === 'semua' ? semua : semua.filter(k => k.id_lokasi === filterLokasi);

    const backoffice = tampil.filter(k => k.divisi === 'Backoffice');
    const marketing = tampil.filter(k => k.divisi === 'Marketing');
    const leader = semua.filter(k => k.divisi === 'Backoffice' && atasanRole.has(k.jabatan));
    const tim = leader.map(l => ({
      leader: l,
      anggota: [
        ...(tampil.some(k => k.id === l.id) ? [{ ...l, atasanTim: true, teamLeader: '' }] : []),
        ...marketing.filter(m => m.id_atasan === l.id),
      ],
    })).filter(t => t.anggota.length > 0 && t.anggota.some(a => !a.atasanTim));
    const tanpaAtasan = marketing.filter(m => !leader.some(l => l.id === m.id_atasan));

    return { semua, tampil, backoffice, marketing, tim, tanpaAtasan };
  }, [data, filterLokasi]);

  return (
    <div className="space-y-4 print:space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-5 rounded-xl border border-slate-200 shadow-sm print:border-0 print:shadow-none print:p-0">
        <div>
          {pilihJenis}
          <h1 className="hidden print:block text-2xl font-bold text-slate-900">Laporan Struktur Karyawan</h1>
          <p className="hidden print:block text-sm text-slate-500">Per {formatTanggal(tanggalWIB())}{filterLokasi !== 'semua' ? ` · ${data.lokasi.find(l => l.id === filterLokasi)?.nama_cabang}` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg text-sm">
            {[{ id: 'semua', nama_cabang: 'Semua lokasi' }, ...data.lokasi].map(l => (
              <button key={l.id} onClick={() => setFilterLokasi(l.id)}
                className={`px-3 py-1 rounded-md font-semibold ${filterLokasi === l.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{l.nama_cabang}</button>
            ))}
          </div>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">
            <Printer className="w-4 h-4" /> Cetak
          </button>
        </div>
      </div>

      {galat && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">Laporan belum bisa dimuat. {galat}</div>}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kartu icon={Users} judul="Total karyawan aktif" nilai={laporan.tampil.length} />
            <Kartu icon={Briefcase} judul="Backoffice" nilai={laporan.backoffice.length} />
            <Kartu icon={Megaphone} judul="Marketing" nilai={laporan.marketing.length} sub={`${laporan.tim.length} tim`} />
            <Kartu icon={MapPin} judul="Per lokasi" nilai={data.lokasi.map(l => laporan.tampil.filter(k => k.id_lokasi === l.id).length).join(' / ')}
              sub={data.lokasi.map(l => l.nama_cabang).join(' / ')} />
          </div>

          {laporan.backoffice.length > 0 && (
            <TabelGrup judul="Backoffice" sub="Business Manager, IT, Admin, dan job role Backoffice lain" aksen="#2a78d6"
              baris={laporan.backoffice.map(k => ({ ...k, teamLeader: '' }))} />
          )}

          {laporan.tim.map(t => (
            <TabelGrup key={t.leader.id} judul={`Tim ${t.leader.nama_lengkap}`} aksen="#1baf7a"
              sub={`Team leader: ${t.leader.nama_lengkap} (${t.leader.jabatan}, ${t.leader.lokasi})`} baris={t.anggota} />
          ))}

          {laporan.tanpaAtasan.length > 0 && (
            <TabelGrup judul="Marketing tanpa atasan" sub="Pilih atasan lewat halaman Karyawan" aksen="#e34948" baris={laporan.tanpaAtasan} />
          )}

          {laporan.tampil.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">Belum ada karyawan aktif di lokasi ini.</div>
          )}
        </>
      )}
    </div>
  );
}
