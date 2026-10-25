'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, KeyRound, ShieldCheck, Users, Crown, Check, X, Loader2, Lock } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { pesanError } from '@/utils/pesanError';
import { formatTanggalPanjang, tanggalWIB } from '@/utils/waktu';
import { useFeedback } from '@/components/Feedback';
import { useAkses, LABEL_AKSI, SEMUA_AKSI } from '@/components/AksesAdmin';
import Modal from '@/components/Modal';
import MohonTunggu from '@/components/MohonTunggu';

const SANDI_AWAL = 'admin123';
const kelasInput = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-base sm:text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';

const petaAkses = (arr) => Object.fromEntries((arr || []).map(a => [a.menu, a]));
const jumlahMenu = (efektif) => Object.values(efektif || {}).filter(a => a.lihat).length;

// Satu sel hak akses: tombol Allow & Deny.
// Role (wajib): selalu salah satu menyala. User: klik menyala, klik lagi mati (null = ikut role).
// dariRole: nilai role untuk sel ini, ditandai garis putus-putus saat user belum memilih.
function PilihAkses({ nilai, onChange, wajib = false, dariRole }) {
  const klik = (v) => onChange(wajib ? v : (nilai === v ? null : v));
  const tombol = (v, label, Icon, nyala) => {
    const ikut = nilai == null && dariRole === v;
    return (
      <button type="button" onClick={() => klik(v)} aria-pressed={nilai === v}
        title={ikut ? `Ikut role: ${label}` : undefined}
        className={`h-7 px-2 rounded-md text-[11px] font-bold inline-flex items-center gap-0.5 border transition-colors ${nilai === v ? nyala : ikut ? 'border-dashed border-slate-400 text-slate-600 bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
        <Icon className="w-3 h-3" />{label}
      </button>
    );
  };
  return (
    <div className="inline-flex p-0.5 gap-0.5 rounded-lg bg-slate-100">
      {tombol(true, 'Allow', Check, 'bg-emerald-600 border-emerald-600 text-white')}
      {tombol(false, 'Deny', X, 'bg-rose-600 border-rose-600 text-white')}
    </div>
  );
}

function Saklar({ nyala, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={nyala} onClick={() => onChange(!nyala)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
      <span className={`relative w-10 h-6 rounded-full transition-colors ${nyala ? 'bg-emerald-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${nyala ? 'left-[1.125rem]' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  );
}

// Isi semua sel yang ada di menu dengan satu nilai
const isiSemua = (menu, v) => Object.fromEntries(menu.map(m => [m.menu, Object.fromEntries(m.aksi.map(x => [x, v]))]));
const semuaAllow = (menu, nilaiSel) => menu.every(m => m.aksi.every(x => nilaiSel(m.menu, x) === true));

function TabelAkses({ menu, render }) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-xl">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Menu</th>
            {SEMUA_AKSI.map(a => <th key={a} className="px-2 py-2 font-semibold text-center w-32">{LABEL_AKSI[a]}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {menu.map(m => (
            <tr key={m.menu}>
              <td className="px-3 py-1.5 font-semibold text-slate-800 whitespace-nowrap">{m.label}</td>
              {SEMUA_AKSI.map(a => (
                <td key={a} className="px-2 py-1.5 text-center">{m.aksi.includes(a) ? render(m.menu, a) : <span className="text-slate-300">–</span>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Master Data -> Pengguna & hak akses (user web, peran, centang View/New/Edit/Delete) */
export default function PenggunaPage() {
  const { toast, konfirmasi } = useFeedback();
  const { boleh, muatUlang: muatUlangAkses } = useAkses();
  const bisa = { tambah: boleh('pengguna', 'tambah'), ubah: boleh('pengguna', 'ubah'), hapus: boleh('pengguna', 'hapus') };
  const [data, setData] = useState(null);     // { menu, pengguna, peran }
  const [galat, setGalat] = useState('');
  const [versi, setVersi] = useState(0);
  const [tab, setTab] = useState('pengguna');
  const [formUser, setFormUser] = useState(null);
  const [formPeran, setFormPeran] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    const ac = new AbortController();   // dihentikan saat pindah halaman
    (async () => {
      const { data: d, error } = await supabase.rpc('fn_pengguna_daftar').abortSignal(ac.signal);
      if (ac.signal.aborted) return;
      if (error) { setGalat(pesanError(error)); setData({ menu: [], pengguna: [], peran: [] }); return; }
      setGalat(''); setData(d);
    })();
    return () => ac.abort();
  }, [versi]);
  const muatUlang = () => { setVersi(v => v + 1); muatUlangAkses(); };

  const peranById = useMemo(() => Object.fromEntries((data?.peran || []).map(p => [p.id, p])), [data]);

  // ---------- user ----------
  const bukaUser = (u) => setFormUser(u ? {
    id: u.id, username: u.username, nama: u.nama || '', id_peran: u.id_peran || '', is_aktif: u.is_aktif,
    saya: u.saya, akses: petaAkses(u.akses),
  } : { id: null, username: '', nama: '', id_peran: '', is_aktif: true, saya: false, akses: {} });

  const aturUser = (menu, aksi, v) => setFormUser(f => ({ ...f, akses: { ...f.akses, [menu]: { ...(f.akses[menu] || {}), [aksi]: v } } }));

  const simpanUser = async (e) => {
    e.preventDefault();
    const f = formUser;
    const nilai = (menu, x) => f.akses[menu]?.[x] ?? null;   // null = ikut role
    const akses = data.menu.map(m => ({ menu: m.menu, lihat: nilai(m.menu, 'lihat'), tambah: nilai(m.menu, 'tambah'), ubah: nilai(m.menu, 'ubah'), hapus: nilai(m.menu, 'hapus') }));
    setSibuk(true);
    const { error } = await supabase.rpc('fn_pengguna_simpan', {
      p_id: f.id, p_username: f.username, p_nama: f.nama, p_id_peran: f.id_peran || null, p_is_aktif: f.is_aktif, p_akses: akses,
    });
    setSibuk(false);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(f.id ? `Akun ${f.username} tersimpan.` : `Akun ${f.username.toLowerCase()} dibuat. Password awal ${SANDI_AWAL}, wajib diganti saat login pertama.`);
    setFormUser(null); muatUlang();
  };

  const resetSandi = async (u) => {
    const ok = await konfirmasi({
      judul: `Reset password ${u.username}?`,
      pesan: <>Password jadi <b className="font-mono">{SANDI_AWAL}</b>, {u.username} keluar dari semua browser, dan wajib membuat password baru saat login.</>,
      tombolYa: 'Reset password', nada: 'bahaya',
    });
    if (!ok) return;
    const { error } = await supabase.rpc('fn_pengguna_reset_sandi', { p_id: u.id });
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`Password ${u.username} di-reset ke ${SANDI_AWAL}.`); muatUlang();
  };

  const hapusUser = async (u) => {
    const ok = await konfirmasi({ judul: `Hapus akun ${u.username}?`, pesan: 'Akun dihapus permanen dan langsung keluar dari semua browser. Kalau hanya ingin menahan sementara, nonaktifkan saja lewat Edit.', tombolYa: 'Hapus akun', nada: 'bahaya' });
    if (!ok) return;
    const { error } = await supabase.rpc('fn_pengguna_hapus', { p_id: u.id });
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`Akun ${u.username} dihapus.`); muatUlang();
  };

  // ---------- peran ----------
  const bukaPeran = (p) => setFormPeran(p ? { id: p.id, nama: p.nama, akses: petaAkses(p.akses) } : { id: null, nama: '', akses: {} });
  const aturPeran = (menu, aksi, v) => setFormPeran(f => ({ ...f, akses: { ...f.akses, [menu]: { ...(f.akses[menu] || {}), [aksi]: v } } }));
  const simpanPeran = async (e) => {
    e.preventDefault();
    const f = formPeran;
    const akses = Object.entries(f.akses).map(([menu, a]) => ({ menu, lihat: !!a.lihat, tambah: !!a.tambah, ubah: !!a.ubah, hapus: !!a.hapus }));
    setSibuk(true);
    const { error } = await supabase.rpc('fn_peran_simpan', { p_id: f.id, p_nama: f.nama, p_akses: akses });
    setSibuk(false);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`Role ${f.nama} tersimpan.`); setFormPeran(null); muatUlang();
  };
  const hapusPeran = async (p) => {
    const ok = await konfirmasi({ judul: `Hapus role ${p.nama}?`, pesan: p.jumlah_user ? `${p.jumlah_user} user memakai role ini. Setelah dihapus mereka tanpa role, jadi hanya punya hak yang diatur khusus di user.` : 'Role ini belum dipakai user mana pun.', tombolYa: 'Hapus role', nada: 'bahaya' });
    if (!ok) return;
    const { error } = await supabase.rpc('fn_peran_hapus', { p_id: p.id });
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`Role ${p.nama} dihapus.`); muatUlang();
  };

  if (!data) return <div className="bg-white rounded-xl border border-slate-200"><MohonTunggu className="min-h-[18rem]" /></div>;
  const peranDipilih = formUser ? peranById[formUser.id_peran] : null;
  const aksesPeranDipilih = petaAkses(peranDipilih?.akses);
  const jumlahPilih = formUser ? data.menu.reduce((n, m) => n + m.aksi.filter(x => formUser.akses[m.menu]?.[x] != null).length, 0) : 0;
  const efektifUser = (menu, x) => formUser.akses[menu]?.[x] ?? !!aksesPeranDipilih[menu]?.[x];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pengguna & hak akses</h1>
          <p className="text-sm text-slate-500">Hak user ikut role-nya, dan bisa diubah khusus per user. Superadmin selalu punya semua hak.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg text-sm" role="tablist">
            {[['pengguna', 'Pengguna', Users], ['peran', 'Role', ShieldCheck]].map(([k, l, Icon]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Icon className="w-4 h-4" />{l}</button>
            ))}
          </div>
          {bisa.tambah && (
            <button onClick={() => (tab === 'pengguna' ? bukaUser(null) : bukaPeran(null))} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
              <Plus className="w-4 h-4" />{tab === 'pengguna' ? 'Tambah pengguna' : 'Tambah role'}
            </button>
          )}
        </div>
      </div>

      {galat && <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">{galat}</div>}

      {tab === 'pengguna' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-600 min-w-[760px]">
              <thead className="bg-slate-50 text-slate-500 text-xs border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-semibold">Pengguna</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Akses</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.pengguna.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900 inline-flex items-center gap-1.5">{u.is_superadmin && <Crown className="w-4 h-4 text-amber-500" />}{u.nama || u.username}{u.saya && <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5">KAMU</span>}</p>
                      <p className="text-xs text-slate-500 font-mono">{u.username}</p>
                    </td>
                    <td className="px-5 py-3">
                      {u.is_superadmin
                        ? <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200">Superadmin</span>
                        : u.nama_peran ? <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 border border-slate-200">{u.nama_peran}</span>
                        : <span className="text-xs text-slate-400">Tanpa role</span>}
                      {!u.is_superadmin && u.akses.length > 0 && <p className="text-[11px] text-violet-700 mt-1">{u.akses.length} menu diatur khusus</p>}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">{u.is_superadmin ? 'Semua menu & aksi (terkunci)' : `${jumlahMenu(u.efektif)} dari ${data.menu.length} menu`}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-md border ${u.is_aktif ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{u.is_aktif ? 'Aktif' : 'Nonaktif'}</span>
                      {u.wajib_ganti_sandi && <p className="text-[11px] text-amber-700 mt-1">Belum ganti password awal</p>}
                      <p className="text-[11px] text-slate-400 mt-0.5">Dibuat {formatTanggalPanjang(tanggalWIB(new Date(u.created_at)))}</p>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {u.is_superadmin && !u.saya ? <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Lock className="w-3.5 h-3.5" />Terkunci</span> : (
                        <div className="inline-flex gap-1">
                          {bisa.ubah && <button onClick={() => bukaUser(u)} title={u.saya ? 'Ubah nama' : 'Edit pengguna & hak akses'} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><Edit2 className="w-4 h-4" /></button>}
                          {bisa.ubah && !u.saya && <button onClick={() => resetSandi(u)} title={`Reset password ke ${SANDI_AWAL}`} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><KeyRound className="w-4 h-4" /></button>}
                          {bisa.hapus && !u.saya && <button onClick={() => hapusUser(u)} title="Hapus akun" className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500">Password user lain tidak bisa diisi bebas, hanya bisa di-reset ke <b className="font-mono">{SANDI_AWAL}</b>. Setiap user mengganti password sendiri lewat ikon kunci di kanan atas.</p>
        </div>
      )}

      {tab === 'peran' && (
        <div className="grid lg:grid-cols-2 gap-4">
          {data.peran.length === 0 && <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">Belum ada role. Buat role (misalnya HR atau Leader) supaya hak akses tidak perlu diatur satu per satu di tiap user.</div>}
          {data.peran.map(p => {
            const a = petaAkses(p.akses);
            return (
              <section key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-bold text-slate-900">{p.nama}</h2>
                    <p className="text-xs text-slate-500">{p.jumlah_user} pengguna</p>
                  </div>
                  <div className="flex gap-1">
                    {bisa.ubah && <button onClick={() => bukaPeran(p)} title="Edit role" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><Edit2 className="w-4 h-4" /></button>}
                    {bisa.hapus && <button onClick={() => hapusPeran(p)} title="Hapus role" className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.menu.filter(m => a[m.menu]?.lihat).map(m => (
                    <span key={m.menu} className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700">
                      <b className="font-semibold">{m.label}</b>{' '}
                      <span className="text-slate-400">{SEMUA_AKSI.filter(x => a[m.menu]?.[x]).map(x => LABEL_AKSI[x]).join(' · ')}</span>
                    </span>
                  ))}
                  {!data.menu.some(m => a[m.menu]?.lihat) && <span className="text-xs text-slate-400">Belum ada menu yang bisa dilihat.</span>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ---------- Popup user ---------- */}
      {formUser && (
        <Modal judul={formUser.id ? `Edit ${formUser.username}` : 'Tambah pengguna'} onClose={() => setFormUser(null)} lebar="sm:max-w-4xl">
          <form onSubmit={simpanUser} className="p-5 sm:p-6 space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="text-sm font-semibold text-slate-700">Username
                <input value={formUser.username} disabled={!!formUser.id} onChange={e => setFormUser({ ...formUser, username: e.target.value.toLowerCase().replace(/\s/g, '') })} placeholder="contoh: hr.surabaya" className={`${kelasInput} mt-1 font-mono`} />
              </label>
              <label className="text-sm font-semibold text-slate-700">Nama
                <input value={formUser.nama} onChange={e => setFormUser({ ...formUser, nama: e.target.value })} placeholder="Nama tampilan" className={`${kelasInput} mt-1`} />
              </label>
              <label className="text-sm font-semibold text-slate-700">Role
                <select value={formUser.id_peran} disabled={formUser.saya} onChange={e => setFormUser({ ...formUser, id_peran: e.target.value })} className={`${kelasInput} mt-1`}>
                  <option value="">Tanpa role</option>
                  {data.peran.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                </select>
              </label>
            </div>
            {formUser.saya ? (
              <p className="text-sm px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">Ini akunmu. Kamu hanya bisa mengubah nama; role, hak akses, dan status diatur oleh pengguna lain yang berhak.</p>
            ) : (
              <>
                {!formUser.id && <p className="text-xs text-slate-500">Password awal <b className="font-mono">{SANDI_AWAL}</b>. Pengguna wajib menggantinya saat login pertama.</p>}
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={formUser.is_aktif} onChange={e => setFormUser({ ...formUser, is_aktif: e.target.checked })} />
                  Akun aktif <span className="text-xs text-slate-400">(nonaktif = tidak bisa login, sesi langsung keluar)</span>
                </label>
                <div>
                  <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Hak akses</p>
                      <p className="text-xs text-slate-500">Tidak dipilih = ikut role{peranDipilih ? ` ${peranDipilih.nama}` : ' (tanpa role = Deny)'}, ditandai garis putus-putus. Klik sekali menyala, klik lagi mati.</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {jumlahPilih > 0 && <button type="button" onClick={() => setFormUser(f => ({ ...f, akses: {} }))} className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline">Ikut role semua ({jumlahPilih})</button>}
                      <Saklar label="Allow all" nyala={semuaAllow(data.menu, efektifUser)}
                        onChange={on => setFormUser(f => ({ ...f, akses: on ? isiSemua(data.menu, true) : {} }))} />
                    </div>
                  </div>
                  <TabelAkses menu={data.menu} render={(menu, aksi) => (
                    <PilihAkses nilai={formUser.akses[menu]?.[aksi] ?? null} dariRole={!!aksesPeranDipilih[menu]?.[aksi]} onChange={v => aturUser(menu, aksi, v)} />
                  )} />
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setFormUser(null)} className="px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200">Batal</button>
              <button type="submit" disabled={sibuk || (!formUser.id && formUser.username.length < 3)} className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {sibuk && <Loader2 className="w-4 h-4 animate-spin" />}{formUser.id ? 'Simpan' : 'Buat akun'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------- Popup peran ---------- */}
      {formPeran && (
        <Modal judul={formPeran.id ? `Edit role ${formPeran.nama}` : 'Tambah role'} onClose={() => setFormPeran(null)} lebar="sm:max-w-4xl">
          <form onSubmit={simpanPeran} className="p-5 sm:p-6 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">Nama role
              <input value={formPeran.nama} onChange={e => setFormPeran({ ...formPeran, nama: e.target.value })} placeholder="contoh: HR, Leader, Finance" className={`${kelasInput} mt-1`} />
            </label>
            <div className="flex items-end justify-between gap-2">
              <p className="text-xs text-slate-500">Setiap hak wajib Allow atau Deny. Menu tampil di navbar kalau View = Allow.</p>
              <Saklar label="Allow all" nyala={semuaAllow(data.menu, (m, x) => !!formPeran.akses[m]?.[x])}
                onChange={on => setFormPeran(f => ({ ...f, akses: isiSemua(data.menu, on) }))} />
            </div>
            <TabelAkses menu={data.menu} render={(menu, aksi) => (
              <PilihAkses wajib nilai={!!formPeran.akses[menu]?.[aksi]} onChange={v => aturPeran(menu, aksi, v)} />
            )} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFormPeran(null)} className="px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200">Batal</button>
              <button type="submit" disabled={sibuk || formPeran.nama.trim().length < 2} className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {sibuk && <Loader2 className="w-4 h-4 animate-spin" />}Simpan role
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
