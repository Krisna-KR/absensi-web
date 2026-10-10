'use client';
import { useEffect, useState } from "react";
import { Calendar, Home, LogOut, Users, FileText, Database, MonitorSmartphone, Loader2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import Notifikasi from "@/components/Notifikasi";
import { supabase } from "@/utils/supabase/client";
import { ambilToken, hapusToken } from "@/utils/sesi";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState(null);
  const [keluar, setKeluar] = useState(false);

  // Cek sesi admin setiap pindah halaman
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
  }, [pathname, router]);

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
      ? "flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg border border-blue-100 font-semibold shrink-0"
      : "flex items-center gap-2 hover:text-slate-900 transition-colors text-slate-500 font-medium px-3 py-2 shrink-0";
  };
  const inisial = admin.username.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <nav className="flex flex-col lg:flex-row items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shadow-sm gap-4 print:hidden">

        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-start">
            <div className="flex items-center gap-3">
              <Image src="/logo-kr.png" alt="Logo KR" width={40} height={40} priority className="w-10 h-10 rounded-lg shadow-sm" />
              <div className="flex items-center gap-2">
                  <span className="text-slate-900 font-bold text-lg tracking-wide whitespace-nowrap">Absensi KR</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 rounded">ADMIN</span>
              </div>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <Notifikasi />
              <button onClick={logout} disabled={keluar} aria-label="Keluar" className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-rose-600">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
        </div>

        <div className="flex items-center gap-1 text-sm w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0 scrollbar-hide whitespace-nowrap">
            <Link href="/" className={getNavClass("/")}><Home className="w-4 h-4 shrink-0" /> Dashboard</Link>
            <Link href="/kehadiran" className={getNavClass("/kehadiran")}><Calendar className="w-4 h-4 shrink-0" /> Kehadiran</Link>
            <Link href="/karyawan" className={getNavClass("/karyawan")}><Users className="w-4 h-4 shrink-0" /> Karyawan</Link>
            <Link href="/rekap" className={getNavClass("/rekap")}><FileText className="w-4 h-4 shrink-0" /> Rekap</Link>
            <Link href="/master" className={getNavClass("/master")}><Database className="w-4 h-4 shrink-0" /> Master Data</Link>
            <Link href="/qr-kiosk" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white bg-slate-900 hover:bg-slate-800 transition px-4 py-2 rounded-lg font-semibold shrink-0">
                <MonitorSmartphone className="w-4 h-4" /> Layar Presensi
            </Link>
        </div>

        <div className="hidden lg:flex items-center justify-end gap-4 w-auto shrink-0">
            <Notifikasi />
            <div className="flex items-center gap-3 border-l border-slate-200 pl-5">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm">{inisial}</div>
                <div className="flex flex-col">
                    <span className="text-slate-900 text-sm font-semibold">{admin.username}</span>
                    <span className="text-slate-500 text-xs capitalize">{admin.role}</span>
                </div>
            </div>
            <button onClick={logout} disabled={keluar} className="flex items-center gap-2 text-slate-500 hover:text-rose-600 transition-colors ml-2 text-sm font-medium disabled:opacity-50">
                {keluar ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Keluar
            </button>
        </div>
      </nav>

      <main className="flex-1 p-6 print:p-0">
        {children}
      </main>
    </div>
  );
}
