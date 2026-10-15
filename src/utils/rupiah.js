// Format & baca angka rupiah (tanpa desimal)
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** 2650000 -> "2.650.000" */
export function angkaRupiah(n) {
  if (n === null || n === undefined || n === '') return '';
  return fmt.format(Number(n) || 0);
}

/** 2650000 -> "Rp 2.650.000" */
export function formatRupiah(n) {
  return `Rp ${angkaRupiah(n ?? 0)}`;
}

/** "2.650.000" / "Rp 2,650,000" -> 2650000 ; kosong -> null */
export function bacaRupiah(teks) {
  const digit = String(teks ?? '').replace(/\D/g, '');
  return digit === '' ? null : Number(digit);
}

/** 2650000 -> "2,7 juta" (untuk keterangan singkat) */
export function rupiahSingkat(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} juta`;
  if (v >= 1_000) return `${(v / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} ribu`;
  return String(v);
}
