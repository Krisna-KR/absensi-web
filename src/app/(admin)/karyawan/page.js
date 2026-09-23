'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Plus, X, Check, Trash2, KeyRound, Smartphone, Clock, Briefcase, Edit2 } from 'lucide-react';

export default function KaryawanPage() {
  const [karyawan, setKaryawan] = useState([]);
  const [departemen, setDepartemen] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal Tambah/Edit Karyawan
  const [showModal, setShowModal] = useState(false);
  const [editKarId, setEditKarId] = useState(null); // Pelacak Mode Edit
  const [form, setForm] = useState({ nip: '', nama_lengkap: '', username: '', id_departemen: '' });
  const [errorsKar, setErrorsKar] = useState({});

  // Modal Input Manual Absen
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({ id: null, id_karyawan: '', status: 'Masuk', jam: '07', menit: '00', keterangan: '', updated_at: null });
  const [errorsAbsen, setErrorsAbsen] = useState({});

  // Modal Departemen
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptForm, setDeptForm] = useState({ id: null, nama_departemen: '', id_leader: '' });

  const jamMasukOpts = ['07','08','09','10','11','12'];
  const jamKeluarOpts = ['12','13','14','15','16','17','18','19','20','21','22'];
  const menitOpts = Array.from({length: 60}, (_, i) => String(i).padStart(2, '0'));

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: deptData } = await supabase.from('master_departemen').select('*');
    const { data: karData } = await supabase.from('karyawan').select('*').order('created_at', { ascending: false });
    setDepartemen(deptData || []); setKaryawan(karData || []);
  };

  // =================== LOGIKA DEPARTEMEN ===================
  const handleSimpanDept = async (e) => {
    e.preventDefault(); setLoading(true);
    const payload = { nama_departemen: deptForm.nama_departemen, id_leader: deptForm.id_leader || null };
    
    let error;
    if (deptForm.id) {
       const { error: err } = await supabase.from('master_departemen').update(payload).eq('id', deptForm.id); error = err;
    } else {
       const { error: err } = await supabase.from('master_departemen').insert([payload]); error = err;
    }

    if (error) alert('Gagal Simpan: ' + error.message);
    else { setDeptForm({ id: null, nama_departemen: '', id_leader: '' }); fetchData(); }
    setLoading(false);
  };

  const hapusDept = async (id) => {
    if (!confirm('Hapus departemen ini?')) return;
    await supabase.from('master_departemen').delete().eq('id', id); fetchData();
  };

  const getDeptText = (id_dept) => {
    if (!id_dept) return 'Belum Ada Departemen';
    const dept = departemen.find(d => d.id === id_dept);
    if (!dept) return 'Belum Ada Departemen';
    const leader = karyawan.find(k => k.id === dept.id_leader);
    return leader ? `${dept.nama_departemen} (Team ${leader.nama_lengkap})` : dept.nama_departemen;
  };

  // =================== LOGIKA KARYAWAN ===================
  const bukaTambahKaryawan = () => {
    setEditKarId(null);
    setForm({ nip: '', nama_lengkap: '', username: '', id_departemen: '' });
    setErrorsKar({}); setShowModal(true);
  };

  const bukaEditKaryawan = (kar) => {
    setEditKarId(kar.id);
    setForm({ 
      nip: kar.nip, 
      nama_lengkap: kar.nama_lengkap, 
      username: kar.username, 
      id_departemen: kar.id_departemen || '' 
    });
    setErrorsKar({}); setShowModal(true);
  };

  const aksiApprove = async (id) => {
    if (!confirm('Setujui akun ini?')) return;
    await supabase.from('karyawan').update({ is_approved: true }).eq('id', id); fetchData();
  };

  const aksiKick = async (id) => {
    if (!confirm('Tendang perangkat ini agar karyawan bisa login di HP baru?')) return;
    await supabase.from('karyawan').update({ device_id: null }).eq('id', id); fetchData();
  };

  const aksiResetSandi = async (id) => {
    if (!confirm('Reset sandi karyawan ini menjadi admin123?')) return;
    await supabase.from('karyawan').update({ password: 'admin123' }).eq('id', id);
    alert('Sandi berhasil direset menjadi: admin123'); fetchData();
  };

  const handleSimpanKaryawan = async (e) => {
    e.preventDefault(); 
    let errs = {};
    if (!form.nip) errs.nip = "* NIP wajib diisi";
    if (!form.username) errs.username = "* Username wajib diisi";
    if (!form.nama_lengkap) errs.nama_lengkap = "* Nama Lengkap wajib diisi";
    if (!form.id_departemen) errs.id_departemen = "* Departemen wajib dipilih"; 
    if (Object.keys(errs).length > 0) { setErrorsKar(errs); return; }

    setLoading(true);
    const payload = { 
      nip: form.nip, 
      nama_lengkap: form.nama_lengkap, 
      username: form.username, 
      id_departemen: form.id_departemen || null 
    }; 
    
    let error;
    if (editKarId) {
      // Mode Edit: Password, Role, dan Approval TIDAK boleh diganggu gugat
      const { error: err } = await supabase.from('karyawan').update(payload).eq('id', editKarId); error = err;
    } else {
      // Mode Tambah Baru: Set Default Value
      payload.password = 'admin123';
      payload.role = 'Karyawan';
      payload.is_approved = true;
      const { error: err } = await supabase.from('karyawan').insert([payload]); error = err;
    }

    if (error) alert('Gagal: ' + error.message);
    else { setShowModal(false); fetchData(); }
    setLoading(false);
  };

  // =================== LOGIKA ABSEN MANUAL ===================
  const bukaInputManual = async (id) => {
    setLoading(true); setErrorsAbsen({});
    const now = new Date(new Date().getTime() + (7 * 60 * 60000));
    const todayStr = now.toISOString().split('T')[0];
    
    const { data } = await supabase.from('absensi').select('*').eq('id_karyawan', id).gte('waktu_masuk', `${todayStr}T00:00:00+07:00`).lte('waktu_masuk', `${todayStr}T23:59:59+07:00`).single();

    if (data) {
       const sudahMasuk = !!data.waktu_masuk; const sudahKeluar = !!data.waktu_keluar; const isIzinCuti = ['Izin', 'Cuti'].includes(data.status);
       let setStatus = 'Masuk'; let setJam = '07'; let setMenit = '00';

       if (isIzinCuti) { setStatus = data.status; } 
       else if (sudahMasuk && !sudahKeluar) { setStatus = 'Keluar'; setJam = '17'; } 
       else if (sudahMasuk) {
           setStatus = 'Masuk'; const d = new Date(data.waktu_masuk);
           setJam = String(d.getHours()).padStart(2, '0'); setMenit = String(d.getMinutes()).padStart(2, '0');
       }
       setManualForm({ id: data.id, id_karyawan: id, status: setStatus, jam: setJam, menit: setMenit, keterangan: data.keterangan || '', updated_at: data.updated_at || data.created_at });
    } else {
       setManualForm({ id: null, id_karyawan: id, status: 'Masuk', jam: '07', menit: '00', keterangan: '', updated_at: null });
    }
    setShowManualModal(true); setLoading(false);
  };

  const simpanManual = async (e) => {
    e.preventDefault(); 
    let errs = {};
    if (['Izin', 'Cuti'].includes(manualForm.status) && !manualForm.keterangan) errs.keterangan = "* Keterangan wajib diisi";
    if (Object.keys(errs).length > 0) { setErrorsAbsen(errs); return; }

    setLoading(true);
    const now = new Date(new Date().getTime() + (7 * 60 * 60000));
    const todayStr = now.toISOString().split('T')[0];
    const payload = { id_karyawan: manualForm.id_karyawan, keterangan: ['Izin', 'Cuti'].includes(manualForm.status) ? manualForm.keterangan : null, updated_at: new Date().toISOString() };
    
    if (manualForm.status === 'Masuk') {
       const isLate = parseInt(manualForm.jam) >= 8 && (parseInt(manualForm.jam) > 8 || parseInt(manualForm.menit) > 0);
       payload.status = isLate ? 'Late' : 'Hadir';
       payload.waktu_masuk = `${todayStr}T${manualForm.jam}:${manualForm.menit}:00+07:00`;
    } else if (manualForm.status === 'Keluar') {
       payload.waktu_keluar = `${todayStr}T${manualForm.jam}:${manualForm.menit}:00+07:00`;
       if (!manualForm.id) { payload.status = 'Hadir'; payload.waktu_masuk = null; }
    } else {
       payload.status = manualForm.status; payload.waktu_masuk = `${todayStr}T08:00:00+07:00`; payload.waktu_keluar = `${todayStr}T17:00:00+07:00`;
    }

    let error;
    if (manualForm.id) { const { error: err } = await supabase.from('absensi').update(payload).eq('id', manualForm.id); error = err; } 
    else { const { error: err } = await supabase.from('absensi').insert([payload]); error = err; }
    if (error) alert('Gagal: ' + error.message);
    else { alert('Data berhasil disimpan.'); setShowManualModal(false); fetchData(); }
    setLoading(false);
  };

  const getStyleInput = (isError) => `w-full px-3 py-2 border rounded-lg mt-1 outline-none transition-colors text-sm ${isError ? 'border-rose-500 bg-rose-50 focus:ring-1 focus:ring-rose-500' : 'border-slate-200 bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400'}`;

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Karyawan & Akses</h1>
          <p className="text-slate-500 text-sm mt-1">Manajemen akun, divisi, dan kontrol perangkat genggam.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => {setDeptForm({id: null, nama_departemen: '', id_leader: ''}); setShowDeptModal(true);}} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors border border-slate-300 shadow-sm">
            <Briefcase className="w-4 h-4" /> Kelola Departemen
          </button>
          <button onClick={bukaTambahKaryawan} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Tambah Manual
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 min-w-[600px]">
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
                    <span className="inline-block mt-2 px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded border border-slate-200 tracking-wide">
                       {getDeptText(kar.id_departemen)}
                    </span>
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
                      {!kar.is_approved && (<button onClick={() => aksiApprove(kar.id)} className="p-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg" title="Setujui Akun"><Check className="w-4 h-4"/></button>)}
                      
                      {/* TOMBOL EDIT KARYAWAN KEMBALI */}
                      <button onClick={() => bukaEditKaryawan(kar)} className="p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg" title="Edit Data Karyawan"><Edit2 className="w-4 h-4"/></button>
                      
                      <button onClick={() => bukaInputManual(kar.id)} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 rounded-lg" title="Input Absen Manual"><Clock className="w-4 h-4"/></button>
                      <button onClick={() => aksiResetSandi(kar.id)} className="p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg" title="Reset Sandi ke admin123"><KeyRound className="w-4 h-4"/></button>
                      {kar.device_id && (<button onClick={() => aksiKick(kar.id)} className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 rounded-lg" title="Kick / Unbind Perangkat"><Trash2 className="w-4 h-4"/></button>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DEPARTEMEN */}
      {showDeptModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <h2 className="text-lg font-bold text-slate-900">Kelola Departemen</h2>
              <button onClick={() => setShowDeptModal(false)} className="text-slate-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleSimpanDept} className={`p-6 border-b border-slate-200 ${deptForm.id ? 'bg-indigo-50/50' : 'bg-slate-50'}`}>
               <div className="space-y-4">
                 <div>
                   <label className="text-sm font-semibold text-slate-700">Nama Departemen</label>
                   <input required type="text" value={deptForm.nama_departemen} onChange={e => setDeptForm({...deptForm, nama_departemen: e.target.value})} className={getStyleInput(false)} placeholder="Contoh: Marketing"/>
                 </div>
                 <div>
                   <label className="text-sm font-semibold text-slate-700">Pilih Team Leader (Opsional)</label>
                   <select value={deptForm.id_leader} onChange={e => setDeptForm({...deptForm, id_leader: e.target.value})} className={getStyleInput(false)}>
                     <option value="">-- Tanpa Leader --</option>
                     {karyawan.filter(k => k.is_approved).map(k => <option key={k.id} value={k.id}>{k.nama_lengkap}</option>)}
                   </select>
                 </div>
                 <div className="flex gap-2">
                    {deptForm.id && (
                       <button type="button" onClick={() => setDeptForm({ id: null, nama_departemen: '', id_leader: '' })} className="w-1/3 py-2 text-slate-600 font-medium bg-white hover:bg-slate-100 rounded-lg shadow-sm border border-slate-200 transition-colors">Batal</button>
                    )}
                    <button type="submit" disabled={loading} className={`${deptForm.id ? 'w-2/3 bg-indigo-600 hover:bg-indigo-700' : 'w-full bg-slate-800 hover:bg-slate-900'} py-2 text-white font-medium rounded-lg shadow-sm transition-colors`}>
                       {deptForm.id ? 'Simpan Perubahan' : 'Tambah Departemen'}
                    </button>
                 </div>
               </div>
            </form>

            <div className="p-6 max-h-60 overflow-y-auto bg-white">
               <p className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-widest">Daftar Departemen</p>
               <ul className="space-y-2">
                 {departemen.length === 0 ? <li className="text-sm text-slate-500 italic">Belum ada data.</li> : departemen.map(d => {
                   const leader = karyawan.find(k => k.id === d.id_leader);
                   return (
                     <li key={d.id} className={`flex justify-between items-center p-3 border rounded-lg transition-colors ${deptForm.id === d.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                       <div>
                         <p className="font-bold text-slate-800 text-sm">{d.nama_departemen}</p>
                         <p className="text-xs text-slate-500">Leader: {leader ? leader.nama_lengkap : '-'}</p>
                       </div>
                       <div className="flex gap-1">
                         <button onClick={() => setDeptForm({ id: d.id, nama_departemen: d.nama_departemen, id_leader: d.id_leader || '' })} className="text-slate-500 bg-slate-50 p-2 rounded-lg hover:bg-slate-100 hover:text-indigo-600"><Edit2 className="w-4 h-4"/></button>
                         <button onClick={() => hapusDept(d.id)} className="text-rose-500 bg-rose-50 p-2 rounded-lg hover:bg-rose-100"><Trash2 className="w-4 h-4"/></button>
                       </div>
                     </li>
                   )
                 })}
               </ul>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH/EDIT KARYAWAN MANUAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <h2 className="text-lg font-bold text-slate-900">{editKarId ? 'Edit Karyawan' : 'Tambah Karyawan Manual'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSimpanKaryawan} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-700">NIP <span className="text-rose-500">*</span></label>
                  <input type="text" value={form.nip} onChange={e => {setForm({...form, nip: e.target.value}); setErrorsKar({...errorsKar, nip: null});}} className={getStyleInput(errorsKar.nip)}/>
                  {errorsKar.nip && <p className="text-rose-500 text-[10px] mt-1 italic font-bold">{errorsKar.nip}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Username <span className="text-rose-500">*</span></label>
                  <input type="text" value={form.username} onChange={e => {setForm({...form, username: e.target.value.toLowerCase().replace(/\s/g,'')}); setErrorsKar({...errorsKar, username: null});}} className={getStyleInput(errorsKar.username)}/>
                  {errorsKar.username && <p className="text-rose-500 text-[10px] mt-1 italic font-bold">{errorsKar.username}</p>}
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Nama Lengkap <span className="text-rose-500">*</span></label>
                <input type="text" value={form.nama_lengkap} onChange={e => {setForm({...form, nama_lengkap: e.target.value}); setErrorsKar({...errorsKar, nama_lengkap: null});}} className={getStyleInput(errorsKar.nama_lengkap)}/>
                {errorsKar.nama_lengkap && <p className="text-rose-500 text-[10px] mt-1 italic font-bold">{errorsKar.nama_lengkap}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Departemen <span className="text-rose-500">*</span></label>
                {/* MENU DROPDOWN DEPARTEMEN */}
                <select value={form.id_departemen} onChange={e => {setForm({...form, id_departemen: e.target.value}); setErrorsKar({...errorsKar, id_departemen: null});}} className={getStyleInput(errorsKar.id_departemen)}>
                  <option value="">-- Pilih Departemen --</option>
                  {departemen.map(d => <option key={d.id} value={d.id}>{d.nama_departemen}</option>)}
                </select>
                {errorsKar.id_departemen && <p className="text-rose-500 text-[10px] mt-1 italic font-bold">{errorsKar.id_departemen}</p>}
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-6 pt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors">Batal</button>
                <button type="submit" disabled={loading} className="px-6 py-2 text-white font-medium bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">{loading ? 'Proses...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL INPUT ABSEN MANUAL */}
      {showManualModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <h2 className="text-lg font-bold text-slate-900">Input Absen Hari Ini</h2>
              <button onClick={() => setShowManualModal(false)} className="text-slate-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={simpanManual} className="p-6 space-y-4">
              {manualForm.updated_at && (
                <div className="px-3 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-xs font-medium mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0"/> Terakhir diubah: {new Date(manualForm.updated_at).toLocaleString('id-ID')}
                </div>
              )}

              <div>
                <label className="text-sm font-semibold text-slate-700">Pilih Status <span className="text-rose-500">*</span></label>
                <select value={manualForm.status} onChange={e => {
                  let newJam = manualForm.jam;
                  if (e.target.value === 'Masuk' && !jamMasukOpts.includes(newJam)) newJam = '07';
                  if (e.target.value === 'Keluar' && !jamKeluarOpts.includes(newJam)) newJam = '17';
                  setManualForm({...manualForm, status: e.target.value, jam: newJam}); 
                  setErrorsAbsen({});
                }} className={getStyleInput(false)}>
                  <option value="Masuk">Absen Masuk (07:00 - 12:00)</option>
                  <option value="Keluar">Absen Keluar (12:00 - 22:00)</option>
                  <option value="Izin">Izin (Sakit / Kepentingan)</option>
                  <option value="Cuti">Cuti (Tahunan)</option>
                </select>
              </div>

              {['Masuk', 'Keluar'].includes(manualForm.status) ? (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-1 block">Waktu {manualForm.status} <span className="text-slate-400 text-xs font-normal">(Format 24H)</span></label>
                  <div className="flex items-center gap-2">
                    <select value={manualForm.jam} onChange={(e) => setManualForm({...manualForm, jam: e.target.value})} className={getStyleInput(false)}>
                      {manualForm.status === 'Masuk' ? jamMasukOpts.map(j => <option key={j} value={j}>{j}</option>) : jamKeluarOpts.map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                    <span className="font-black text-slate-400">:</span>
                    <select value={manualForm.menit} onChange={(e) => setManualForm({...manualForm, menit: e.target.value})} className={getStyleInput(false)}>
                      {menitOpts.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                   <label className="text-sm font-semibold text-slate-700">Alasan / Keterangan <span className="text-rose-500">*</span></label>
                   <textarea rows="3" placeholder="Sakit flu, dll..." value={manualForm.keterangan} onChange={e => {setManualForm({...manualForm, keterangan: e.target.value}); setErrorsAbsen({...errorsAbsen, keterangan: null});}} className={getStyleInput(errorsAbsen.keterangan)}></textarea>
                   {errorsAbsen.keterangan && <p className="text-rose-500 text-[10px] mt-1 italic font-bold">{errorsAbsen.keterangan}</p>}
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-6 pt-6">
                <button type="button" onClick={() => setShowManualModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors">Batal</button>
                <button type="submit" disabled={loading} className="px-6 py-2 text-white font-medium bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors">{loading ? 'Proses...' : 'Simpan Absen'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}