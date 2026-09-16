'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Search, Plus, X, MapPin, Building, User, KeyRound } from 'lucide-react';

export default function KaryawanPage() {
  const [karyawan, setKaryawan] = useState([]);
  const [departemen, setDepartemen] = useState([]);
  const [tim, setTim] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState(null);

const [form, setForm] = useState({
    nip: '', nama_lengkap: '', jabatan: '', id_departemen: '', id_tim: '', device_key: '', reset_device: false
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: deptData } = await supabase.from('master_departemen').select('*');
    const { data: timData } = await supabase.from('master_tim').select('*');
    const { data: karData } = await supabase.from('karyawan').select('*, master_departemen(nama_departemen, wajib_tim), master_tim(nama_tim)').order('created_at', { ascending: false });
    setDepartemen(deptData || []); setTim(timData || []); setKaryawan(karData || []);
  };

const generateDeviceKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'KR-';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Tambahkan bendera reset_device: true
    setForm({ ...form, device_key: result, reset_device: true });
  };

const handleEdit = (kar) => {
    setEditId(kar.id);
    setForm({
      nip: kar.nip, nama_lengkap: kar.nama_lengkap, jabatan: kar.jabatan || '',
      id_departemen: kar.id_departemen || '', id_tim: kar.id_tim || '', device_key: kar.device_key || '', reset_device: false
    });
    setShowModal(true);
  };

  const openTambah = () => {
    setEditId(null);
    setForm({ nip: '', nama_lengkap: '', jabatan: '', id_departemen: '', id_tim: '', device_key: '', reset_device: false });
    setShowModal(true);
  };

const handleSimpan = async (e) => {
    e.preventDefault();
    setLoading(true);

    // 1. Deklarasikan objek payload terlebih dahulu
    const payload = {
      nip: form.nip, nama_lengkap: form.nama_lengkap, jabatan: form.jabatan,
      id_departemen: form.id_departemen || null, id_tim: form.id_tim || null,
      device_key: form.device_key || null, role: 'Karyawan'
    };

    // 2. Modifikasi payload jika bendera reset aktif
    if (form.reset_device) {
      payload.device_id = null;
    }

    let error;
    if (editId) {
      const { error: err } = await supabase.from('karyawan').update(payload).eq('id', editId);
      error = err;
    } else {
      const { error: err } = await supabase.from('karyawan').insert([payload]);
      error = err;
    }

    if (error) alert('Gagal: ' + error.message);
    else {
      setShowModal(false);
      fetchData();
    }
    setLoading(false);
  };

  const selectedDept = departemen.find(d => d.id === form.id_departemen);
  const showTimDropdown = selectedDept?.wajib_tim;

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Karyawan</h1>
          <p className="text-slate-500 text-sm mt-1">Manajemen profil, jabatan, dan kunci akses.</p>
        </div>
        <button onClick={openTambah} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Tambah Pengguna
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Karyawan</th>
                <th className="px-6 py-4 font-semibold">Jabatan</th>
                <th className="px-6 py-4 font-semibold">Departemen</th>
                <th className="px-6 py-4 font-semibold">PIN Akses</th>
                <th className="px-6 py-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {karyawan.map((kar) => (
                <tr key={kar.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-slate-900">{kar.nama_lengkap}</p>
                    <p className="text-xs text-slate-500">{kar.nip}</p>
                  </td>
                  <td className="px-6 py-4 font-medium">{kar.jabatan || '-'}</td>
                  <td className="px-6 py-4">{kar.master_departemen?.nama_departemen || '-'}</td>
                  <td className="px-6 py-4">
                    {kar.device_key ? <span className="px-2 py-1 bg-green-50 text-green-700 font-bold rounded border border-green-200 tracking-widest">{kar.device_key}</span> : <span className="text-rose-500 text-xs italic">Belum diset</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleEdit(kar)} className="text-blue-600 hover:text-blue-800 font-medium text-sm px-3 py-1 bg-blue-50 rounded-lg">Edit</button>
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
              <h2 className="text-lg font-bold text-slate-900">{editId ? 'Edit Pengguna' : 'Tambah Pengguna'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleSimpan} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-700">NIP <span className="text-rose-500">*</span></label>
                  <input required type="text" value={form.nip} onChange={e => setForm({...form, nip: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mt-1"/>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Jabatan</label>
                  <input type="text" value={form.jabatan} onChange={e => setForm({...form, jabatan: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mt-1"/>
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Nama Lengkap <span className="text-rose-500">*</span></label>
                <input required type="text" value={form.nama_lengkap} onChange={e => setForm({...form, nama_lengkap: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mt-1"/>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">Device Key (Kunci Perangkat)</label>
                <div className="flex gap-2">
                  <input type="text" readOnly value={form.device_key} placeholder="Kunci belum di-generate" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 font-mono tracking-widest font-bold text-slate-700"/>
                  <button type="button" onClick={generateDeviceKey} className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg flex items-center justify-center" title="Generate Key Baru">
                    <KeyRound className="w-4 h-4" />
                  </button>
                </div>  
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">Departemen</label>
                <select value={form.id_departemen} onChange={e => setForm({...form, id_departemen: e.target.value, id_tim: ''})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                  <option value="">-- Pilih Departemen --</option>
                  {departemen.map(d => (<option key={d.id} value={d.id}>{d.nama_departemen}</option>))}
                </select>
              </div>

              {showTimDropdown && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">Tim</label>
                  <select required value={form.id_tim} onChange={e => setForm({...form, id_tim: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                    <option value="">-- Pilih Tim --</option>
                    {tim.filter(t => t.id_departemen === form.id_departemen).map(t => (<option key={t.id} value={t.id}>{t.nama_tim}</option>))}
                  </select>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-semibold bg-slate-100 rounded-lg">Batal</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg">{loading ? 'Proses...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}