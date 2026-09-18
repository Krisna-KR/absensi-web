'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Html5Qrcode } from 'html5-qrcode';
import { CheckCircle2, AlertCircle, Camera, Lock, RefreshCcw, KeyRound, LogOut } from 'lucide-react';

export default function MobileScannerPage() {
  // 0: Register, 1: Login, 2: Scanner, 3: Status, 4: Ganti Sandi
  const [step, setStep] = useState(1); 
  const [form, setForm] = useState({ username: '', password: '', nama_lengkap: '', nip: '' });
  const [karyawan, setKaryawan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [passForm, setPassForm] = useState({ old: '', new: '' });
  
  const html5QrCodeRef = useRef(null);
  const [cameraMode, setCameraMode] = useState('environment');
  const [isCameraStarting, setIsCameraStarting] = useState(false);

  useEffect(() => {
    const savedKaryawan = localStorage.getItem('karyawan_data');
    if (savedKaryawan) {
      setKaryawan(JSON.parse(savedKaryawan));
      setStep(2);
    }
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true); setMessage('');
    const { error } = await supabase.from('karyawan').insert([{
      nip: form.nip,
      nama_lengkap: form.nama_lengkap,
      username: form.username,
      password: form.password,
      is_approved: false,
      role: 'Karyawan'
    }]);
    
    if (error) setMessage('Gagal daftar: ' + error.message);
    else {
      setMessage('Registrasi berhasil! Menunggu persetujuan Admin.');
      setTimeout(() => { setStep(1); setMessage(''); }, 3000);
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setMessage('');

    const { data, error } = await supabase.from('karyawan')
      .select('*').eq('username', form.username).eq('password', form.password).single();
    
    if (error || !data) { setMessage('Username/Password salah.'); setLoading(false); return; }
    if (!data.is_approved) { setMessage('Akun belum disetujui Admin.'); setLoading(false); return; }

    let currentDeviceId = localStorage.getItem('device_id');
    if (!currentDeviceId) {
      currentDeviceId = crypto.randomUUID();
      localStorage.setItem('device_id', currentDeviceId);
    }

    if (data.device_id && data.device_id !== currentDeviceId) {
      setMessage('Akses Ditolak: Akun sudah terkunci di perangkat lain.');
      setLoading(false); return;
    }

    if (!data.device_id) {
      await supabase.from('karyawan').update({ device_id: currentDeviceId }).eq('id', data.id);
      data.device_id = currentDeviceId;
    }

    localStorage.setItem('karyawan_data', JSON.stringify(data));
    setKaryawan(data); setStep(2); setLoading(false);
  };

  const handleGantiSandi = async (e) => {
    e.preventDefault();
    setLoading(true); setMessage('');
    if (karyawan.password !== passForm.old) {
      setMessage('Password lama salah!'); setLoading(false); return;
    }
    const { error } = await supabase.from('karyawan').update({ password: passForm.new }).eq('id', karyawan.id);
    if (error) setMessage('Gagal: ' + error.message);
    else {
      const updatedKaryawan = { ...karyawan, password: passForm.new };
      localStorage.setItem('karyawan_data', JSON.stringify(updatedKaryawan));
      setKaryawan(updatedKaryawan);
      setMessage('BERHASIL: Password diubah.');
      setTimeout(() => { setStep(2); setMessage(''); setPassForm({old:'', new:''}); }, 2000);
    }
    setLoading(false);
  };

  const startCamera = async (mode) => {
    if (isCameraStarting) return;
    setIsCameraStarting(true);
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      }
      const html5QrCode = new Html5Qrcode("reader");
      html5QrCodeRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: mode },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await html5QrCode.stop().catch(() => {});
          await prosesAbsensi(decodedText);
        },
        () => {} 
      );
    } catch (err) { setMessage('Kamera error: ' + err.message); }
    setIsCameraStarting(false);
  };

  const toggleCamera = () => {
    const newMode = cameraMode === 'environment' ? 'user' : 'environment';
    setCameraMode(newMode);
    startCamera(newMode);
  };

  useEffect(() => {
    if (step === 2) {
      startCamera(cameraMode);
      return () => {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.stop().catch(() => {});
        }
      };
    }
  }, [step]);

  const prosesAbsensi = async (qrData) => {
    setLoading(true); setStep(3);
    try {
      if (!qrData.startsWith('ABSENSI-KR-')) throw new Error('Kode QR tidak valid.');
      if ((Date.now() - parseInt(qrData.split('-')[2])) / 1000 > 60) throw new Error('Kode QR kedaluwarsa.');

      const currentHour = new Date().getHours();
      let jenisAbsen = '';
      if (currentHour >= 7 && currentHour <= 12) jenisAbsen = 'MASUK';
      else if (currentHour >= 12 && currentHour <= 23) jenisAbsen = 'KELUAR';
      else throw new Error('Di luar jam operasional (07:00 - 23:59).');

      const today = new Date().toISOString().split('T')[0];

      if (jenisAbsen === 'MASUK') {
        const { data: cekMasuk } = await supabase.from('absensi').select('id').eq('id_karyawan', karyawan.id).gte('waktu_masuk', `${today}T00:00:00`).single();
        if (cekMasuk) throw new Error('Sudah absen MASUK hari ini.');
        const { error } = await supabase.from('absensi').insert([{ id_karyawan: karyawan.id, waktu_masuk: new Date().toISOString(), status: currentHour > 8 ? 'Late' : 'Hadir' }]);
        if (error) throw error;
        setMessage('BERHASIL ABSEN MASUK');
      } else {
        const { data: dataMasuk } = await supabase.from('absensi').select('*').eq('id_karyawan', karyawan.id).gte('waktu_masuk', `${today}T00:00:00`).order('waktu_masuk', { ascending: false }).limit(1);
        if (!dataMasuk || dataMasuk.length === 0) throw new Error('Belum absen MASUK hari ini.');
        if (dataMasuk[0].waktu_keluar) throw new Error('Sudah absen KELUAR hari ini.');
        const { error } = await supabase.from('absensi').update({ waktu_keluar: new Date().toISOString() }).eq('id', dataMasuk[0].id);
        if (error) throw error;
        setMessage('BERHASIL ABSEN KELUAR');
      }
    } catch (error) { setMessage(`GAGAL: ${error.message}`); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        <div className="bg-blue-600 p-6 text-center text-white relative">
          {step === 2 && (
            <button onClick={() => setStep(4)} className="absolute top-4 right-4 bg-white/20 p-2 rounded-full hover:bg-white/30 transition">
              <KeyRound className="w-4 h-4" />
            </button>
          )}
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            {step === 1 || step === 0 ? <Lock className="w-6 h-6" /> : step === 4 ? <KeyRound className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
          </div>
          <h1 className="text-xl font-bold tracking-wide">Absensi Seluler KR</h1>
          {karyawan && <p className="text-blue-100 text-sm mt-1">{karyawan.nama_lengkap}</p>}
        </div>

        <div className="p-6">
          {/* FASE 0: REGISTRASI */}
          {step === 0 && (
            <form onSubmit={handleRegister} className="space-y-4">
              <p className="text-slate-600 text-sm text-center mb-4">Daftarkan profil Anda.</p>
              <div><input required type="text" placeholder="NIP (Contoh: KR001)" value={form.nip} onChange={e => setForm({...form, nip: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"/></div>
              <div><input required type="text" placeholder="Nama Lengkap" value={form.nama_lengkap} onChange={e => setForm({...form, nama_lengkap: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"/></div>
              <div><input required type="text" placeholder="Username (huruf kecil tanpa spasi)" value={form.username} onChange={e => setForm({...form, username: e.target.value.toLowerCase().replace(/\s/g,'')})} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"/></div>
              <div><input required type="password" placeholder="Password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"/></div>
              {message && <div className="p-3 bg-blue-50 text-blue-700 text-sm rounded-lg font-medium">{message}</div>}
              <button disabled={loading} type="submit" className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition">{loading ? 'Memproses...' : 'Daftar Sekarang'}</button>
              <button type="button" onClick={() => setStep(1)} className="w-full text-blue-600 font-semibold text-sm mt-2">Sudah punya akun? Masuk</button>
            </form>
          )}

          {/* FASE 1: LOGIN */}
          {step === 1 && (
            <form onSubmit={handleLogin} className="space-y-4">
              <p className="text-slate-600 text-sm text-center mb-4">Masuk untuk menautkan perangkat permanen.</p>
              <div><input required type="text" placeholder="Username" value={form.username} onChange={e => setForm({...form, username: e.target.value.toLowerCase()})} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"/></div>
              <div><input required type="password" placeholder="Password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"/></div>
              {message && <div className="p-3 bg-rose-50 text-rose-600 text-sm rounded-lg flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/> <p>{message}</p></div>}
              <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition">{loading ? 'Memvalidasi...' : 'Masuk & Tautkan'}</button>
              <button type="button" onClick={() => setStep(0)} className="w-full text-blue-600 font-semibold text-sm mt-2">Belum punya akun? Daftar disini</button>
            </form>
          )}

          {/* FASE 2: SCANNER */}
          {step === 2 && (
            <div className="flex flex-col items-center">
              <div id="reader" className="w-full overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-900 min-h-[300px]"></div>
              <button disabled={isCameraStarting} onClick={toggleCamera} className="mt-6 flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3 rounded-full font-semibold transition border border-slate-300">
                <RefreshCcw className={`w-5 h-5 ${isCameraStarting ? 'animate-spin' : ''}`} /> Ganti Kamera
              </button>
            </div>
          )}

          {/* FASE 3: STATUS ABSENSI */}
          {step === 3 && (
            <div className="flex flex-col items-center text-center py-6">
              {message.includes('BERHASIL') ? <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4"><CheckCircle2 className="w-10 h-10" /></div> : <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4"><AlertCircle className="w-10 h-10" /></div>}
              <h2 className={`text-xl font-bold mb-2 ${message.includes('BERHASIL') ? 'text-green-600' : 'text-rose-600'}`}>{message.includes('BERHASIL') ? message : 'ABSENSI GAGAL'}</h2>
              {!message.includes('BERHASIL') && <p className="text-slate-600 text-sm">{message.replace('GAGAL: ', '')}</p>}
              <button onClick={() => { setStep(2); setMessage(''); }} className="mt-8 px-6 py-2 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200">Kembali ke Scanner</button>
            </div>
          )}

          {/* FASE 4: GANTI SANDI */}
          {step === 4 && (
            <form onSubmit={handleGantiSandi} className="space-y-4">
              <h2 className="text-lg font-bold text-center mb-4 text-slate-800">Ubah Password Akun</h2>
              <div><input required type="password" placeholder="Password Lama" value={passForm.old} onChange={e => setPassForm({...passForm, old: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"/></div>
              <div><input required type="password" placeholder="Password Baru" value={passForm.new} onChange={e => setPassForm({...passForm, new: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"/></div>
              {message && <div className={`p-3 text-sm rounded-lg ${message.includes('BERHASIL') ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-600'}`}>{message}</div>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => {setStep(2); setMessage('');}} className="w-1/3 bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 transition">Batal</button>
                <button disabled={loading} type="submit" className="w-2/3 bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition">{loading ? 'Memproses...' : 'Simpan Sandi'}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}