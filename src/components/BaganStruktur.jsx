'use client';
import { useMemo, useState } from 'react';
import { formatTanggalPanjang, tanggalWIB } from '@/utils/waktu';

// Urutan tingkat jabatan dari atas ke bawah. Job role lain (belum dikenal) diletakkan setelahnya, A-Z.
const URUTAN_JABATAN = ['Branch Manager', 'Vice President', 'Senior Business Manager', 'Business Manager', 'Division Manager', 'Assistant Manager', 'MT', 'Marketing'];
const peringkat = (j) => { const i = URUTAN_JABATAN.indexOf(j); return i < 0 ? 50 : i; };
const bandingJabatan = (a, b) => peringkat(a) - peringkat(b) || String(a).localeCompare(String(b), 'id');

// Warna kotak per jabatan (mengikuti bagan manual tim)
const WARNA = {
  'Branch Manager': 'bg-orange-300 border-orange-400 text-orange-950',
  'Vice President': 'bg-rose-300 border-rose-400 text-rose-950',
  'Senior Business Manager': 'bg-green-500 border-green-600 text-green-950',
  'Business Manager': 'bg-lime-400 border-lime-500 text-lime-950',
  'Division Manager': 'bg-cyan-600 border-cyan-700 text-white',
  'Assistant Manager': 'bg-yellow-600 border-yellow-700 text-white',
  'MT': 'bg-yellow-300 border-yellow-400 text-yellow-950',
  'Marketing': 'bg-slate-100 border-slate-300 text-slate-800',
};
const WARNA_LAIN = 'bg-violet-200 border-violet-300 text-violet-950';
const warna = (j) => WARNA[j] || WARNA_LAIN;

function Kotak({ k, besar }) {
  return (
    <div className={`border rounded-md shadow-sm text-center leading-tight px-2 py-1.5 ${besar ? 'w-56' : 'w-36'} ${warna(k.jabatan)}`} title={`${k.nama_lengkap} · ${k.jabatan}`}>
      <p className={`font-semibold uppercase break-words ${besar ? 'text-xs' : 'text-[11px]'}`}>{k.nama_lengkap}</p>
      <p className={`uppercase opacity-80 ${besar ? 'text-[11px]' : 'text-[10px]'}`}>{k.jabatan}</p>
    </div>
  );
}

const Garis = () => <div className="w-px h-6 bg-slate-400 mx-auto print:bg-black" />;

/**
 * Bagan hirarki satu tim Marketing (hanya tampilan).
 * Data apa adanya dari tabel karyawan: Branch Manager / VP (Backoffice, job role "bisa jadi atasan")
 * -> kepala tim -> anggota dikelompokkan per jabatan. Karena atasan tiap anggota langsung ke kepala tim,
 * anggota tidak digambar bercabang di bawah Division Manager tertentu.
 *
 * semua      : karyawan aktif (sudah punya field divisi & lokasi)
 * atasanRole : Set nama job role "bisa jadi atasan"
 * idLokasi   : filter lokasi ('semua' atau id lokasi)
 */
