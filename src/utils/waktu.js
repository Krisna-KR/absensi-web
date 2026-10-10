// Helper waktu WIB (Asia/Jakarta) yang tidak bergantung pada zona waktu browser.
export const TZ = 'Asia/Jakarta';

const fmtTanggal = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtJamAngka = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

/** 'YYYY-MM-DD' menurut WIB */
export function tanggalWIB(d = new Date()) {
  return fmtTanggal.format(d);
}

/** Jam (0-23) menurut WIB */
export function jamWIB(d = new Date()) {
  return parseInt(fmtJamAngka.format(d).slice(0, 2), 10) % 24;
}

/** 'HH:MM' menurut WIB dari ISO string, atau '' jika kosong */
export function jamMenitWIB(iso) {
  if (!iso) return '';
  return fmtJamAngka.format(new Date(iso));
}

/** Rentang tanggal (WIB) untuk filter periode */
export function rentangPeriode(periode, customDate) {
  const hariIni = tanggalWIB();
  const [y, m] = hariIni.split('-');
  if (periode === 'bulan_ini') {
    const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
    return { mulai: `${y}-${m}-01`, sampai: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
  }
  if (periode === 'tahun_ini') return { mulai: `${y}-01-01`, sampai: `${y}-12-31` };
  if (periode === 'custom') return customDate ? { mulai: customDate, sampai: customDate } : null;
  return { mulai: hariIni, sampai: hariIni };
}

export function formatJam(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

export function formatJamDetik(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/** 'YYYY-MM-DD' -> 'Sen, 05 Okt 2026' */
export function formatTanggal(ymd) {
  if (!ymd) return '-';
  const [y, m, d] = ymd.split('-').map(Number);
  const hari = HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${hari}, ${String(d).padStart(2, '0')} ${BULAN[m - 1]} ${y}`;
}

export function formatTanggalWaktu(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
