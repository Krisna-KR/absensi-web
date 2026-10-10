'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { ambilToken, simpanToken, hapusToken, kodeError } from '@/utils/sesi';
import { pesanError } from '@/utils/pesanError';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [lihatSandi, setLihatSandi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [galat, setGalat] = useState('');

  // Sudah login? langsung ke dashboard
  useEffect(() => {
    if (!ambilToken('admin')) return;
    let batal = false;
    (async () => {
      const { data } = await supabase.rpc('fn_admin_saya');
      if (batal) return;
      if (data) router.replace('/'); else hapusToken('admin');
    })();
    return () => { batal = true; };
  }, [router]);

  const masuk = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) { setGalat('Isi username dan password.'); return; }
    setLoading(true); setGalat('');
    const { data, error } = await supabase.rpc('fn_login_admin', { p_username: form.username, p_password: form.password });
    if (error) {
      setLoading(false);
      setGalat(kodeError(error) === 'LOGIN_SALAH' ? 'Username atau password tidak cocok.' : pesanError(error));
      return;
    }
    simpanToken('admin', data.token);
    router.replace('/');
  };

  const kelasInput = 'w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white placeholder-slate-400 outline-none focus:border-blue-400 focus:bg-white/10 focus:ring-4 focus:ring-blue-500/20 transition';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-slate-100">
      <div className="w-full max-w-4xl grid md:grid-cols-2 rounded-[28px] overflow-hidden shadow-2xl shadow-slate-900/20 border border-white bg-white">

        {/* Panel kiri: logo liquid glass */}
        <div className="relative overflow-hidden bg-[#eef1f6] flex flex-col items-center justify-center px-8 py-12 md:py-16 min-h-[280px]">
          <div className="absolute -top-16 -left-10 w-64 h-64 rounded-full bg-blue-500/35 blur-3xl" />
          <div className="absolute bottom-[-60px] right-[-40px] w-72 h-72 rounded-full bg-amber-400/45 blur-3xl" />
          <div className="absolute top-1/2 left-1/3 w-40 h-40 rounded-full bg-indigo-400/25 blur-2xl" />

          <div className="relative w-40 h-40 md:w-48 md:h-48 rounded-[2.5rem] bg-white/25 backdrop-blur-2xl border border-white/70
            shadow-[18px_18px_40px_rgba(15,23,42,0.18),-14px_-14px_36px_rgba(255,255,255,0.95),inset_2px_2px_1px_rgba(255,255,255,0.85),inset_-2px_-2px_6px_rgba(15,23,42,0.08)]
            flex items-center justify-center">
            <div className="absolute inset-x-3 top-2 h-1/2 rounded-t-[2.1rem] bg-gradient-to-b from-white/70 to-transparent pointer-events-none" />
            <div className="absolute inset-0 rounded-[2.5rem] ring-1 ring-inset ring-white/40 pointer-events-none" />
            <Image src="/logo-kr.png" alt="Logo KR" width={112} height={112} priority
              className="relative w-24 h-24 md:w-28 md:h-28 rounded-[1.6rem] shadow-[0_10px_24px_rgba(180,120,10,0.35)]" />
          </div>

          <div className="relative mt-8 text-center">
            <p className="text-xl font-bold text-slate-900 tracking-tight">Absensi KR</p>
            <p className="mt-2 text-sm text-slate-600 max-w-[260px] leading-relaxed">
              Kehadiran tim pialang Malang dan Surabaya, tercatat dari kiosk sampai laporan.
            </p>
          </div>
        </div>

        {/* Panel kanan: form */}
        <div className="bg-slate-900 text-white px-8 py-12 sm:px-12 flex flex-col justify-center">
          <h1 className="text-3xl font-bold tracking-tight">Masuk</h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Pantau jam masuk tim marketing dan backoffice, lalu rapikan rekapnya sebelum tutup bulan.
          </p>

          <form onSubmit={masuk} className="mt-8 space-y-4" noValidate>
            <div>
              <label htmlFor="username" className="sr-only">Username</label>
              <input id="username" autoComplete="username" autoFocus value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Username" className={kelasInput} />
            </div>
            <div className="relative">
              <label htmlFor="password" className="sr-only">Password</label>
              <input id="password" type={lihatSandi ? 'text' : 'password'} autoComplete="current-password" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Password" className={`${kelasInput} pr-12`} />
              <button type="button" onClick={() => setLihatSandi(v => !v)} aria-label={lihatSandi ? 'Sembunyikan password' : 'Tampilkan password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
                {lihatSandi ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {galat && <p role="alert" className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{galat}</p>}

            <button type="submit" disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold shadow-lg shadow-blue-900/40 transition disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {loading ? 'Memeriksa...' : 'Masuk'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">Lupa password? Minta tim IT meresetnya.</p>
        </div>
      </div>
    </div>
  );
}
