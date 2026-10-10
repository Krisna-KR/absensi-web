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

  const kelasInput = 'w-full px-4 py-3 rounded-xl bg-white/70 border border-white text-slate-900 placeholder-slate-400 shadow-[inset_2px_2px_5px_rgba(15,23,42,0.06)] outline-none focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-500/15 transition';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-slate-100">
      <div className="relative w-full max-w-4xl grid md:grid-cols-2 rounded-[28px] overflow-hidden shadow-2xl shadow-slate-900/15 border border-white bg-[#eef1f6]">
        {/* Latar kaca: warna menyebar ke kedua sisi */}
        <div className="absolute -top-24 -left-16 w-80 h-80 rounded-full bg-blue-500/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/3 w-96 h-96 rounded-full bg-amber-400/40 blur-3xl pointer-events-none" />
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-indigo-400/25 blur-3xl pointer-events-none" />

        {/* Kiri: logo liquid glass */}
        <div className="relative flex items-center justify-center px-8 py-12 md:py-20 min-h-[260px]">
          <div className="relative w-44 h-44 md:w-56 md:h-56 rounded-[2.75rem] p-2 bg-white/35 backdrop-blur-2xl border border-white/80
            shadow-[18px_18px_40px_rgba(15,23,42,0.18),-14px_-14px_36px_rgba(255,255,255,0.95)]">
            <Image src="/logo-kr-besar.png" alt="Logo KR" width={512} height={512} priority
              className="w-full h-full object-cover rounded-[2.3rem] shadow-[0_12px_28px_rgba(180,120,10,0.35)]" />
            {/* kilau kaca di atas logo */}
            <div className="absolute inset-2 rounded-[2.3rem] bg-gradient-to-br from-white/45 via-white/5 to-transparent pointer-events-none" />
            <div className="absolute inset-2 rounded-[2.3rem] ring-1 ring-inset ring-white/50 pointer-events-none" />
          </div>
        </div>

        {/* Kanan: form, warna kaca terang seperti sisi kiri */}
        <div className="relative px-8 py-12 sm:px-12 flex flex-col justify-center bg-white/40 backdrop-blur-xl md:border-l border-white/70">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Login</h1>

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
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                {lihatSandi ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {galat && <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{galat}</p>}

            <button type="submit" disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-600/30 transition disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {loading ? 'Memeriksa...' : 'Login'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">Lupa password? Minta tim IT meresetnya.</p>
        </div>
      </div>
    </div>
  );
}
