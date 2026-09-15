'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Search, Plus, X, MapPin, Building, User } from 'lucide-react';

export default function KaryawanPage() {
  const [karyawan, setKaryawan] = useState([]);
  const [departemen, setDepartemen] = useState([]);
  const [tim, setTim] = useState([]);
  const [lokasi, setLokasi] = useState([]);
  
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // State Form
  const [form, setForm] = useState({
    nip: '',
    nama_lengkap: '',
    jabatan: '',
    id_departemen: '',
    id_tim: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Ambil data referensi master
    const { data: deptData } = await supabase.from('master_departemen').select('*');
    const { data: timData } = await supabase.from('master_tim').select('*');
    const { data: lokData } = await supabase.from('master_lokasi').select('*');
    
    // Ambil data karyawan beserta relasi namanya
    const { data: karData } = await supabase
      .from('karyawan')
      .select(`
        *,
        master_departemen(nama_departemen, wajib_tim),
        master_tim(nama_tim)
      `)
      .order('created_at', { ascending: false });

    setDepartemen(deptData || []);
    setTim(timData || []);
    setLokasi(lokData || []);
    setKaryawan(karData || []);
  };

  const handleSimpan = async (e) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      nip: form.nip,
      nama_lengkap: form.nama_lengkap,
      jabatan: form.jabatan,
      id_departemen: form.id_departemen || null,
      id_tim: form.id_tim || null,
      role: 'Karyawan'
    };

    const { error } = await supabase.from('karyawan').insert([payload]);

    if (error) {
      alert('Gagal menyimpan: ' + error.message);
    } else {
      setShowModal(false);
      setForm({ nip: '', nama_lengkap: '', jabatan: '', id_departemen: '', id_tim: '' });
      fetchData(); // Refresh tabel
    }
    setLoading(false);
  };

  // Logika UI untuk memunculkan opsi tim hanya jika departemen mewajibkannya
  const selectedDept = departemen.find(d => d.id === form.id_departemen);
  const showTimDropdown = selectedDept?.wajib_tim;

  return (
    <div className="space-y-6 relative">
      
      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Karyawan</h1>
          <p className="text-slate-500 text-sm mt-1">Manajemen profil, jabatan, dan penempatan cabang.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Tambah Pengguna
        </button>
      </div>

      {/* Tabel Karyawan */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
           <Search className="w-5 h-5 text-slate-400" />
           <input 
             type="text" 
             placeholder="Cari berdasarkan nama atau NIP..." 
             className="bg-transparent border-none focus:outline-none w-full text-sm text-slate-700"
           />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Karyawan</th>
                <th className="px-6 py-4 font-semibold">Jabatan</th>
                <th className="px-6 py-4 font-semibold">Departemen / Tim</th>
                <th className="px-6 py-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {karyawan.map((kar) => (
                <tr key={kar.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {kar.nama_lengkap.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{kar.nama_lengkap}</p>
                        <p className="text-xs text-slate-500">{kar.nip}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium">{kar.jabatan || '-'}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-900">{kar.master_departemen?.nama_departemen || 'Belum diatur'}</span>
                      {kar.master_tim && (
                        <span className="text-xs text-blue-600 font-semibold">{kar.master_tim.nama_tim}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-blue-600 hover:text-blue-800 font-medium text-sm">Edit</button>
                  </td>
                </tr>
              ))}
              {karyawan.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-slate-500">Belum ada data karyawan.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah Karyawan */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-bold text-slate-900">Tambah Pengguna</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-rose-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSimpan} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">NIP <span className="text-rose-500">*</span></label>
                  <input required type="text" value={form.nip} onChange={e => setForm({...form, nip: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm" placeholder="Contoh: KR001"/>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Jabatan</label>
                  <input type="text" value={form.jabatan} onChange={e => setForm({...form, jabatan: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm" placeholder="Contoh: Staff IT"/>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Nama Lengkap <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input required type="text" value={form.nama_lengkap} onChange={e => setForm({...form, nama_lengkap: e.target.value})} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm" placeholder="Masukkan nama lengkap"/>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Departemen</label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <select value={form.id_departemen} onChange={e => setForm({...form, id_departemen: e.target.value, id_tim: ''})} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm appearance-none bg-white">
                    <option value="">-- Pilih Departemen --</option>
                    {departemen.map(d => (
                      <option key={d.id} value={d.id}>{d.nama_departemen}</option>
                    ))}
                  </select>
                </div>
              </div>

              {showTimDropdown && (
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Tim (Wajib untuk Departemen ini)</label>
                  <select required value={form.id_tim} onChange={e => setForm({...form, id_tim: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm bg-white">
                    <option value="">-- Pilih Tim --</option>
                    {tim.filter(t => t.id_departemen === form.id_departemen).map(t => (
                      <option key={t.id} value={t.id}>{t.nama_tim}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                  Batal
                </button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
                  {loading ? 'Menyimpan...' : 'Simpan Karyawan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}