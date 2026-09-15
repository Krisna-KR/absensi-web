import { Bell, Calendar, Home, LogOut, Users, FileText, Smartphone, Umbrella } from "lucide-react";
import Link from "next/link";

export default function AdminLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar Atas */}
      <nav className="flex flex-col md:flex-row items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50 gap-4">
        
        {/* Logo & Brand */}
        <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="w-10 h-10 rounded-full border border-slate-700 bg-slate-800 flex items-center justify-center text-yellow-500 font-bold">
                G
            </div>
            <div className="flex items-center gap-2">
                <span className="text-white font-bold text-lg tracking-wide">absensigifx</span>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-900/40 text-blue-400 border border-blue-800/50 rounded">ADMIN</span>
            </div>
        </div>

        {/* Menu Utama (Tengah) */}
        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-6 text-sm font-medium w-full md:w-auto">
            <Link href="/" className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 shadow-sm">
                <Home className="w-4 h-4 text-slate-400" /> Dashboard
            </Link>
            <Link href="#" className="flex items-center gap-2 hover:text-white transition-colors text-slate-400">
                <Calendar className="w-4 h-4" /> Kehadiran
            </Link>
            <Link href="/karyawan" className="flex items-center gap-2 hover:text-white transition-colors text-slate-400">
                <Users className="w-4 h-4" /> Karyawan
            </Link>
            <Link href="/rekap" className="flex items-center gap-2 hover:text-white transition-colors text-slate-400">
                <FileText className="w-4 h-4" /> Rekap
            </Link>
            <Link href="/master" className="flex items-center gap-2 hover:text-white transition-colors text-slate-400">
                <Umbrella className="w-4 h-4" /> Master Data
            </Link>
        </div>

        {/* Profil & Aksi */}
        <div className="flex items-center justify-end gap-6 w-full md:w-auto">
            <div className="relative cursor-pointer">
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition">
                    <Bell className="w-5 h-5 text-slate-400" />
                </div>
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-slate-900">3</span>
            </div>

            <div className="flex items-center gap-3 border-l border-slate-700 pl-6">
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
                    AR
                </div>
                <div className="flex flex-col hidden sm:flex">
                    <span className="text-white text-sm font-semibold">Admin</span>
                    <span className="text-slate-500 text-xs">Superuser</span>
                </div>
            </div>

            <button className="flex items-center gap-2 text-slate-400 hover:text-rose-400 transition-colors ml-2 sm:ml-4 text-sm font-medium">
                <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Keluar</span>
            </button>
        </div>
      </nav>

      {/* Area Konten Utama */}
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  );
}