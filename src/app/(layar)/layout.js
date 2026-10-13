'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { ambilToken, hapusToken } from '@/utils/sesi';

// Layout layar penuh (TV): tanpa navbar, tetap wajib sesi admin.
export default function LayarLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [siap, setSiap] = useState(false);

  useEffect(() => {
    const keLogin = () => router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (!ambilToken('admin')) { keLogin(); return; }
    let batal = false;
    (async () => {
      const { data } = await supabase.rpc('fn_admin_saya');
      if (batal) return;
      if (!data) { hapusToken('admin'); keLogin(); return; }
      setSiap(true);
    })();
    return () => { batal = true; };
  }, [pathname, router]);

  if (!siap) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-slate-100 text-slate-500 text-sm">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        Memeriksa sesi...
      </div>
    );
  }
  return children;
}
