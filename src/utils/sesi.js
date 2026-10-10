// Token sesi disimpan per browser. Dikirim ke Supabase lewat header (lihat utils/supabase/client.js).
export const KUNCI_SESI = { admin: 'sesi_admin', karyawan: 'sesi_karyawan' };

export function ambilToken(jenis) {
  try { return localStorage.getItem(KUNCI_SESI[jenis]) || ''; } catch { return ''; }
}

export function simpanToken(jenis, token) {
  try { localStorage.setItem(KUNCI_SESI[jenis], token); } catch { /* abaikan */ }
}

export function hapusToken(jenis) {
  try { localStorage.removeItem(KUNCI_SESI[jenis]); } catch { /* abaikan */ }
}

/** Kode error dari fungsi database (RAISE EXCEPTION 'KODE') */
export const kodeError = (error) => String(error?.message || '').trim();
