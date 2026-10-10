'use client';
import { useEffect, useRef, useState } from 'react';

// Grafik SVG ringan tanpa library tambahan.
// Aturan visual: grid tipis, batang dengan ujung membulat 4px, jarak 2px antar segmen,
// legenda selalu tampil untuk >= 2 seri, tooltip saat hover.

const INK = { muted: '#94a3b8', grid: '#eef2f6', baseline: '#cbd5e1' };

function useLebar() {
  const ref = useRef(null);
  const [lebar, setLebar] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLebar(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, lebar];
}

function batasAtas(maks) {
  if (maks <= 0) return 4;
  const pangkat = 10 ** Math.floor(Math.log10(maks));
  const langkah = [1, 2, 2.5, 5, 10].map(x => x * pangkat).find(x => maks / x <= 4) || pangkat * 10;
  return Math.ceil(maks / langkah) * langkah;
}

/** Path persegi dengan sudut atas membulat (ujung data). */
function pathBatang(x, y, w, h, r) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

export function Legenda({ seri }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {seri.map(s => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.warna }} />{s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Batang bertumpuk vertikal.
 * data: [{ label, judulTooltip, nilai: { [key]: number } }]
 * seri: [{ key, label, warna }] urutan dari bawah ke atas
 * garisAcuan: { setelahIndex, label } garis putus-putus vertikal (opsional)
 */
export function GrafikBatang({ data, seri, tinggi = 240, garisAcuan, satuan = '' }) {
  const [ref, lebar] = useLebar();
  const [hover, setHover] = useState(null);

  const m = { kiri: 36, kanan: 8, atas: 10, bawah: 26 };
  const w = Math.max(0, lebar - m.kiri - m.kanan);
  const h = tinggi - m.atas - m.bawah;
  const totals = data.map(d => seri.reduce((t, s) => t + (d.nilai[s.key] || 0), 0));
  const ymax = batasAtas(Math.max(0, ...totals));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(ymax * f));
  const band = data.length ? w / data.length : 0;
  const bw = Math.max(2, Math.min(32, band * 0.62));
  const skalaY = v => (v / ymax) * h;
  const langkahLabel = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(w / 44))));

  return (
    <div ref={ref} className="relative w-full" style={{ height: tinggi }} onMouseLeave={() => setHover(null)}>
      {lebar > 0 && (
        <svg width={lebar} height={tinggi} role="img" aria-label="Grafik batang">
          {ticks.map(t => (
            <g key={t}>
              <line x1={m.kiri} x2={m.kiri + w} y1={m.atas + h - skalaY(t)} y2={m.atas + h - skalaY(t)} stroke={t === 0 ? INK.baseline : INK.grid} />
              <text x={m.kiri - 8} y={m.atas + h - skalaY(t) + 4} textAnchor="end" fontSize="11" fill={INK.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>{t}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = m.kiri + i * band + (band - bw) / 2;
            let dasar = m.atas + h;
            const terisi = seri.filter(s => (d.nilai[s.key] || 0) > 0);
            return (
              <g key={i}>
                {hover === i && <rect x={m.kiri + i * band} y={m.atas} width={band} height={h} fill="#f1f5f9" />}
                {terisi.map((s, j) => {
                  const tinggiSeg = skalaY(d.nilai[s.key]);
                  const atas = j === terisi.length - 1;
                  const gap = j > 0 ? 2 : 0;
                  const hSeg = Math.max(0, tinggiSeg - gap);
                  dasar -= tinggiSeg;
                  const y = dasar;
                  return atas
                    ? <path key={s.key} d={pathBatang(x, y, bw, hSeg, 4)} fill={s.warna} />
                    : <rect key={s.key} x={x} y={y} width={bw} height={hSeg} fill={s.warna} />;
                })}
                {i % langkahLabel === 0 && (
                  <text x={m.kiri + i * band + band / 2} y={tinggi - 8} textAnchor="middle" fontSize="11" fill={INK.muted}>{d.label}</text>
                )}
                <rect x={m.kiri + i * band} y={m.atas} width={band} height={h + m.bawah} fill="transparent"
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
              </g>
            );
          })}
          {garisAcuan && (
            <g>
              <line x1={m.kiri + (garisAcuan.setelahIndex + 1) * band} x2={m.kiri + (garisAcuan.setelahIndex + 1) * band}
                y1={m.atas} y2={m.atas + h} stroke="#475569" strokeDasharray="4 4" />
              <text x={m.kiri + (garisAcuan.setelahIndex + 1) * band + 6} y={m.atas + 12} fontSize="11" fill="#475569">{garisAcuan.label}</text>
            </g>
          )}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute z-10 bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[150px]"
          style={{ left: Math.min(Math.max(0, m.kiri + hover * band + band / 2 - 75), Math.max(0, lebar - 160)), top: 0 }}>
          <p className="font-semibold text-slate-900 mb-1">{data[hover].judulTooltip || data[hover].label}</p>
          {[...seri].reverse().map(s => (
            <p key={s.key} className="flex items-center justify-between gap-4 text-slate-600">
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: s.warna }} />{s.label}</span>
              <span className="font-semibold text-slate-900 tabular-nums">{data[hover].nilai[s.key] || 0}{satuan}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Satu batang 100% horizontal untuk komposisi, dengan jarak 2px antar segmen. */
export function BatangKomposisi({ bagian }) {
  const total = bagian.reduce((t, b) => t + b.nilai, 0);
  if (!total) return <div className="h-3 rounded-full bg-slate-100" />;
  return (
    <div className="flex h-3 w-full gap-[2px]">
      {bagian.filter(b => b.nilai > 0).map(b => (
        <div key={b.key} title={`${b.label}: ${b.nilai}`} className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(b.nilai / total) * 100}%`, background: b.warna }} />
      ))}
    </div>
  );
}

/** Daftar batang horizontal dengan nilai di kanan. items: [{ key, label, nilai, teks, sub }] */
export function DaftarBatang({ items, warna, maks }) {
  const atas = maks ?? Math.max(1, ...items.map(i => i.nilai));
  return (
    <ul className="space-y-3">
      {items.map(i => (
        <li key={i.key} className="group">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-slate-700 truncate">{i.label}{i.sub && <span className="text-xs text-slate-400 ml-1.5">{i.sub}</span>}</span>
            <span className="font-semibold text-slate-900 tabular-nums shrink-0">{i.teks ?? i.nilai}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(2, (i.nilai / atas) * 100)}%`, background: warna }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
