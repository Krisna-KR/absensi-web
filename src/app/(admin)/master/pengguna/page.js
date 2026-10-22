'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, KeyRound, ShieldCheck, Users, Crown, Check, X, Loader2, Lock } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { pesanError } from '@/utils/pesanError';
import { formatTanggalPanjang, tanggalWIB } from '@/utils/waktu';
import { useFeedback } from '@/components/Feedback';
import { useAkses, LABEL_AKSI, SEMUA_AKSI } from '@/components/AksesAdmin';
import Modal from '@/components/Modal';

const SANDI_AWAL = 'admin123';
const kelasInput = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-base sm:text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';

const petaAkses = (arr) => Object.fromEntries((arr || []).map(a => [a.menu, a]));
const jumlahMenu = (efektif) => Object.values(efektif || {}).filter(a => a.lihat).length;

// Sel centang untuk peran: on / off
function Centang({ nilai, onChange, disabled }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!nilai)} aria-pressed={nilai}
      className={`w-8 h-8 rounded-lg border flex items-center justify-center mx-auto transition-colors ${nilai ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-transparent hover:border-slate-400'} disabled:opacity-50`}>
      <Check className="w-4 h-4" />
    </button>
  );
}

// Sel khusus user: ikut peran / izinkan / tolak. Menampilkan hasil akhirnya.
function SelUser({ nilai, dariPeran, onChange, disabled }) {
  const hasil = nilai ?? dariPeran;
  const opsi = [[null, 'Peran'], [true, 'Izin'], [false, 'Tolak']];
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="inline-flex p-0.5 bg-slate-100 rounded-md text-[10px] font-bold">
        {opsi.map(([v, l]) => (
          <button key={l} type="button" disabled={disabled} onClick={() => onChange(v)}
            className={`px-1.5 py-0.5 rounded ${nilai === v ? (v === true ? 'bg-emerald-600 text-white' : v === false ? 'bg-rose-600 text-white' : 'bg-white text-slate-700 shadow-sm') : 'text-slate-500'} disabled:opacity-60`}>{l}</button>
        ))}
      </div>
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${hasil ? 'text-emerald-700' : 'text-slate-400'}`}>
        {hasil ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}{hasil ? 'Boleh' : 'Tidak'}
      </span>
    </div>
  );
}

function TabelAkses({ menu, render }) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-xl">
      <table className="w-full text-sm min-w-[520px]">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Menu</th>
            {SEMUA_AKSI.map(a => <th key={a} className="px-2 py-2 font-semibold text-center w-24">{LABEL_AKSI[a]}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {menu.map(m => (
            <tr key={m.menu}>
              <td className="px-3 py-2 font-semibold text-slate-800">{m.label}</td>
              {SEMUA_AKSI.map(a => (
                <td key={a} className="px-2 py-2 text-center">{m.aksi.includes(a) ? render(m.menu, a) : <span className="text-slate-300">–</span>}</td>
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
    let batal = false;
    (async () => {
      const { data: d, error } = await supabase.rpc('fn_pengguna_daftar');
      if (batal) return;
      if (error) { setGalat(pesanError(error)); setData({ menu: [], pengguna: [], peran: [] }); return; }
      setGalat(''); setData(d);
    })();
    return () => { batal = true; };
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
    const akses = Object.entries(f.akses).map(([menu, a]) => ({ menu, lihat: a.lihat ?? null, tambah: a.tambah ?? null, ubah: a.ubah ?? null, hapus: a.hapus ?? null }));
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
    toast(`Peran ${f.nama} tersimpan.`); setFormPeran(null); muatUlang();
  };
  const hapusPeran = async (p) => {
    const ok = await konfirmasi({ judul: `Hapus peran ${p.nama}?`, pesan: p.jumlah_user ? `${p.jumlah_user} user memakai peran ini. Setelah dihapus mereka tanpa peran, jadi hanya punya hak dari centang khusus user.` : 'Peran ini belum dipakai user mana pun.', tombolYa: 'Hapus peran', nada: 'bahaya' });
    if (!ok) return;
    const { error } = await supabase.rpc('fn_peran_hapus', { p_id: p.id });
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`Peran ${p.nama} dihapus.`); muatUlang();
  };

  if (!data) return <div className="py-20 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  const peranDipilih = formUser ? peranById[formUser.id_peran] : null;
  const aksesPeranDipilih = petaAkses(peranDipilih?.akses);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pengguna & hak akses</h1>
          <p className="text-sm text-slate-500">Hak user = centang peran, lalu ditimpa centang khusus user. Superadmin selalu punya semua hak.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex p-1 bg-slate-100 rounded-lg text-sm" role="tablist">
            {[['pengguna', 'Pengguna', Users], ['peran', 'Peran', ShieldCheck]].map(([k, l, Icon]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Icon className="w-4 h-4" />{l}</button>
            ))}
          </div>
          {bisa.tambah && (
            <button onClick={() => (tab === 'pengguna' ? bukaUser(null) : bukaPeran(null))} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
              <Plus className="w-4 h-4" />{tab === 'pengguna' ? 'Tambah pengguna' : 'Tambah peran'}
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
                  <th className="px-5 py-3 font-semibold">Peran</th>
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
                        : <span className="text-xs text-slate-400">Tanpa peran</span>}
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
          {data.peran.length === 0 && <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">Belum ada peran. Buat peran (misalnya HR atau Leader) supaya hak akses tidak perlu dicentang satu per satu di tiap user.</div>}
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
                    {bisa.ubah && <button onClick={() => bukaPeran(p)} title="Edit peran" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><Edit2 className="w-4 h-4" /></button>}
                    {bisa.hapus && <button onClick={() => hapusPeran(p)} title="Hapus peran" className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>}
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
        <Modal judul={formUser.id ? `Edit ${formUser.username}` : 'Tambah pengguna'} onClose={() => setFormUser(null)} lebar="sm:max-w-3xl">
          <form onSubmit={simpanUser} className="p-5 sm:p-6 space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="text-sm font-semibold text-slate-700">Username
                <input value={formUser.username} disabled={!!formUser.id} onChange={e => setFormUser({ ...formUser, username: e.target.value.toLowerCase().replace(/\s/g, '') })} placeholder="contoh: hr.surabaya" className={`${kelasInput} mt-1 font-mono`} />
              </label>
              <label className="text-sm font-semibold text-slate-700">Nama
                <input value={formUser.nama} onChange={e => setFormUser({ ...formUser, nama: e.target.value })} placeholder="Nama tampilan" className={`${kelasInput} mt-1`} />
              </label>
              <label className="text-sm font-semibold text-slate-700">Peran
                <select value={formUser.id_peran} disabled={formUser.saya} onChange={e => setFormUser({ ...formUser, id_peran: e.target.value })} className={`${kelasInput} mt-1`}>
                  <option value="">Tanpa peran</option>
                  {data.peran.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                </select>
              </label>
            </div>
            {formUser.saya ? (
              <p className="text-sm px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">Ini akunmu. Kamu hanya bisa mengubah nama; peran, hak akses, dan status diatur oleh pengguna lain yang berhak.</p>
            ) : (
              <>
                {!formUser.id && <p className="text-xs text-slate-500">Password awal <b className="font-mono">{SANDI_AWAL}</b>. Pengguna wajib menggantinya saat login pertama.</p>}
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={formUser.is_aktif} onChange={e => setFormUser({ ...formUser, is_aktif: e.target.checked })} />
                  Akun aktif <span className="text-xs text-slate-400">(nonaktif = tidak bisa login, sesi langsung keluar)</span>
                </label>
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">Hak akses khusus user ini</p>
                  <p className="text-xs text-slate-500 mb-2"><b>Peran</b> = ikut centang peran{peranDipilih ? ` "${peranDipilih.nama}"` : ' (tanpa peran = tidak boleh)'}. <b>Izin</b> / <b>Tolak</b> menimpa peran untuk user ini saja.</p>
                  <TabelAkses menu={data.menu} render={(menu, aksi) => (
                    <SelUser nilai={formUser.akses[menu]?.[aksi] ?? null} dariPeran={!!aksesPeranDipilih[menu]?.[aksi]} onChange={v => aturUser(menu, aksi, v)} />
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
        <Modal judul={formPeran.id ? `Edit peran ${formPeran.nama}` : 'Tambah peran'} onClose={() => setFormPeran(null)} lebar="sm:max-w-2xl">
          <form onSubmit={simpanPeran} className="p-5 sm:p-6 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">Nama peran
              <input value={formPeran.nama} onChange={e => setFormPeran({ ...formPeran, nama: e.target.value })} placeholder="contoh: HR, Leader, Finance" className={`${kelasInput} mt-1`} />
            </label>
            <TabelAkses menu={data.menu} render={(menu, aksi) => (
              <Centang nilai={!!formPeran.akses[menu]?.[aksi]} onChange={v => aturPeran(menu, aksi, v)} />
            )} />
            <p className="text-xs text-slate-500">Tips: centang View dulu. New / Edit / Delete tanpa View membuat menu tidak tampil di navbar.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFormPeran(null)} className="px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200">Batal</button>
              <button type="submit" disabled={sibuk || formPeran.nama.trim().length < 2} className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {sibuk && <Loader2 className="w-4 h-4 animate-spin" />}Simpan peran
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