export default function BaganStruktur({ semua, atasanRole, idLokasi }) {
  const tim = useMemo(() => {
    const kepala = semua.filter(k => k.divisi === 'Marketing' && atasanRole.has(k.jabatan) && (idLokasi === 'semua' || k.id_lokasi === idLokasi));
    return kepala.map(h => ({ kepala: h, anggota: semua.filter(m => m.id_atasan === h.id) }))
      .sort((a, b) => a.kepala.nama_lengkap.localeCompare(b.kepala.nama_lengkap, 'id'));
  }, [semua, atasanRole, idLokasi]);

  const [pilih, setPilih] = useState(null);
  const aktif = tim.find(t => t.kepala.id === pilih) || tim[0];

  const bagan = useMemo(() => {
    if (!aktif) return null;
    const h = aktif.kepala;
    // Pimpinan di atas kepala tim: Backoffice "bisa jadi atasan" di lokasi yang sama (kalau ada), urut tingkat jabatan
    const pimpinanSemua = semua.filter(k => k.divisi === 'Backoffice' && atasanRole.has(k.jabatan));
    const sesama = pimpinanSemua.filter(k => k.id_lokasi === h.id_lokasi);
    const pimpinan = (sesama.length ? sesama : pimpinanSemua).sort((a, b) => bandingJabatan(a.jabatan, b.jabatan) || a.nama_lengkap.localeCompare(b.nama_lengkap, 'id'));
    const per = new Map();
    for (const m of aktif.anggota) {
      if (!per.has(m.jabatan)) per.set(m.jabatan, []);
      per.get(m.jabatan).push(m);
    }
    const tingkat = [...per.entries()].sort(([a], [b]) => bandingJabatan(a, b))
      .map(([jabatan, orang]) => ({ jabatan, orang: orang.sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap, 'id')) }));
    const hitung = new Map();
    for (const k of [...pimpinan, h, ...aktif.anggota]) hitung.set(k.jabatan, (hitung.get(k.jabatan) || 0) + 1);
    const ringkas = [...hitung.entries()].sort(([a], [b]) => bandingJabatan(a, b));
    return { h, pimpinan, tingkat, ringkas, total: 1 + aktif.anggota.length };
  }, [aktif, semua, atasanRole]);

  if (!tim.length) {
    return <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">Belum ada tim Marketing di lokasi ini.</div>;
  }

  const namaPendek = bagan.h.nama_lengkap.split(' ')[0];

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide sm:flex-wrap print:hidden" role="tablist" aria-label="Pilih tim">
        {tim.map(t => {
          const dipilih = t.kepala.id === aktif.kepala.id;
          return (
            <button key={t.kepala.id} role="tab" aria-selected={dipilih} onClick={() => setPilih(t.kepala.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border font-semibold whitespace-nowrap ${dipilih ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              Tim {t.kepala.nama_lengkap}
              <span className={`text-xs tabular-nums ${dipilih ? 'text-white/70' : 'text-slate-400'}`}>{t.anggota.length + 1}</span>
            </button>
          );
        })}
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 print:border-0 print:shadow-none print:p-0 break-inside-avoid">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Info kiri: judul & jumlah per jabatan */}
          <div className="lg:w-56 shrink-0 space-y-3">
            <div className="bg-amber-400 text-amber-950 rounded-md px-3 py-2 text-xs font-semibold uppercase leading-snug">
              <p>Hirarki Tim {namaPendek}</p>
              {bagan.h.lokasi && bagan.h.lokasi !== '-' && <p>{bagan.h.lokasi}</p>}
              <p>{formatTanggalPanjang(tanggalWIB())}</p>
            </div>
            <dl className="border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-800 space-y-0.5">
              {bagan.ringkas.map(([j, n]) => (
                <div key={j} className="flex justify-between gap-2"><dt className="truncate">{j}</dt><dd className="tabular-nums">: {n}</dd></div>
              ))}
              <div className="flex justify-between gap-2 pt-2 mt-1 border-t border-slate-200 font-bold uppercase"><dt>Total tim {namaPendek}</dt><dd className="tabular-nums">: {bagan.total}</dd></div>
            </dl>
            <p className="text-[11px] text-slate-400 print:hidden">Total tim = kepala tim + anggota. Susunan mengikuti job role & atasan di halaman Karyawan.</p>
          </div>

          {/* Bagan */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div className="flex flex-col items-center py-2">
              {bagan.pimpinan.map(p => (
                <div key={p.id} className="flex flex-col items-center"><Kotak k={p} besar /><Garis /></div>
              ))}
              <Kotak k={bagan.h} besar />
              {bagan.tingkat.length === 0 ? (
                <p className="mt-6 text-sm text-slate-400">Belum ada anggota di tim ini.</p>
              ) : bagan.tingkat.map(t => (
                <div key={t.jabatan} className="w-full flex flex-col items-center">
                  <Garis />
                  <div className="w-full border border-dashed border-slate-300 rounded-xl px-3 pt-2 pb-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 text-center">{t.jabatan} · {t.orang.length}</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {t.orang.map(k => <Kotak key={k.id} k={k} />)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
