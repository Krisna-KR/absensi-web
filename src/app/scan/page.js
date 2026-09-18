'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Html5Qrcode } from 'html5-qrcode';
import { LogOut, LayoutGrid, Clock, Bell, RefreshCcw, CheckCircle2, AlertCircle, Camera, Lock } from 'lucide-react';

export default function MobileScannerPage() {
  const [step, setStep] = useState(1); // 1: Login, 2: Dashboard, 3: Kamera, 4: Status
  const [form, setForm] = useState({ username: '', password: '' });
  const [karyawan, setKaryawan] = useState(null);
  const [todayAbsen, setTodayAbsen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  const html5QrCodeRef = useRef(null);
  const [cameraMode, setCameraMode] = useState('environment');

  useEffect(() => {
    const savedKaryawan = localStorage.getItem('karyawan_data');
    if (savedKaryawan) {
      const parsed = JSON.parse(savedKaryawan);
      setKaryawan(parsed);
      fetchDataHariIni(parsed.id);
      setStep(2);
    }
  }, []);

  const fetchDataHariIni = async (userId) => {
    const localDate = new Date(new Date().getTime() + (7 * 60 * 60000));
    const todayStr = localDate.toISOString().split('T')[0];

    const { data } = await supabase.from('absensi').select('*').eq('id_karyawan', userId).gte('waktu_masuk', `${todayStr}T00:00:00+07:00`).order('waktu_masuk', { ascending: false }).limit(1).single();
    if (data) setTodayAbsen(data);
    else setTodayAbsen(null);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setMessage('');

    const { data, error } = await supabase.from('karyawan').select('*').eq('username', form.username).eq('password', form.password).single();
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
    setKaryawan(data); 
    await fetchDataHariIni(data.id);
    setStep(2); 
    setLoading(false);
  };

  const startCamera = async (mode) => {
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
  };

  const openScanner = () => {
    setStep(3);
    setTimeout(() => startCamera(cameraMode), 300); // Beri jeda DOM render
  };

  const toggleCamera = () => {
    const newMode = cameraMode === 'environment' ? 'user' : 'environment';
    setCameraMode(newMode);
    startCamera(newMode);
  };

  const batalScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      await html5QrCodeRef.current.stop().catch(() => {});
      html5QrCodeRef.current.clear();
    }
    setStep(2);
  };

  const prosesAbsensi = async (qrData) => {
    setLoading(true); setStep(4);
    try {
      if (!qrData.startsWith('ABSENSI-KR-')) throw new Error('Kode QR tidak valid.');
      if ((Date.now() - parseInt(qrData.split('-')[2])) / 1000 > 60) throw new Error('Kode QR kedaluwarsa.');

      const currentHour = new Date().getHours();
      let jenisAbsen = '';
      if (currentHour >= 7 && currentHour <= 12) jenisAbsen = 'MASUK';
      else if (currentHour >= 12 && currentHour <= 23) jenisAbsen = 'KELUAR';
      else throw new Error('Di luar jam operasional (07:00 - 23:59).');

      const localDate = new Date(new Date().getTime() + (7 * 60 * 60000));
      const todayStr = localDate.toISOString().split('T')[0];

      if (jenisAbsen === 'MASUK') {
        const { data: cekMasuk } = await supabase.from('absensi').select('id').eq('id_karyawan', karyawan.id).gte('waktu_masuk', `${todayStr}T00:00:00+07:00`).single();
        if (cekMasuk) throw new Error('Sudah absen MASUK hari ini.');
        
        const { error } = await supabase.from('absensi').insert([{ id_karyawan: karyawan.id, waktu_masuk: new Date().toISOString(), status: currentHour > 8 ? 'Late' : 'Hadir' }]);
        if (error) throw error;
        setMessage('BERHASIL ABSEN MASUK');
      } else {
        const { data: dataMasuk } = await supabase.from('absensi').select('*').eq('id_karyawan', karyawan.id).gte('waktu_masuk', `${todayStr}T00:00:00+07:00`).order('waktu_masuk', { ascending: false }).limit(1);
        if (!dataMasuk || dataMasuk.length === 0) throw new Error('Belum absen MASUK hari ini.');
        if (dataMasuk[0].waktu_keluar) throw new Error('Sudah absen KELUAR hari ini.');
        
        const { error } = await supabase.from('absensi').update({ waktu_keluar: new Date().toISOString() }).eq('id', dataMasuk[0].id);
        if (error) throw error;
        setMessage('BERHASIL ABSEN KELUAR');
      }
      fetchDataHariIni(karyawan.id); // Refresh data
    } catch (error) { setMessage(`GAGAL: ${error.message}`); }
    setLoading(false);
  };

  const formatJam = (isoStr) => {
    if (!isoStr) return '-';
    return new Date(isoStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const handleLogout = () => {
      // Tombol palsu/kosmetik untuk UI, secara sistem user tidak bisa keluar agar device terkunci
      alert('Perangkat telah dikunci secara permanen pada sesi ini.');
  };

  const isSelesai = todayAbsen?.waktu_masuk && todayAbsen?.waktu_keluar;
  const isBisaMasuk = !todayAbsen?.waktu_masuk;

  return (
    <div className="min-h-screen bg-slate-900 flex justify-center text-slate-100 font-sans">
      <div className="w-full max-w-md bg-slate-950 flex flex-col relative shadow-2xl overflow-x-hidden">
        
        {/* Header App */}
        <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-950 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-teal-500 font-bold">KR</div>
            <h1 className="font-bold text-lg text-slate-200">Absensi Karyawan</h1>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-teal-800/40 text-teal-400 font-bold text-xs rounded shadow flex items-center gap-1 border border-teal-800/50">
              <LayoutGrid className="w-3 h-3" /> APP
            </button>
            <button onClick={handleLogout} className="px-3 py-1.5 bg-rose-600 text-white font-bold text-xs rounded shadow">Logout</button>
          </div>
        </div>

        {/* FASE 1: LOGIN */}
        {step === 1 && (
          <div className="flex-1 flex flex-col justify-center p-6">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg border border-slate-700">
               <Lock className="w-8 h-8 text-teal-500" />
            </div>
            <h2 className="text-2xl font-bold text-center mb-8">Login Akses</h2>
            <form onSubmit={handleLogin} className="space-y-4">
              <div><input required type="text" placeholder="Username" value={form.username} onChange={e => setForm({...form, username: e.target.value.toLowerCase()})} className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"/></div>
              <div><input required type="password" placeholder="Password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"/></div>
              {message && <div className="p-3 bg-rose-950/50 text-rose-400 text-sm rounded-lg border border-rose-900 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/> <p>{message}</p></div>}
              <button disabled={loading} type="submit" className="w-full bg-teal-600 text-white font-bold py-3.5 rounded-xl hover:bg-teal-700 transition mt-4 shadow-lg shadow-teal-900/50">{loading ? 'Memvalidasi...' : 'Masuk'}</button>
            </form>
          </div>
        )}

        {/* FASE 2: DASHBOARD */}
        {step === 2 && (
          <div className="flex-1 flex flex-col items-center pt-8 px-4 pb-24 overflow-y-auto">
             <h2 className="text-2xl font-extrabold text-white">Absensi</h2>
             <p className="text-slate-400 text-sm mt-1 mb-6">Hi, {karyawan?.nama_lengkap}.</p>

             <div className="w-full bg-slate-800/80 backdrop-blur-md rounded-2xl p-6 border border-slate-700/50 shadow-xl mb-12">
               <div className="text-center mb-6">
                 <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Status Hari Ini</p>
                 <p className={`font-bold text-lg ${todayAbsen?.status === 'Hadir' ? 'text-teal-400' : todayAbsen?.status === 'Late' ? 'text-amber-400' : 'text-slate-300'}`}>
                   {todayAbsen?.status || 'Belum Absen'}
                 </p>
               </div>
               <div className="flex justify-between text-center divide-x divide-slate-700">
                 <div className="flex-1">
                    <p className="text-slate-400 text-sm font-semibold mb-1">Jam Masuk</p>
                    <p className="text-xl font-bold text-white">{formatJam(todayAbsen?.waktu_masuk)}</p>
                 </div>
                 <div className="flex-1">
                    <p className="text-slate-400 text-sm font-semibold mb-1">Jam Pulang</p>
                    <p className="text-xl font-bold text-white">{formatJam(todayAbsen?.waktu_keluar)}</p>
                 </div>
               </div>
             </div>

             {/* Tombol Lingkaran Besar */}
             <div className="relative w-[220px] h-[220px] rounded-full border-4 border-slate-700 flex items-center justify-center bg-slate-900/50 mb-10 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
               <div className="w-[180px] h-[180px] rounded-full border-[6px] border-slate-600 flex items-center justify-center bg-slate-800">
                  <button 
                    onClick={openScanner}
                    disabled={isSelesai}
                    className={`w-[140px] h-[140px] rounded-full flex items-center justify-center font-bold text-lg shadow-2xl transition-all active:scale-95 border-2 ${
                      isSelesai 
                      ? 'bg-slate-700 border-slate-600 text-slate-500' 
                      : isBisaMasuk 
                        ? 'bg-teal-600 border-teal-500 hover:bg-teal-500 text-white shadow-[0_0_30px_rgba(13,148,136,0.5)]'
                        : 'bg-rose-600 border-rose-500 hover:bg-rose-500 text-white shadow-[0_0_30px_rgba(225,29,72,0.5)]'
                    }`}
                  >
                    {isSelesai ? 'Selesai' : isBisaMasuk ? 'Check In' : 'Check Out'}
                  </button>
               </div>
             </div>
             
             {/* Info Rekap Bawah */}
             <div className="w-full bg-slate-200 text-slate-900 rounded-2xl p-4 mt-auto">
                <div className="flex justify-between items-center mb-4 border-b border-slate-300 pb-2">
                   <p className="font-bold">Rekap Periode</p>
                   <p className="text-xs font-semibold bg-white px-2 py-1 rounded shadow-sm border border-slate-300">Bulan Ini</p>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold">
                   <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200"><p className="text-[10px] text-slate-500 mb-1">Masuk</p><p className="text-sm">0</p></div>
                   <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200"><p className="text-[10px] text-slate-500 mb-1">Izin</p><p className="text-sm">0</p></div>
                   <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200"><p className="text-[10px] text-slate-500 mb-1">Telat</p><p className="text-rose-600 text-sm">0</p></div>
                   <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200"><p className="text-[10px] text-slate-500 mb-1">Bolos</p><p className="text-sm">0</p></div>
                </div>
             </div>
          </div>
        )}

        {/* FASE 3: SCANNER */}
        {step === 3 && (
          <div className="flex-1 flex flex-col bg-black">
             <div className="p-4 flex justify-between items-center bg-slate-900 z-10">
                <p className="text-white font-bold">Pindai QR Absensi</p>
                <button onClick={batalScanner} className="px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded">Batal</button>
             </div>
             <div className="flex-1 relative flex flex-col items-center justify-center">
                <div id="reader" className="w-full max-w-sm overflow-hidden bg-black"></div>
                <button onClick={toggleCamera} className="mt-8 flex items-center gap-2 bg-slate-800 text-white px-6 py-3 rounded-full font-bold border border-slate-600 active:bg-slate-700">
                  <RefreshCcw className="w-5 h-5" /> Putar Kamera
                </button>
             </div>
          </div>
        )}

        {/* FASE 4: STATUS ABSENSI */}
        {step === 4 && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-900">
            {message.includes('BERHASIL') ? <div className="w-24 h-24 bg-teal-500/20 text-teal-400 rounded-full flex items-center justify-center mb-6 border-4 border-teal-500/30"><CheckCircle2 className="w-12 h-12" /></div> : <div className="w-24 h-24 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mb-6 border-4 border-rose-500/30"><AlertCircle className="w-12 h-12" /></div>}
            <h2 className={`text-2xl font-bold mb-3 ${message.includes('BERHASIL') ? 'text-teal-400' : 'text-rose-400'}`}>{message.includes('BERHASIL') ? message : 'GAGAL'}</h2>
            {!message.includes('BERHASIL') && <p className="text-slate-400 text-center">{message.replace('GAGAL: ', '')}</p>}
            <button onClick={() => { setStep(2); setMessage(''); }} className="mt-10 px-8 py-3 bg-slate-800 text-white font-bold rounded-full border border-slate-700 hover:bg-slate-700">Kembali ke Dasbor</button>
          </div>
        )}

        {/* BOTTOM NAV */}
        {step === 2 && (
          <div className="absolute bottom-0 w-full bg-white text-slate-500 flex justify-around items-center py-3 border-t border-slate-200 z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
            <button className="flex flex-col items-center text-teal-600"><LayoutGrid className="w-5 h-5 mb-1" /><span className="text-[10px] font-bold">HOME</span></button>
            <button className="flex flex-col items-center hover:text-teal-600"><Clock className="w-5 h-5 mb-1" /><span className="text-[10px] font-bold">HISTORY</span></button>
            <button className="flex flex-col items-center hover:text-teal-600"><Bell className="w-5 h-5 mb-1" /><span className="text-[10px] font-bold">NOTIF</span></button>
          </div>
        )}
      </div>
    </div>
  );
}