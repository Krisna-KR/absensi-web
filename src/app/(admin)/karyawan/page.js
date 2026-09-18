'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Plus, X, Check, Trash2, KeyRound, Smartphone } from 'lucide-react';

export default function KaryawanPage() {
  const [karyawan, setKaryawan] = useState([]);
  const [departemen, setDepartemen] = useState([]);
  const [tim, setTim] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ nip: '', nama_lengkap: '', username: '', password: 'admin123', id_departemen: '', id_tim: '' });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: deptData } = await supabase.from('master_departemen').select('*');
    const { data: timData } = await supabase.from('master_tim').select('*');
    const { data: karData } = await supabase.from('karyawan').select('*, master_departemen(nama_departemen), master_tim(nama_tim)').order('created_at', { ascending: false });
    setDepartemen(deptData || []); setTim(timData || []); setKaryawan(karData || []);
  };

  const aksiApprove = async (id) => {
    if (!confirm('Setujui akun ini?')) return;
    await supabase.from('karyawan').update({ is_approved: true }).eq('id', id);
    fetchData();
  };

  const aksiKick = async (id) => {
    if (!confirm('Tendang perangkat ini agar karyawan bisa login di HP baru?')) return;
    await supabase.from('karyawan').update({ device_id: null }).eq('id', id);
    fetchData();
  };

  const aksiResetSandi = async (id) => {
    if (!confirm('Reset sandi karyawan ini menjadi admin123?')) return;
    await supabase.from('karyawan').update({ password: 'admin123' }).eq('id', id);
    alert('Sandi berhasil direset menjadi: admin123');
    fetchData();
  };

  const handleSimpan = async (e) => {
    e.preventDefault(); setLoading(true);
    const payload = { ...form, role: 'Karyawan', is_approved: true }; // Tambah manual admin lgsg approve
    
    // Konversi null string dropdown
    if(!payload.id_departemen) payload.id_departemen = null;
    if(!payload.id_tim) payload.id_tim = null;

    const { error } = await supabase.from('karyawan').insert([payload]);
    if (error) alert('Gagal: ' + error.message);
    else { setShowModal(false); fetchData(); }
    setLoading(false);
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Karyawan & Akses</h1>
          <p className="text-slate-500 text-sm mt-1">Manajemen akun, persetujuan pendaftar, dan reset sesi perangkat.</p>
        </div>
        <button onClick={() => {setForm({nip:'',nama_lengkap:'',username:'',password:'admin123',id_departemen:'',id_tim:''}); setShowModal(true);}} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Tambah Manual
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Profil & Akun</th>
                <th className="px-6 py-4 font-semibold">Status Auth</th>
                <th className="px-6 py-4 font-semibold text-right">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {karyawan.map((kar) => (
                <tr key={kar.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">{kar.nama_lengkap}</p>
                    <p className="text-xs font-mono text-slate-500 mt-0.5">{kar.nip} | Username: {kar.username}</p>
                  </td>
                  <td className="px-6 py-4">
                    {!kar.is_approved ? (
                      <span className="px-2 py-1 bg-amber-50 text-amber-700 font-semibold rounded border border-amber-200 text-xs">Menunggu Approve</span>
                    ) : kar.device_id ? (
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 font-semibold rounded border border-blue-200 text-xs flex items-center gap-1 w-max">
                        <Smartphone className="w-3 h-3"/> HP Tertaut
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs italic">Belum Login</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {!kar.is_approved && (
                         <button onClick={() => aksiApprove(kar.id)} className="p-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg" title="Setujui Akun"><Check className="w-4 h-4"/></button>
                      )}
                      <button onClick={() => aksiResetSandi(kar.id)} className="p-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg" title="Reset Sandi ke admin123"><KeyRound className="w-4 h-4"/></button>
                      {kar.device_id && (
                         <button onClick={() => aksiKick(kar.id)} className="p-2 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-lg" title="Kick / Unbind Perangkat"><Trash2 className="w-4 h-4"/></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-bold text-slate-900">Tambah Karyawan Manual</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSimpan} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-semibold">NIP</label><input required type="text" value={form.nip} onChange={e => setForm({...form, nip: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1"/></div>
                <div><label className="text-sm font-semibold">Username</label><input required type="text" value={form.username} onChange={e => setForm({...form, username: e.target.value.toLowerCase().replace(/\s/g,'')})} className="w-full px-3 py-2 border rounded-lg mt-1"/></div>
              </div>
              <div><label className="text-sm font-semibold">Nama Lengkap</label><input required type="text" value={form.nama_lengkap} onChange={e => setForm({...form, nama_lengkap: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1"/></div>
              <div>
                <label className="text-sm font-semibold">Departemen</label>
                <select value={form.id_departemen} onChange={e => setForm({...form, id_departemen: e.target.value, id_tim: ''})} className="w-full px-3 py-2 border rounded-lg mt-1">
                  <option value="">-- Kosong --</option>
                  {departemen.map(d => (<option key={d.id} value={d.id}>{d.nama_departemen}</option>))}
                </select>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 rounded-lg">Batal</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-white bg-blue-600 rounded-lg">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}