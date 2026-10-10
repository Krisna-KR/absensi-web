'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Plus, Trash2, Edit2, MapPin, Building2, BadgeCheck, Check, X, Lock } from 'lucide-react';
import { pesanError } from '@/utils/pesanError';
import { useFeedback } from '@/components/Feedback';

const TAB = [
  { key: 'lokasi', label: 'Lokasi', icon: MapPin },
  { key: 'departemen', label: 'Departemen', icon: Building2 },
  { key: 'jabatan', label: 'Job Role', icon: BadgeCheck },
];

const ATURAN_DEPT = {
  Marketing: 'Wajib punya 1 atasan dari Backoffice. Tidak bisa jadi atasan.',
  Backoffice: 'Tidak punya atasan. Job role yang ditandai "bisa jadi atasan" boleh membawahi Marketing.',
};

const kelasInput = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

export default function MasterDataPage() {
  const { toast, konfirmasi } = useFeedback();
  const [tab, setTab] = useState('lokasi');
  const [lokasi, setLokasi] = useState([]);
  const [departemen, setDepartemen] = useState([]);
  const [jabatan, setJabatan] = useState([]);
  const [karyawan, setKaryawan] = useState([]);
  const [versi, setVersi] = useState(0);
  const muatUlang = () => setVersi(v => v + 1);

  const [formLokasi, setFormLokasi] = useState({ id: null, nama_cabang: '', alamat: '' });
  const [formJabatan, setFormJabatan] = useState({ lama: null, nama: '', id_departemen: '', bisa_jadi_atasan: false });
  const [simpan, setSimpan] = useState(false);

  useEffect(() => {
    let batal = false;
    (async () => {
      const [l, d, j, k] = await Promise.all([
        supabase.from('master_lokasi').select('id, nama_cabang, alamat').order('nama_cabang'),
        supabase.from('master_departemen').select('id, nama_departemen').order('nama_departemen'),
        supabase.from('master_jabatan').select('nama, id_departemen, bisa_jadi_atasan').order('nama'),
        supabase.from('karyawan').select('id, id_lokasi, id_departemen, jabatan, is_aktif'),
      ]);
      if (batal) return;
      const galat = [l, d, j, k].find(r => r.error)?.error;
      if (galat) toast(`Master data belum bisa dimuat. ${pesanError(galat)}`, 'gagal');
      setLokasi(l.data || []); setDepartemen(d.data || []); setJabatan(j.data || []); setKaryawan(k.data || []);
    })();
    return () => { batal = true; };
  }, [versi, toast]);

  const aktif = karyawan.filter(k => k.is_aktif);
  const hitung = (f) => aktif.filter(f).length;
  const namaDept = (id) => departemen.find(d => d.id === id)?.nama_departemen || '-';

  // ---------- Lokasi ----------
  const simpanLokasi = async (e) => {
    e.preventDefault();
    const nama = formLokasi.nama_cabang.trim();
    if (!nama) return;
    setSimpan(true);
    const payload = { nama_cabang: nama, alamat: formLokasi.alamat.trim() || null };
    const { error } = formLokasi.id
      ? await supabase.from('master_lokasi').update(payload).eq('id', formLokasi.id)
      : await supabase.from('master_lokasi').insert(payload);
    setSimpan(false);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(formLokasi.id ? `Lokasi ${nama} tersimpan.` : `Lokasi ${nama} ditambahkan.`);
    setFormLokasi({ id: null, nama_cabang: '', alamat: '' }); muatUlang();
  };

  const hapusLokasi = async (l) => {
    const n = karyawan.filter(k => k.id_lokasi === l.id).length;
    if (n > 0) { toast(`${l.nama_cabang} masih dipakai ${n} karyawan. Pindahkan dulu karyawannya ke lokasi lain.`, 'gagal'); return; }
    const ok = await konfirmasi({ judul: `Hapus lokasi ${l.nama_cabang}?`, pesan: 'Lokasi ini hilang dari pilihan di form karyawan dan layar presensi.', tombolYa: 'Hapus', nada: 'bahaya' });
    if (!ok) return;
    const { error } = await supabase.from('master_lokasi').delete().eq('id', l.id);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`Lokasi ${l.nama_cabang} dihapus.`); muatUlang();
  };

  // ---------- Job role ----------
  const deptBackoffice = departemen.find(d => d.nama_departemen === 'Backoffice')?.id;

  const simpanJabatan = async (e) => {
    e.preventDefault();
    const nama = formJabatan.nama.trim();
    if (!nama || !formJabatan.id_departemen) return;
    setSimpan(true);
    const payload = { nama, bisa_jadi_atasan: formJabatan.id_departemen === deptBackoffice && formJabatan.bisa_jadi_atasan };
    const { error } = formJabatan.lama
      ? await supabase.from('master_jabatan').update(payload).eq('nama', formJabatan.lama)
      : await supabase.from('master_jabatan').insert({ ...payload, id_departemen: formJabatan.id_departemen });
    setSimpan(false);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(formJabatan.lama ? `Job role ${nama} tersimpan.` : `Job role ${nama} ditambahkan.`);
    setFormJabatan({ lama: null, nama: '', id_departemen: '', bisa_jadi_atasan: false }); muatUlang();
  };

  const hapusJabatan = async (j) => {
    const n = karyawan.filter(k => k.jabatan === j.nama).length;
    if (n > 0) { toast(`${j.nama} masih dipakai ${n} karyawan. Ganti dulu job role mereka.`, 'gagal'); return; }
    const ok = await konfirmasi({ judul: `Hapus job role ${j.nama}?`, pesan: 'Job role ini hilang dari pilihan di form karyawan dan pendaftaran HP.', tombolYa: 'Hapus', nada: 'bahaya' });
    if (!ok) return;
    const { error } = await supabase.from('master_jabatan').delete().eq('nama', j.nama);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`Job role ${j.nama} dihapus.`); muatUlang();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Master Data</h1>
        <div className="inline-flex p-1 bg-slate-100 rounded-lg" role="tablist">
          {TAB.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-semibold transition-colors ${tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <Icon className="w-4 h-4" />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'lokasi' && (
        <div className="grid lg:grid-cols-3 gap-4 items-start">
          <form onSubmit={simpanLokasi} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h2 className="font-semibold text-slate-900">{formLokasi.id ? 'Ubah lokasi' : 'Tambah lokasi'}</h2>
            <div>
              <label className="text-sm font-medium text-slate-700">Nama cabang</label>
              <input value={formLokasi.nama_cabang} onChange={e => setFormLokasi({ ...formLokasi, nama_cabang: e.target.value })} placeholder="Contoh: Malang" className={`${kelasInput} mt-1`} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Alamat <span className="text-slate-400 font-normal">(opsional)</span></label>
              <textarea rows="2" value={formLokasi.alamat} onChange={e => setFormLokasi({ ...formLokasi, alamat: e.target.value })} className={`${kelasInput} mt-1`} />
            </div>
            <div className="flex gap-2 pt-1">
              {formLokasi.id && <button type="button" onClick={() => setFormLokasi({ id: null, nama_cabang: '', alamat: '' })} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200">Batal</button>}
              <button type="submit" disabled={simpan || !formLokasi.nama_cabang.trim()} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40">
                {formLokasi.id ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}{formLokasi.id ? 'Simpan' : 'Tambah'}
              </button>
            </div>
          </form>

          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left text-slate-600">
              <thead className="bg-slate-50 text-slate-500 text-xs border-b border-slate-200">
                <tr><th className="px-5 py-3 font-semibold">Lokasi</th><th className="px-5 py-3 font-semibold text-center">Karyawan aktif</th><th className="px-5 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lokasi.length === 0 && <tr><td colSpan="3" className="px-5 py-12 text-center text-slate-500">Belum ada lokasi.</td></tr>}
                {lokasi.map(l => (
                  <tr key={l.id} className={formLokasi.id === l.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900 inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400" />{l.nama_cabang}</p>
                      {l.alamat && <p className="text-xs text-slate-500 mt-0.5 ml-5">{l.alamat}</p>}
                    </td>
                    <td className="px-5 py-3 text-center font-semibold text-slate-900 tabular-nums">{hitung(k => k.id_lokasi === l.id)}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setFormLokasi({ id: l.id, nama_cabang: l.nama_cabang, alamat: l.alamat || '' })} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Ubah"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => hapusLokasi(l)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50" title="Hapus"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'departemen' && (
        <div className="grid md:grid-cols-2 gap-4">
          {departemen.map(d => (
            <div key={d.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{d.nama_departemen}</h2>
                  <p className="text-sm text-slate-500 mt-1">{ATURAN_DEPT[d.nama_departemen] || ''}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md shrink-0" title="Departemen ini dasar aturan struktur, jadi namanya tetap">
                  <Lock className="w-3 h-3" />Tetap
                </span>
              </div>
              <div className="mt-4 flex gap-6 text-sm">
                <p><span className="text-2xl font-bold text-slate-900 tabular-nums">{hitung(k => k.id_departemen === d.id)}</span> <span className="text-slate-500">karyawan aktif</span></p>
                <p><span className="text-2xl font-bold text-slate-900 tabular-nums">{jabatan.filter(j => j.id_departemen === d.id).length}</span> <span className="text-slate-500">job role</span></p>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {jabatan.filter(j => j.id_departemen === d.id).map(j => (
                  <span key={j.nama} className="px-2 py-0.5 text-xs rounded-md border border-slate-200 text-slate-600">{j.nama}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'jabatan' && (
        <div className="grid lg:grid-cols-3 gap-4 items-start">
          <form onSubmit={simpanJabatan} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h2 className="font-semibold text-slate-900">{formJabatan.lama ? `Ubah ${formJabatan.lama}` : 'Tambah job role'}</h2>
            <div>
              <label className="text-sm font-medium text-slate-700">Nama job role</label>
              <input value={formJabatan.nama} onChange={e => setFormJabatan({ ...formJabatan, nama: e.target.value })} placeholder="Contoh: Supervisor" className={`${kelasInput} mt-1`} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Departemen</label>
              <select value={formJabatan.id_departemen} disabled={!!formJabatan.lama}
                onChange={e => setFormJabatan({ ...formJabatan, id_departemen: e.target.value, bisa_jadi_atasan: e.target.value === deptBackoffice && formJabatan.bisa_jadi_atasan })}
                className={`${kelasInput} mt-1 disabled:bg-slate-50 disabled:text-slate-500`}>
                <option value="">-- Pilih departemen --</option>
                {departemen.map(d => <option key={d.id} value={d.id}>{d.nama_departemen}</option>)}
              </select>
            </div>
            <label className={`flex items-start gap-2.5 p-3 rounded-lg border text-sm ${formJabatan.id_departemen === deptBackoffice ? 'border-slate-200 cursor-pointer' : 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'}`}>
              <input type="checkbox" className="mt-0.5" disabled={formJabatan.id_departemen !== deptBackoffice} checked={formJabatan.bisa_jadi_atasan}
                onChange={e => setFormJabatan({ ...formJabatan, bisa_jadi_atasan: e.target.checked })} />
              <span><b className="font-semibold">Bisa jadi atasan</b><br />Hanya untuk job role Backoffice. Karyawan dengan job role ini bisa membawahi Marketing.</span>
            </label>
            <div className="flex gap-2 pt-1">
              {formJabatan.lama && <button type="button" onClick={() => setFormJabatan({ lama: null, nama: '', id_departemen: '', bisa_jadi_atasan: false })} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200">Batal</button>}
              <button type="submit" disabled={simpan || !formJabatan.nama.trim() || !formJabatan.id_departemen} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40">
                {formJabatan.lama ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}{formJabatan.lama ? 'Simpan' : 'Tambah'}
              </button>
            </div>
          </form>

          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left text-slate-600">
              <thead className="bg-slate-50 text-slate-500 text-xs border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-semibold">Job role</th>
                  <th className="px-5 py-3 font-semibold">Departemen</th>
                  <th className="px-5 py-3 font-semibold text-center">Bisa jadi atasan</th>
                  <th className="px-5 py-3 font-semibold text-center">Karyawan aktif</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jabatan.map(j => (
                  <tr key={j.nama} className={formJabatan.lama === j.nama ? 'bg-blue-50/50' : 'hover:bg-slate-50'}>
                    <td className="px-5 py-3 font-semibold text-slate-900">{j.nama}</td>
                    <td className="px-5 py-3">{namaDept(j.id_departemen)}</td>
                    <td className="px-5 py-3 text-center">
                      {j.bisa_jadi_atasan ? <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold"><Check className="w-4 h-4" />Ya</span> : <span className="text-slate-300"><X className="w-4 h-4 inline" /></span>}
                    </td>
                    <td className="px-5 py-3 text-center font-semibold text-slate-900 tabular-nums">{hitung(k => k.jabatan === j.nama)}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setFormJabatan({ lama: j.nama, nama: j.nama, id_departemen: j.id_departemen, bisa_jadi_atasan: j.bisa_jadi_atasan })} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Ubah"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => hapusJabatan(j)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50" title="Hapus"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
