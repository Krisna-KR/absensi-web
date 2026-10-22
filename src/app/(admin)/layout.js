'use client';
import { useCallback, useEffect, useState } from "react";
import { Home, LogOut, Users, MonitorSmartphone, Loader2, KeyRound, ShieldX } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import Notifikasi from "@/components/Notifikasi";
import MenuRekap from "@/components/MenuRekap";
import MenuKehadiran from "@/components/MenuKehadiran";
import MenuMaster from "@/components/MenuMaster";
import GantiSandi from "@/components/GantiSandi";
import { AksesProvider, menuDariPath, HALAMAN_MENU, MENU_AKSES } from "@/components/AksesAdmin";
import { useFeedback } from "@/components/Feedback";
import { supabase } from "@/utils/supabase/client";
import { ambilToken, hapusToken } from "@/utils/sesi";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useFeedback();
  const [admin, setAdmin] = useState(null);
  const [keluar, setKeluar] = useState(false);
  const [gantiSandi, setGantiSandi] = useState(false);
  const [versi, setVersi] = useState(0);
  const muatUlang = useCallback(() => setVersi(v => v + 1), []);

  // Cek sesi & hak akses setiap pindah halaman
  useEffect(() => {
    if (!ambilToken('admin')) { router.replace('/login'); return; }
    let batal = false;
    (async () => {
      const { data } = await supabase.rpc('fn_admin_saya');
      if (batal) return;
      if (!data) { hapusToken('admin'); router.replace('/login'); return; }
      setAdmin(data);
    })();
    return () => { batal = true; };
  }, [pathname, router, versi]);

  const boleh = (menu, aksi = 'lihat') => !!admin && (admin.is_superadmin || !!admin.akses?.[menu]?.[aksi]);
  const menuIni = menuDariPath(pathname);
  const bolehHalaman = !menuIni || boleh(menuIni);
  // Tanpa akses Dashboard: pindah ke halaman pertama yang boleh dibuka
  const halamanPertama = admin && MENU_AKSES.map(m => m.menu).find(m => HALAMAN_MENU[m] && boleh(m));
  useEffect(() => {
    if (admin && pathname === '/' && !bolehHalaman && halamanPertama) router.replace(HALAMAN_MENU[halamanPertama]);
  }, [admin, pathname, bolehHalaman, halamanPertama, router]);

  const logout = async () => {
    setKeluar(true);
    await supabase.rpc('fn_logout', { p_jenis: 'admin' });
    hapusToken('admin');
    router.replace('/login');
  };

  if (!admin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500 text-sm">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        Memeriksa sesi...
      </div>
    );
  }

  const getNavClass = (path) => {
    const isActive = pathname === path;
    return isActive
      ? "flex items-center gap-2 bg-blue-50 text-blue-700 px-2.5 2xl:px-3 py-2 rounded-lg border border-blue-100 font-semibold shrink-0"
      : "flex items-center gap-2 hover:text-slate-900 transition-colors text-slate-500 font-medium px-2.5 2xl:px-3 py-2 shrink-0";
  };
  const namaTampil = admin.nama || admin.username;
  const inisial = namaTampil.slice(0, 2).toUpperCase();
  const tombolSandi = (
    <button onClick={() => setGantiSandi(true)} aria-label="Ganti password" title="Ganti password"
      className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-blue-600 hover:border-blue-200 shrink-0">
      <KeyRound className="w-4 h-4" />
    </button>
  );

  return (
    <AksesProvider admin={admin} muatUlang={muatUlang}>
    <div className="min-h-screen flex flex-col latar-admin">
      <nav className="flex flex-col lg:flex-row items-center justify-between px-6 py-4 relative z-40 border-b border-slate-200/80 bg-white/90 shadow-sm gap-4 print:hidden">

        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-start">
            <div className="flex items-center gap-3">
              <Image src="/logo-gifx.png" alt="Logo GIFX" width={40} height={40} priority className="w-10 h-10 rounded-full shadow-sm" />
              <div className="flex items-center gap-2">
                  <span className="text-slate-900 font-bold text-lg tracking-wide whitespace-nowrap">Absensi GIFX</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 rounded uppercase">{admin.is_superadmin ? 'Superadmin' : 'Admin'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <Notifikasi />
              {tombolSandi}
              <button onClick={logout} disabled={keluar} aria-label="Keluar" className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-rose-600">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
        </div>

        <div className="flex items-center gap-0.5 2xl:gap-1 text-sm w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0 scrollbar-hide whitespace-nowrap">
            {boleh('dashboard') && <Link href="/" className={getNavClass("/")}><Home className="w-4 h-4 shrink-0" /> Dashboard</Link>}
            {boleh('kehadiran') && <MenuKehadiran />}
            {boleh('karyawan') && <Link href="/karyawan" className={getNavClass("/karyawan")}><Users className="w-4 h-4 shrink-0" /> Karyawan</Link>}
            <MenuRekap />
            <MenuMaster />
            {boleh('layar') && (
              <Link href="/qr-kiosk" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white bg-slate-900 hover:bg-slate-800 transition px-3 2xl:px-4 py-2 rounded-lg font-semibold shrink-0">
                  <MonitorSmartphone className="w-4 h-4" /> Layar Presensi
              </Link>
            )}
        </div>

        <div className="hidden lg:flex items-center justify-end gap-3 2xl:gap-4 w-auto shrink-0">
            <Notifikasi />
            {tombolSandi}
            <div className="flex items-center gap-3 border-l border-slate-200 pl-3 2xl:pl-5" title={`${admin.username} (${admin.role})`}>
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm">{inisial}</div>
                <div className="hidden 2xl:flex flex-col">
                    <span className="text-slate-900 text-sm font-semibold">{namaTampil}</span>
                    <span className="text-slate-500 text-xs capitalize">{admin.role}</span>
                </div>
            </div>
            <button onClick={logout} disabled={keluar} aria-label="Keluar" title="Keluar" className="flex items-center gap-2 text-slate-500 hover:text-rose-600 transition-colors ml-1 2xl:ml-2 text-sm font-medium disabled:opacity-50">
                {keluar ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}<span className="hidden 2xl:inline">Keluar</span>
            </button>
        </div>
      </nav>

      <main className="flex-1 p-6 print:p-0">
        {bolehHalaman ? children : (
          <div className="max-w-lg mx-auto mt-10 bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
            <ShieldX className="w-10 h-10 mx-auto text-rose-400 mb-3" />
            <h1 className="text-lg font-bold text-slate-900">Tidak punya akses ke halaman ini</h1>
            <p className="text-sm text-slate-500 mt-1">Minta superadmin menambahkan hak View untuk menu ini.</p>
            {halamanPertama && <Link href={HALAMAN_MENU[halamanPertama]} className="inline-block mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">Buka halaman lain</Link>}
          </div>
        )}
      </main>

      {(gantiSandi || admin.wajib_ganti_sandi) && (
        <GantiSandi rpc="fn_admin_ganti_sandi" wajib={!!admin.wajib_ganti_sandi} onClose={() => setGantiSandi(false)}
          onSelesai={() => { setGantiSandi(false); toast('Password sudah diganti.'); muatUlang(); }} />
      )}
    </div>
    </AksesProvider>
  );
}
