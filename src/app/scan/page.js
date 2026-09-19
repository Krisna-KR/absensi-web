'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Html5Qrcode } from 'html5-qrcode';
import { LayoutGrid, Clock, Bell, RefreshCcw, CheckCircle2, AlertCircle, Camera, Lock } from 'lucide-react';

export default function MobileScannerPage() {
  const [step, setStep] = useState(1); 
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
    if (!currentDeviceId) { currentDeviceId = crypto.randomUUID(); localStorage.setItem('device_id', currentDeviceId); }
    if (data.device_id && data.device_id !== currentDeviceId) { setMessage('Akses Ditolak: Terkunci di perangkat lain.'); setLoading(false); return; }
    if (!data.device_id) { await supabase.from('karyawan').update({ device_id: currentDeviceId }).eq('id', data.id); data.device_id = currentDeviceId; }

    localStorage.setItem('karyawan_data', JSON.stringify(data));
    setKaryawan(data); await fetchDataHariIni(data.id); setStep(2); setLoading(false);
  };

  const startCamera = async (mode) => {
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop(); html5QrCodeRef.current.clear();
      }
      const html5QrCode = new Html5Qrcode("reader");
      html5QrCodeRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: mode }, { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => { await html5QrCode.stop().catch(() => {}); await prosesAbsensi(decodedText); },
        () => {} 
      );
    } catch (err) { setMessage('Kamera error: ' + err.message); }
  };

  const openScanner = () => { setStep(3); setTimeout(() => startCamera(cameraMode), 300); };
  const toggleCamera = () => { const newMode = cameraMode === 'environment' ? 'user' : 'environment'; setCameraMode(newMode); startCamera(newMode); };
  const batalScanner = async () => { if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) { await html5QrCodeRef.current.stop().catch(() => {}); html5QrCodeRef.current.clear(); } setStep(2); };

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
        if (error) throw error; setMessage('BERHASIL ABSEN MASUK');
      } else {
        const { data: dataMasuk } = await supabase.from('absensi').select('*').eq('id_karyawan', karyawan.id).gte('waktu_masuk', `${todayStr}T00:00:00+07:00`).order('waktu_masuk', { ascending: false }).limit(1);
        if (!dataMasuk || dataMasuk.length === 0) throw new Error('Belum absen MASUK hari ini.');
        if (dataMasuk[0].waktu_keluar) throw new Error('Sudah absen KELUAR hari ini.');
        const { error } = await supabase.from('absensi').update({ waktu_keluar: new Date().toISOString() }).eq('id', dataMasuk[0].id);
        if (error) throw error; setMessage('BERHASIL ABSEN KELUAR');
      }
      fetchDataHariIni(karyawan.id); 
    } catch (error) { setMessage(`GAGAL: ${error.message}`); }
    setLoading(false);
  };

  const formatJam = (isoStr) => {
    if (!isoStr) return '-';
    return new Date(isoStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const handleLogout = () => { alert('Perangkat telah dikunci secara permanen pada sesi ini.'); };

  const isSelesai = todayAbsen?.waktu_masuk && todayAbsen?.waktu_keluar;
  const isBisaMasuk = !todayAbsen?.waktu_masuk;

  return (
    // PERBAIKAN BACKGROUND: Menggunakan gradien radial elegan alih-alih warna solid mati
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-[#0B1120] to-black flex justify-center text-slate-100 font-sans">
      <div className="w-full max-w-md flex flex-col relative shadow-2xl overflow-x-hidden">
        
        {/* Header App - Glassmorphism */}
        <div className="flex justify-between items-center p-5 border-b border-white/10 bg-white/5 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-teal-700 flex items-center justify-center text-white font-extrabold shadow-lg shadow-teal-900/50">KR</div>
            <h1 className="font-bold text-lg text-white tracking-wide">Absensi Karyawan</h1>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-white/10 text-teal-300 font-bold text-xs rounded-lg shadow border border-white/10 flex items-center gap-1 backdrop-blur-sm">
              <LayoutGrid className="w-3 h-3" /> APP
            </button>
            <button onClick={handleLogout} className="px-3 py-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-xs rounded-lg shadow backdrop-blur-sm">Logout</button>
          </div>
        </div>

        {step === 1 && (
          <div className="flex-1 flex flex-col justify-center p-6">
            <div className="w-20 h-20 bg-white/5 backdrop-blur-xl rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(20,184,166,0.15)] border border-white/10">
               <Lock className="w-10 h-10 text-teal-400" />
            </div>
            <h2 className="text-2xl font-bold text-center mb-8 text-white">Login Akses</h2>
            <form onSubmit={handleLogin} className="space-y-4">
              <div><input required type="text" placeholder="Username" value={form.username} onChange={e => setForm({...form, username: e.target.value.toLowerCase()})} className="w-full px-4 py-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 shadow-inner"/></div>
              <div><input required type="password" placeholder="Password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full px-4 py-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 shadow-inner"/></div>
              {message && <div className="p-4 bg-rose-500/20 text-rose-300 text-sm rounded-xl border border-rose-500/30 flex gap-2 backdrop-blur-md"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/> <p>{message}</p></div>}
              <button disabled={loading} type="submit" className="w-full bg-gradient-to-r from-teal-400 to-teal-600 text-white font-extrabold py-4 rounded-2xl hover:opacity-90 transition mt-6 shadow-[0_10px_30px_rgba(20,184,166,0.4)]">{loading ? 'Memvalidasi...' : 'Masuk'}</button>
            </form>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 flex flex-col items-center pt-8 px-6 pb-24 overflow-y-auto">
             <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">Absensi</h2>
             <p className="text-slate-400 text-sm mt-1 mb-8">Hi, {karyawan?.nama_lengkap}.</p>

             {/* PERBAIKAN CARD: Glassmorphism transparan dengan pantulan pinggiran */}
             <div className="w-full bg-white/10 backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] mb-12">
               <div className="text-center mb-6">
                 <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Status Hari Ini</p>
                 <p className={`font-black text-xl tracking-wide ${todayAbsen?.status === 'Hadir' ? 'text-teal-400 drop-shadow-[0_0_10px_rgba(20,184,166,0.5)]' : todayAbsen?.status === 'Late' ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'text-slate-300'}`}>
                   {todayAbsen?.status || 'Belum Absen'}
                 </p>
               </div>
               <div className="flex justify-between text-center divide-x divide-white/10">
                 <div className="flex-1">
                    <p className="text-slate-400 text-xs font-semibold mb-1">Jam Masuk</p>
                    <p className="text-lg font-bold text-white">{formatJam(todayAbsen?.waktu_masuk)}</p>
                 </div>
                 <div className="flex-1">
                    <p className="text-slate-400 text-xs font-semibold mb-1">Jam Pulang</p>
                    <p className="text-lg font-bold text-white">{formatJam(todayAbsen?.waktu_keluar)}</p>
                 </div>
               </div>
             </div>

             {/* PERBAIKAN TOMBOL: Glassmorphism Orbs dengan 3D Inner Shadow & Glow */}
             <div className="relative flex items-center justify-center mb-10">
               {/* Lapisan cincin luar blur */}
               <div className={`absolute w-[240px] h-[240px] rounded-full border ${isSelesai ? 'border-slate-500/10' : isBisaMasuk ? 'border-teal-400/20' : 'border-rose-400/20'} bg-white/5 backdrop-blur-sm`}></div>
               {/* Lapisan cincin dalam blur */}
               <div className={`absolute w-[190px] h-[190px] rounded-full border ${isSelesai ? 'border-slate-500/20' : isBisaMasuk ? 'border-teal-400/30' : 'border-rose-400/30'} bg-white/10 backdrop-blur-md shadow-inner`}></div>
               
               <button 
                  onClick={openScanner}
                  disabled={isSelesai}
                  className={`relative z-10 w-[140px] h-[140px] rounded-full flex items-center justify-center font-black text-xl transition-all duration-300 active:scale-90 ${
                    isSelesai 
                    ? 'bg-slate-800/80 border border-slate-600/50 text-slate-500 shadow-none' 
                    : isBisaMasuk 
                      ? 'bg-gradient-to-br from-teal-400 to-teal-700 text-white border border-teal-300/50 shadow-[0_10px_40px_-10px_rgba(20,184,166,0.8),inset_0_4px_10px_rgba(255,255,255,0.4)]'
                      : 'bg-gradient-to-br from-rose-400 to-rose-700 text-white border border-rose-300/50 shadow-[0_10px_40px_-10px_rgba(225,29,72,0.8),inset_0_4px_10px_rgba(255,255,255,0.4)]'
                  }`}
                >
                  <span className="drop-shadow-md tracking-wider">{isSelesai ? 'Selesai' : isBisaMasuk ? 'Check In' : 'Check Out'}</span>
                </button>
             </div>
             
             {/* Rekap Bawah - Diubah selaras dengan tema gelap Glassmorphism */}
             <div className="w-full bg-white/5 backdrop-blur-xl text-white rounded-3xl p-5 mt-auto border border-white/10 shadow-lg">
                <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                   <p className="font-bold text-sm tracking-wide">Rekap Periode</p>
                   <p className="text-[10px] font-bold bg-white/10 px-3 py-1.5 rounded-full border border-white/10">Bulan Ini</p>
                </div>
                <div className="grid grid-cols-4 gap-3 text-center text-xs font-bold">
                   <div className="bg-white/5 p-3 rounded-2xl border border-white/5"><p className="text-[10px] text-slate-400 mb-1">Masuk</p><p className="text-base text-teal-400">0</p></div>
                   <div className="bg-white/5 p-3 rounded-2xl border border-white/5"><p className="text-[10px] text-slate-400 mb-1">Izin</p><p className="text-base">0</p></div>
                   <div className="bg-white/5 p-3 rounded-2xl border border-white/5"><p className="text-[10px] text-slate-400 mb-1">Telat</p><p className="text-amber-400 text-base">0</p></div>
                   <div className="bg-white/5 p-3 rounded-2xl border border-white/5"><p className="text-[10px] text-slate-400 mb-1">Bolos</p><p className="text-rose-400 text-base">0</p></div>
                </div>
             </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex-1 flex flex-col bg-black">
             <div className="p-5 flex justify-between items-center bg-slate-900 border-b border-slate-800 z-10">
                <p className="text-white font-bold tracking-wide">Pindai QR Kiosk</p>
                <button onClick={batalScanner} className="px-5 py-2 bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold rounded-lg backdrop-blur-sm">Batal</button>
             </div>
             <div className="flex-1 relative flex flex-col items-center justify-center bg-[#050505]">
                <div id="reader" className="w-full max-w-sm overflow-hidden bg-black rounded-3xl border border-slate-800 shadow-2xl"></div>
                <button onClick={toggleCamera} className="mt-10 flex items-center gap-2 bg-white/10 text-white px-8 py-4 rounded-full font-bold border border-white/20 active:bg-white/20 backdrop-blur-md transition-all">
                  <RefreshCcw className="w-5 h-5" /> Putar Kamera
                </button>
             </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            {message.includes('BERHASIL') ? <div className="w-28 h-28 bg-teal-500/20 text-teal-400 rounded-full flex items-center justify-center mb-8 border border-teal-500/30 shadow-[0_0_50px_rgba(20,184,166,0.3)] backdrop-blur-md"><CheckCircle2 className="w-14 h-14 drop-shadow-md" /></div> : <div className="w-28 h-28 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mb-8 border border-rose-500/30 shadow-[0_0_50px_rgba(225,29,72,0.3)] backdrop-blur-md"><AlertCircle className="w-14 h-14 drop-shadow-md" /></div>}
            <h2 className={`text-3xl font-black mb-3 tracking-wide ${message.includes('BERHASIL') ? 'text-teal-400 drop-shadow-[0_0_10px_rgba(20,184,166,0.5)]' : 'text-rose-400 drop-shadow-[0_0_10px_rgba(225,29,72,0.5)]'}`}>{message.includes('BERHASIL') ? message : 'GAGAL'}</h2>
            {!message.includes('BERHASIL') && <p className="text-slate-400 text-center font-medium">{message.replace('GAGAL: ', '')}</p>}
            <button onClick={() => { setStep(2); setMessage(''); }} className="mt-12 px-10 py-4 bg-white/10 text-white font-extrabold rounded-full border border-white/20 hover:bg-white/20 backdrop-blur-md transition-all">Kembali ke Dasbor</button>
          </div>
        )}

        {/* BOTTOM NAV - Floating Glass */}
        {step === 2 && (
          <div className="absolute bottom-6 left-6 right-6 bg-white/10 backdrop-blur-xl text-slate-400 flex justify-around items-center py-4 rounded-3xl border border-white/20 shadow-[0_20px_40px_rgba(0,0,0,0.5)] z-20">
            <button className="flex flex-col items-center text-teal-400 drop-shadow-[0_0_8px_rgba(20,184,166,0.8)] transition-all hover:-translate-y-1"><LayoutGrid className="w-6 h-6 mb-1.5" /><span className="text-[10px] font-bold tracking-widest">HOME</span></button>
            <button className="flex flex-col items-center transition-all hover:-translate-y-1 hover:text-white"><Clock className="w-6 h-6 mb-1.5" /><span className="text-[10px] font-bold tracking-widest">HISTORY</span></button>
            <button className="flex flex-col items-center transition-all hover:-translate-y-1 hover:text-white"><Bell className="w-6 h-6 mb-1.5" /><span className="text-[10px] font-bold tracking-widest">NOTIF</span></button>
          </div>
        )}
      </div>
    </div>
  );
}