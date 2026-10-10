import { createClient } from '@supabase/supabase-js'
import { ambilToken } from '@/utils/sesi'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

// Setiap request membawa token sesi (admin web / karyawan HP) lewat header.
// Database memeriksa token ini di RLS dan fungsi RPC.
const fetchDenganSesi = (url, opsi = {}) => {
  const headers = new Headers(opsi.headers)
  if (typeof window !== 'undefined') {
    const admin = ambilToken('admin')
    const karyawan = ambilToken('karyawan')
    if (admin) headers.set('x-sesi-admin', admin)
    if (karyawan) headers.set('x-sesi-karyawan', karyawan)
  }
  return fetch(url, { ...opsi, headers })
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchDenganSesi },
  auth: { persistSession: false, autoRefreshToken: false },
})
