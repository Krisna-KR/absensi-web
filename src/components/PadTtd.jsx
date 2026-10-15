'use client';
import { useEffect, useRef, useState } from 'react';
import { Eraser, Check, Loader2 } from 'lucide-react';

// Ukuran maksimum gambar yang disimpan. Kecil & hitam-putih supaya hemat ruang database (umumnya 3-15 KB).
const MAKS_W = 360;
const MAKS_H = 140;

/** Potong ruang kosong di sekitar coretan, lalu kecilkan ke maks 360x140 PNG */
function eksporKecil(kanvas) {
  const ctx = kanvas.getContext('2d');
  const { width: w, height: h } = kanvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const pad = Math.round(Math.min(w, h) * 0.04);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const sw = x1 - x0 + 1, sh = y1 - y0 + 1;
  const skala = Math.min(1, MAKS_W / sw, MAKS_H / sh);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw * skala));
  out.height = Math.max(1, Math.round(sh * skala));
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(kanvas, x0, y0, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/**
 * Bidang tanda tangan: coret pakai mouse (web) atau jari (HP).
 * onSimpan(dataUrl) dipanggil dengan PNG kecil base64.
 */
export default function PadTtd({ onSimpan, onBatal, sibuk = false, tombolSimpan = 'Simpan tanda tangan' }) {
  const kanvasRef = useRef(null);
  const sedangGambar = useRef(false);
  const titikTerakhir = useRef(null);
  const [kosong, setKosong] = useState(true);

  useEffect(() => {
    const c = kanvasRef.current;
    const atur = () => {
      const rasio = window.devicePixelRatio || 1;
      const r = c.getBoundingClientRect();
      c.width = Math.round(r.width * rasio);
      c.height = Math.round(r.height * rasio);
      const ctx = c.getContext('2d');
      ctx.setTransform(rasio, 0, 0, rasio, 0, 0);
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
      ctx.fillStyle = '#0f172a';
    };
    atur();
  }, []);

  const posisi = (e) => {
    const r = kanvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const mulai = (e) => {
    e.preventDefault();
    kanvasRef.current.setPointerCapture?.(e.pointerId);
    sedangGambar.current = true;
    const p = posisi(e);
    titikTerakhir.current = p;
    const ctx = kanvasRef.current.getContext('2d');
    ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2); ctx.fill();
    if (kosong) setKosong(false);
  };

  const gerak = (e) => {
    if (!sedangGambar.current) return;
    e.preventDefault();
    const p = posisi(e);
    const a = titikTerakhir.current;
    const ctx = kanvasRef.current.getContext('2d');
    const tengah = { x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(a.x, a.y, tengah.x, tengah.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    titikTerakhir.current = p;
  };

  const selesai = () => { sedangGambar.current = false; titikTerakhir.current = null; };

  const hapus = () => {
    const c = kanvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setKosong(true);
  };

  const simpan = () => {
    const hasil = eksporKecil(kanvasRef.current);
    if (hasil) onSimpan(hasil);
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-white">
        <canvas
          ref={kanvasRef}
          className="block w-full h-44 touch-none cursor-crosshair rounded-xl"
          onPointerDown={mulai} onPointerMove={gerak} onPointerUp={selesai} onPointerLeave={selesai} onPointerCancel={selesai}
          aria-label="Bidang tanda tangan"
        />
        <div className="pointer-events-none absolute left-6 right-6 bottom-9 border-b border-slate-200" />
        {kosong && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Coret tanda tangan di sini
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={hapus} disabled={kosong || sibuk}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 disabled:opacity-40">
          <Eraser className="w-4 h-4" />Ulangi
        </button>
        {onBatal && (
          <button type="button" onClick={onBatal} disabled={sibuk} className="px-3 py-2 rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-100">Batal</button>
        )}
        <button type="button" onClick={simpan} disabled={kosong || sibuk}
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">
          {sibuk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{tombolSimpan}
        </button>
      </div>
    </div>
  );
}
