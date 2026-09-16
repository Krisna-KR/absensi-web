'use client';
import { Bell, Calendar, Home, LogOut, Users, FileText, Umbrella, QrCode } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminLayout({ children }) {
  const pathname = usePathname();

  const getNavClass = (path) => {
    const isActive = pathname === path;
    return isActive
      ? "flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg border border-blue-100 font-semibold"
      : "flex items-center gap-2 hover:text-slate-900 transition-colors text-slate-500 font-medium px-4 py-2";
  };

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="flex flex-col md:flex-row items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shadow-sm gap-4">
        
        <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="w-10 h-10 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center text-blue-600 font-bold">
                KR
            </div>
            <div className="flex items-center gap-2">
                <span className="text-slate-900 font-bold text-lg tracking-wide">Absensi KR</span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 rounded">ADMIN</span>
            </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 text-sm w-full md:w-auto">
            <Link href="/" className={getNavClass("/")}>
                <Home className="w-4 h-4" /> Dashboard
            </Link>
            <Link href="/kehadiran" className={getNavClass("/kehadiran")}>
                <Calendar className="w-4 h-4" /> Kehadiran
            </Link>
            <Link href="/karyawan" className={getNavClass("/karyawan")}>
                <Users className="w-4 h-4" /> Karyawan
            </Link>
            <Link href="/rekap" className={getNavClass("/rekap")}>
                <FileText className="w-4 h-4" /> Rekap
            </Link>
            <Link href="/master" className={getNavClass("/master")}>
                <Umbrella className="w-4 h-4" /> Master Data
            </Link>
            {/* Tombol Kiosk QR ke Tab Baru */}
            <Link href="/qr-kiosk" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 bg-blue-50 hover:bg-blue-100 transition px-4 py-2 rounded-lg font-semibold border border-blue-200">
                <QrCode className="w-4 h-4" /> Buka Kiosk QR
            </Link>
        </div>

        <div className="flex items-center justify-end gap-6 w-full md:w-auto">
            <div className="relative cursor-pointer">
                <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition">
                    <Bell className="w-5 h-5 text-slate-500" />
                </div>
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">3</span>
            </div>
            <div className="flex items-center gap-3 border-l border-slate-200 pl-6">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                    AR
                </div>
                <div className="flex flex-col hidden sm:flex">
                    <span className="text-slate-900 text-sm font-semibold">Admin</span>
                    <span className="text-slate-500 text-xs">Superuser</span>
                </div>
            </div>
            <button className="flex items-center gap-2 text-slate-500 hover:text-rose-600 transition-colors ml-2 sm:ml-4 text-sm font-medium">
                <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Keluar</span>
            </button>
        </div>
      </nav>
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  );
}