'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Html5Qrcode } from 'html5-qrcode';
import { CheckCircle2, AlertCircle, Camera, Lock, RefreshCcw } from 'lucide-react';

export default function MobileScannerPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ username: '', password: '' });
  const [karyawan, setKaryawan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // State Kamera
  const html5QrCodeRef = useRef(null);
  const [cameraMode, setCameraMode] = useState('environment'); // 'environment' (belakang) atau 'user' (depan)
  const [isCameraStarting, setIsCameraStarting] = useState(false);

  useEffect(() => {
    // Cek sesi penguncian perangkat
    const savedKaryawan = localStorage.getItem('karyawan_data');
    if (savedKaryawan) {
      setKaryawan(JSON.parse(savedKaryawan));
      setStep(2);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    // Validasi Akun
    const { data, error } = await supabase.from('karyawan')
      .select('*')
      .eq('username', form.username)
      .eq('password', form.password)
      .single();
    
    if (error || !data) {
      setMessage('Username atau Password salah.');
      setLoading(false); return;
    }
    if (!data.is_approved) {
      setMessage('Akun belum disetujui oleh Admin.');
      setLoading(false); return;
    }

    // Penguncian Perangkat (Sesi Abadi)
    let currentDeviceId = localStorage.getItem('device_id');
    if (!currentDeviceId) {
      currentDeviceId = crypto.randomUUID();
      localStorage.setItem('device_id', currentDeviceId);
    }

    if (data.device_id && data.device_id !== currentDeviceId) {
      setMessage('Akses Ditolak: Akun ini sudah terkunci di perangkat lain.');
      setLoading(false); return;
    }

    if (!data.device_id) {
      await supabase.from('karyawan').update({ device_id: currentDeviceId }).eq('id', data.id);
      data.device_id = currentDeviceId;
    }

    localStorage.setItem('karyawan_data', JSON.stringify(data));
    setKaryawan(data);
    setStep(2);
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
        () => {} // Abaikan error background
      );
    } catch (err) {
      setMessage('Kamera gagal dimuat: ' + err.message);
    }
    setIsCameraStarting(false);
  };

  const toggleCamera = () => {
    const newMode = cameraMode === 'environment' ? 'user' : 'environment';
    setCameraMode(newMode);
    startCamera(newMode);
  };

  // Pelatuk mulai kamera saat masuk step 2
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
    setLoading(true);
    setStep(3);

    try {
      if (!qrData.startsWith('ABSENSI-KR-')) throw new Error('Kode QR tidak valid.');
      
      const qrTimestamp = parseInt(qrData.split('-')[2]);
      if ((Date.now() - qrTimestamp) / 1000 > 60) throw new Error('Kode QR kedaluwarsa.');

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
    } catch (error) {
      setMessage(`GAGAL: ${error.message}`);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        <div className="bg-blue-600 p-6 text-center text-white">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
            {step === 1 ? <Lock className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
          </div>
          <h1 className="text-xl font-bold tracking-wide">Absensi Seluler KR</h1>
          {karyawan && <p className="text-blue-100 text-sm mt-1">{karyawan.nama_lengkap}</p>}
        </div>

        <div className="p-6">
          {step === 1 && (
            <form onSubmit={handleLogin} className="space-y-4">
              <p className="text-slate-600 text-sm text-center mb-6">Masuk untuk menautkan perangkat ini permanen.</p>
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">Username</label>
                <input required type="text" value={form.username} onChange={e => setForm({...form, username: e.target.value.toLowerCase()})} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">Password</label>
                <input required type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"/>
              </div>
              {message && <div className="p-3 bg-rose-50 text-rose-600 text-sm rounded-lg flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/> <p>{message}</p></div>}
              <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition">
                {loading ? 'Memvalidasi...' : 'Masuk & Tautkan'}
              </button>
              <div className="text-center mt-4">
                 <button type="button" onClick={() => alert('Fitur Registrasi akan dibangun di Tahap 2')} className="text-blue-600 text-sm font-semibold">Belum punya akun? Daftar disini</button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="flex flex-col items-center">
              <div id="reader" className="w-full overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-900 min-h-[300px]"></div>
              
              {/* Tombol Toggle Kamera */}
              <button disabled={isCameraStarting} onClick={toggleCamera} className="mt-6 flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3 rounded-full font-semibold transition border border-slate-300">
                <RefreshCcw className={`w-5 h-5 ${isCameraStarting ? 'animate-spin' : ''}`} />
                {cameraMode === 'environment' ? 'Pakai Kamera Depan' : 'Pakai Kamera Belakang'}
              </button>

              <div className="mt-4 text-slate-500 text-sm text-center">
                Arahkan kamera ke QR Kiosk.<br/>
                <span className="text-rose-500 text-xs">(Aplikasi tidak memiliki tombol Keluar)</span>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center text-center py-6">
              {message.includes('BERHASIL') ? (
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4"><CheckCircle2 className="w-10 h-10" /></div>
              ) : (
                <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4"><AlertCircle className="w-10 h-10" /></div>
              )}
              <h2 className={`text-xl font-bold mb-2 ${message.includes('BERHASIL') ? 'text-green-600' : 'text-rose-600'}`}>
                {message.includes('BERHASIL') ? message : 'ABSENSI GAGAL'}
              </h2>
              {!message.includes('BERHASIL') && <p className="text-slate-600 text-sm">{message.replace('GAGAL: ', '')}</p>}
              
              <button onClick={() => { setStep(2); setMessage(''); }} className="mt-8 px-6 py-2 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200">
                Kembali ke Scanner
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}