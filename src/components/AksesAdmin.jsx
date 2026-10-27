'use client';
import { createContext, useContext } from 'react';

// Menu & aksi yang bisa dicentang. Harus sama dengan fn_menu_akses() di database.
export const MENU_AKSES = [
  { menu: 'dashboard', label: 'Dashboard', aksi: ['lihat'] },
  { menu: 'kehadiran', label: 'Kehadiran', aksi: ['lihat'] },
  { menu: 'karyawan', label: 'Karyawan', aksi: ['lihat', 'tambah', 'ubah', 'hapus'] },
  { menu: 'rekap', label: 'Rekap & struktur', aksi: ['lihat', 'ubah'] },   // ubah = edit Diagram struktur
  { menu: 'allowance', label: 'Allowance', aksi: ['lihat', 'ubah'] },
  { menu: 'master', label: 'Master data', aksi: ['lihat', 'tambah', 'ubah', 'hapus'] },
  { menu: 'layar', label: 'Layar presensi', aksi: ['lihat'] },
  { menu: 'pengguna', label: 'Pengguna & hak akses', aksi: ['lihat', 'tambah', 'ubah', 'hapus'] },
];
export const LABEL_AKSI = { lihat: 'View', tambah: 'New', ubah: 'Edit', hapus: 'Delete' };
export const SEMUA_AKSI = ['lihat', 'tambah', 'ubah', 'hapus'];

// Halaman -> menu (dicek dari path paling spesifik)
const PETA_HALAMAN = [
  ['/master/pengguna', 'pengguna'],
  ['/master', 'master'],
  ['/rekap/allowance', 'allowance'],
  ['/rekap', 'rekap'],
  ['/kehadiran', 'kehadiran'],
  ['/karyawan', 'karyawan'],
  ['/', 'dashboard'],
];
export function menuDariPath(pathname) {
  const hit = PETA_HALAMAN.find(([p]) => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`)));
  return hit ? hit[1] : null;
}
// Halaman pertama yang boleh dibuka (untuk user tanpa akses Dashboard)
export const HALAMAN_MENU = { dashboard: '/', kehadiran: '/kehadiran', karyawan: '/karyawan', rekap: '/rekap/absensi', allowance: '/rekap/allowance', master: '/master', pengguna: '/master/pengguna' };

const AksesContext = createContext({ admin: null, boleh: () => false, muatUlang: () => {} });

/** admin: hasil fn_admin_saya() ({ akses: { menu: { lihat, tambah, ubah, hapus } }, is_superadmin, ... }) */
export function AksesProvider({ admin, muatUlang, children }) {
  const boleh = (menu, aksi = 'lihat') => !!admin && (admin.is_superadmin || !!admin.akses?.[menu]?.[aksi]);
  return <AksesContext.Provider value={{ admin, boleh, muatUlang }}>{children}</AksesContext.Provider>;
}

/** { admin, boleh(menu, aksi), muatUlang } */
export const useAkses = () => useContext(AksesContext);
