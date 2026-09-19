'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Plus, X, Check, Trash2, KeyRound, Smartphone, Clock } from 'lucide-react';

export default function KaryawanPage() {
  const [karyawan, setKaryawan] = useState([]);
  const [departemen, setDepartemen] = useState([]);
  const [tim, setTim] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal Tambah Karyawan
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ nip: '', nama_lengkap: '', username: '', password: 'admin123', id_departemen: '', id_tim: '' });
  const [errorsKar, setErrorsKar] = useState({});

  // Modal Input Manual Absen
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({ 
    id: null, id_karyawan: '', status: 'Masuk', 
    jam: '07', menit: '00', keterangan: '', updated_at: null 
  });
  const [errorsAbsen, setErrorsAbsen] = useState({});

  // Opsi Dropdown Kustom 24H
  const jamMasukOpts = ['07','08','09','10','11','12'];
  const jamKeluarOpts = ['12','13','14','15','16','17','18','19','20','21','22'];
  const menitOpts = Array.from({length: 60}, (_, i) => String(i).padStart(2, '0'));

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

  const handleSimpanKaryawan = async (e) => {
    e.preventDefault(); 
    
    let errs = {};
    if (!form.nip) errs.nip = "* NIP wajib diisi";
    if (!form.username) errs.username = "* Username wajib diisi";
    if (!form.nama_lengkap) errs.nama_lengkap = "* Nama Lengkap wajib diisi";
    if (Object.keys(errs).length > 0) { setErrorsKar(errs); return; }

    setLoading(true);
    const payload = { ...form, role: 'Karyawan', is_approved: true }; 
    if(!payload.id_departemen) payload.id_departemen = null;
    if(!payload.id_tim) payload.id_tim = null;

    const { error } = await supabase.from('karyawan').insert([payload]);
    if (error) alert('Gagal: ' + error.message);
    else { setShowModal(false); fetchData(); }
    setLoading(false);
  };

  const bukaInputManual = async (id) => {
    setLoading(true); setErrorsAbsen({});
    const now = new Date(new Date().getTime() + (7 * 60 * 60000));
    const todayStr = now.toISOString().split('T')[0];
    
    const { data } = await supabase.from('absensi').select('*')
      .eq('id_karyawan', id)
      .gte('waktu_masuk', `${todayStr}T00:00:00+07:00`)
      .lte('waktu_masuk', `${todayStr}T23:59:59+07:00`)
      .single();

    if (data) {
       // Cek Kondisi Data Hari Ini
       const sudahMasuk = !!data.waktu_masuk;
       const sudahKeluar = !!data.waktu_keluar;
       const isIzinCuti = ['Izin', 'Cuti'].includes(data.status);

       let setStatus = 'Masuk';
       let setJam = '07'; let setMenit = '00';

       if (isIzinCuti) {
           setStatus = data.status;
       } else if (sudahMasuk && !sudahKeluar) {
           // Jika sudah masuk tapi belum keluar, arahkan langsung ke mode Keluar
           setStatus = 'Keluar';
           setJam = '17';
       } else if (sudahMasuk) {
           setStatus = 'Masuk';
           const d = new Date(data.waktu_masuk);
           setJam = String(d.getHours()).padStart(2, '0');
           setMenit = String(d.getMinutes()).padStart(2, '0');
       }

       setManualForm({
         id: data.id, id_karyawan: id, status: setStatus,
         jam: setJam, menit: setMenit,
         keterangan: data.keterangan || '',
         updated_at: data.updated_at || data.created_at
       });
    } else {
       setManualForm({ id: null, id_karyawan: id, status: 'Masuk', jam: '07', menit: '00', keterangan: '', updated_at: null });
    }
    setShowManualModal(true);
    setLoading(false);
  };

  const handleChangeStatus = (val) => {
    let newJam = manualForm.jam;
    if (val === 'Masuk' && !jamMasukOpts.includes(newJam)) newJam = '07';
    if (val === 'Keluar' && !jamKeluarOpts.includes(newJam)) newJam = '17';
    setManualForm({ ...manualForm, status: val, jam: newJam });
    setErrorsAbsen({});
  };

  const simpanManual = async (e) => {
    e.preventDefault(); 
    
    let errs = {};
    if (['Izin', 'Cuti'].includes(manualForm.status) && !manualForm.keterangan) errs.keterangan = "* Keterangan wajib diisi";
    if (Object.keys(errs).length > 0) { setErrorsAbsen(errs); return; }

    setLoading(true);
    const now = new Date(new Date().getTime() + (7 * 60 * 60000));
    const todayStr = now.toISOString().split('T')[0];
    
    const payload = { 
      id_karyawan: manualForm.id_karyawan, 
      keterangan: ['Izin', 'Cuti'].includes(manualForm.status) ? manualForm.keterangan : null,
      updated_at: new Date().toISOString() 
    };
    
    if (manualForm.status === 'Masuk') {
       // Kalkulasi Keterlambatan Otomatis (Lewat 08:00 = Late)
       const isLate = parseInt(manualForm.jam) >= 8 && (parseInt(manualForm.jam) > 8 || parseInt(manualForm.menit) > 0);
       payload.status = isLate ? 'Late' : 'Hadir';
       payload.waktu_masuk = `${todayStr}T${manualForm.jam}:${manualForm.menit}:00+07:00`;
    } 
    else if (manualForm.status === 'Keluar') {
       payload.waktu_keluar = `${todayStr}T${manualForm.jam}:${manualForm.menit}:00+07:00`;
       // Jika ID kosong (absen keluar tanpa masuk), paksakan status Hadir agar DB tidak error
       if (!manualForm.id) {
           payload.status = 'Hadir';
           payload.waktu_masuk = null;
       }
    } 
    else {
       payload.status = manualForm.status;
       payload.waktu_masuk = `${todayStr}T08:00:00+07:00`; 
       payload.waktu_keluar = `${todayStr}T17:00:00+07:00`;
    }

    let error;
    if (manualForm.id) {
      const { error: err } = await supabase.from('absensi').update(payload).eq('id', manualForm.id);
      error = err;
    } else {
      const { error: err } = await supabase.from('absensi').insert([payload]);
      error = err;
    }

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
          <p className="text-slate-500 text-sm mt-1">Manajemen akun, persetujuan pendaftar, dan reset sesi perangkat.</p>
        </div>
        <button onClick={() => {setForm({nip:'',nama_lengkap:'',username:'',password:'admin123',id_departemen:'',id_tim:''}); setErrorsKar({}); setShowModal(true);}} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Tambah Manual
        </button>
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
                      <button onClick={() => bukaInputManual(kar.id)} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 rounded-lg" title="Input Absen Manual"><Clock className="w-4 h-4"/></button>
                      <button onClick={() => aksiResetSandi(kar.id)} className="p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg" title="Reset Sandi ke admin123"><KeyRound className="w-4 h-4"/></button>
                      {kar.device_id && (
                         <button onClick={() => aksiKick(kar.id)} className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 rounded-lg" title="Kick / Unbind Perangkat"><Trash2 className="w-4 h-4"/></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL TAMBAH KARYAWAN MANUAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <h2 className="text-lg font-bold text-slate-900">Tambah Karyawan Manual</h2>
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
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-6 pt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors">Batal</button>
                <button type="submit" disabled={loading} className="px-6 py-2 text-white font-medium bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">{loading ? 'Proses...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL INPUT ABSEN MANUAL (HARI INI) */}
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
                <select value={manualForm.status} onChange={e => handleChangeStatus(e.target.value)} className={getStyleInput(false)}>
                  <option value="Masuk">Absen Masuk (07:00 - 12:00)</option>
                  <option value="Keluar">Absen Keluar (12:00 - 22:00)</option>
                  <option value="Izin">Izin (Sakit / Kepentingan)</option>
                  <option value="Cuti">Cuti (Tahunan)</option>
                </select>
              </div>

              {/* TAMPILAN WAKTU KHUSUS MASUK / KELUAR */}
              {['Masuk', 'Keluar'].includes(manualForm.status) ? (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-1 block">
                    Waktu {manualForm.status} <span className="text-slate-400 text-xs font-normal">(Format 24H)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <select value={manualForm.jam} onChange={(e) => setManualForm({...manualForm, jam: e.target.value})} className={getStyleInput(false)}>
                      {manualForm.status === 'Masuk' 
                        ? jamMasukOpts.map(j => <option key={j} value={j}>{j}</option>)
                        : jamKeluarOpts.map(j => <option key={j} value={j}>{j}</option>)
                      }
                    </select>
                    <span className="font-black text-slate-400">:</span>
                    <select value={manualForm.menit} onChange={(e) => setManualForm({...manualForm, menit: e.target.value})} className={getStyleInput(false)}>
                      {menitOpts.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                /* TAMPILAN KETERANGAN (IZIN / CUTI) */
                <div>
                   <label className="text-sm font-semibold text-slate-700">Alasan / Keterangan <span className="text-rose-500">*</span></label>
                   <textarea rows="3" placeholder="Sakit flu, acara keluarga, dll..." value={manualForm.keterangan} onChange={e => {setManualForm({...manualForm, keterangan: e.target.value}); setErrorsAbsen({...errorsAbsen, keterangan: null});}} className={getStyleInput(errorsAbsen.keterangan)}></textarea>
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