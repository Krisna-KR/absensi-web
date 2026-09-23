'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Html5Qrcode } from 'html5-qrcode';
import { LayoutGrid, Clock, Bell, RefreshCcw, CheckCircle2, AlertCircle, Lock, UserPlus } from 'lucide-react';

export default function MobileScannerPage() {
  // Step 0: Register, Step 1: Login, Step 2: Dashboard, Step 3: Kamera, Step 4: Status
  const [step, setStep] = useState(1); 
  
  const [form, setForm] = useState({ username: '', password: '' });
  const [karyawan, setKaryawan] = useState(null);
  const [todayAbsen, setTodayAbsen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // State Registrasi
  const [regType, setRegType] = useState('MT'); // 'MT' atau 'BO'
  const [regForm, setRegForm] = useState({ nama_lengkap: '', id_departemen: '' });
  const [departemenList, setDepartemenList] = useState([]);

  const html5QrCodeRef = useRef(null);
  const [cameraMode, setCameraMode] = useState('environment');
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const checkSesi = async () => {
      const savedKaryawan = localStorage.getItem('karyawan_data');
      if (savedKaryawan) {
        try {
          const parsed = JSON.parse(savedKaryawan);
          const { data, error } = await supabase.from('karyawan').select('id, is_approved').eq('id', parsed.id).single();
          if (error || !data || !data.is_approved) {
            localStorage.clear(); sessionStorage.clear(); setStep(1); return;
          }
          setKaryawan(parsed); fetchDataHariIni(parsed.id); setStep(2);
        } catch (e) { localStorage.clear(); setStep(1); }
      }
    };
    checkSesi();

    // Fetch Departemen untuk Dropdown Register
    const fetchDept = async () => {
      const { data: deptData } = await supabase.from('master_departemen').select('*');
      const { data: karData } = await supabase.from('karyawan').select('id, nama_lengkap');
      if (deptData && karData) {
         const mapped = deptData.map(d => {
            const leader = karData.find(k => k.id === d.id_leader);
            return { ...d, leader_name: leader ? leader.nama_lengkap : '' };
         });
         setDepartemenList(mapped);
      }
    };
    fetchDept();

    const handleBeforeInstallPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      alert('Fitur instalasi otomatis belum siap.\n\nAndroid: Tekan ikon titik 3 di pojok atas > "Add to Home screen"\niOS/iPhone: Tekan tombol Share (panah ke atas) > "Add to Home Screen"');
    }
  };

  const fetchDataHariIni = async (userId) => {
    const { data: cekUser } = await supabase.from('karyawan').select('device_id').eq('id', userId).single();
    const localDeviceId = localStorage.getItem('device_id');
    
    if (!cekUser?.device_id || cekUser.device_id !== localDeviceId) {
      alert('Sesi Berakhir: Perangkat Anda telah di-Unbind oleh Administrator.');
      localStorage.clear(); sessionStorage.clear(); setKaryawan(null); setStep(1); return;
    }

    const localDate = new Date(new Date().getTime() + (7 * 60 * 60000));
    const todayStr = localDate.toISOString().split('T')[0];
    const { data } = await supabase.from('absensi').select('*').eq('id_karyawan', userId).gte('waktu_masuk', `${todayStr}T00:00:00+07:00`).order('waktu_masuk', { ascending: false }).limit(1).single();
    if (data) setTodayAbsen(data); else setTodayAbsen(null);
  };

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setMessage('');
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

  // =================== LOGIKA PENDAFTARAN (REGISTER) ===================
  const handleRegister = async (e) => {
    e.preventDefault(); setLoading(true); setMessage('');

    if (!regForm.nama_lengkap || !regForm.id_departemen) {
       setMessage('Nama Lengkap dan Divisi wajib diisi.'); setLoading(false); return;
    }

    // Generator NIP Acak & Username (mt/bo + nama depan/tengah bersih + 3 angka acak)
    const randomNip = `REG${Date.now().toString().slice(-6)}`;
    const randomStr = Math.floor(100 + Math.random() * 900);
    const cleanName = regForm.nama_lengkap.toLowerCase().replace(/[^a-z]/g, '').substring(0, 6);
    const generatedUsername = (regType === 'MT' ? 'mt' : 'bo') + cleanName + randomStr;

    const payload = {
      nip: randomNip,
      nama_lengkap: regForm.nama_lengkap,
      username: generatedUsername,
      password: 'admin123',
      id_departemen: regForm.id_departemen,
      role: 'Karyawan',
      is_approved: true // Sesuai instruksi Anda agar bisa langsung login dan absen
    };

    const { error } = await supabase.from('karyawan').insert([payload]);
    
    if (error) { setMessage('Gagal mendaftar: ' + error.message); } 
    else {
      alert(`PENDAFTARAN BERHASIL!\n\nUsername Anda: ${generatedUsername}\nPassword Default: admin123\n\nHarap simpan username ini untuk Login.`);
      // Langsung isikan ke form login agar karyawan mudah masuk
      setForm({ username: generatedUsername, password: 'admin123' });
      setRegForm({ nama_lengkap: '', id_departemen: '' });
      setStep(1); // Lempar kembali ke halaman Login
    }
    setLoading(false);
  };

  const startCamera = async (mode) => {
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) { await html5QrCodeRef.current.stop(); html5QrCodeRef.current.clear(); }
      const html5QrCode = new Html5Qrcode("reader");
      html5QrCodeRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: mode }, { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => { await html5QrCode.stop().catch(() => {}); await prosesAbsensi(decodedText); }, () => {} 
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

      const now = new Date();
      const localTime = new Date(now.getTime() + (7 * 60 * 60000));
      const currentHour = localTime.getUTCHours(); 

      let jenisAbsen = '';
      if (currentHour >= 7 && currentHour < 12) jenisAbsen = 'MASUK';
      else if (currentHour >= 12 && currentHour <= 23) jenisAbsen = 'KELUAR';
      else throw new Error(`Di luar jam operasional (Terdeteksi jam ${currentHour}:00 WIB).`);

      const todayStr = localTime.toISOString().split('T')[0];

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
    <div className="min-h-screen bg-slate-50 flex justify-center text-slate-900 font-sans">
      <div className="w-full max-w-md flex flex-col relative bg-slate-50 shadow-2xl overflow-x-hidden">
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-5 bg-white border-b border-slate-200 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-extrabold shadow-sm">KR</div>
            <h1 className="font-bold text-lg text-slate-900 tracking-wide">Absensi Karyawan</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={handleInstallApp} className="px-3 py-1.5 bg-blue-50 text-blue-700 font-bold text-xs rounded-lg shadow-sm border border-blue-100 flex items-center gap-1 active:bg-blue-100 transition-colors">
              <LayoutGrid className="w-3 h-3" /> APP
            </button>
            {step !== 1 && step !== 0 && (
              <button onClick={handleLogout} className="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 font-bold text-xs rounded-lg shadow-sm">Logout</button>
            )}
          </div>
        </div>

        {/* FASE 0: REGISTRASI KARYAWAN BARU */}
        {step === 0 && (
          <div className="flex-1 flex flex-col justify-center p-6">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-blue-100">
               <UserPlus className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-center mb-2 text-slate-900">Daftar Absensi</h2>
            <p className="text-center text-sm text-slate-500 mb-6">Pendaftaran akun pengguna baru.</p>
            
            <div className="flex bg-slate-100 p-1 rounded-xl mb-6 shadow-inner">
               <button onClick={() => setRegType('MT')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${regType === 'MT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Daftar MT</button>
               <button onClick={() => setRegType('BO')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${regType === 'BO' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Daftar BO / Manager</button>
            </div>

            <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-700 mb-6 text-center">
               Pendaftaran <b>{regType}</b> hanya memerlukan Nama Lengkap dan Pilihan Divisi/Team. Username dan Sandi otomatis dibuatkan.
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                 <label className="text-sm font-bold text-slate-700 mb-1 block">Nama Lengkap</label>
                 <input required type="text" placeholder="Masukkan nama Anda..." value={regForm.nama_lengkap} onChange={e => setRegForm({...regForm, nama_lengkap: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"/>
              </div>
              <div>
                 <label className="text-sm font-bold text-slate-700 mb-1 block">Divisi Team</label>
                 <select required value={regForm.id_departemen} onChange={e => setRegForm({...regForm, id_departemen: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm">
                    <option value="">Pilih Divisi Team</option>
                    {departemenList.map(d => (
                       <option key={d.id} value={d.id}>{d.nama_departemen} {d.leader_name ? `(Team ${d.leader_name})` : ''}</option>
                    ))}
                 </select>
              </div>
              {message && <div className="p-3 bg-rose-50 text-rose-600 text-xs font-bold rounded-lg border border-rose-200">{message}</div>}
              <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white font-extrabold py-3.5 rounded-xl hover:bg-blue-700 transition mt-6 shadow-md">{loading ? 'Memproses...' : 'Daftar Akun Baru'}</button>
            </form>

            <button onClick={() => {setStep(1); setMessage('');}} className="w-full mt-4 py-3 text-sm font-bold text-slate-500 hover:text-slate-700">Sudah punya akun? Login di sini</button>
          </div>
        )}

        {/* FASE 1: LOGIN */}
        {step === 1 && (
          <div className="flex-1 flex flex-col justify-center p-6">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-200">
               <Lock className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-center mb-8 text-slate-900">Login Akses</h2>
            <form onSubmit={handleLogin} className="space-y-4">
              <div><input required type="text" placeholder="Username" value={form.username} onChange={e => setForm({...form, username: e.target.value.toLowerCase()})} className="w-full px-4 py-4 bg-white border border-slate-300 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"/></div>
              <div><input required type="password" placeholder="Password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full px-4 py-4 bg-white border border-slate-300 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"/></div>
              {message && <div className="p-4 bg-rose-50 text-rose-600 text-sm rounded-xl border border-rose-200 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/> <p>{message}</p></div>}
              <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white font-extrabold py-4 rounded-2xl hover:bg-blue-700 transition mt-2 shadow-md">{loading ? 'Memvalidasi...' : 'Masuk'}</button>
            </form>
            
            {/* TOMBOL MENUJU PENDAFTARAN */}
            <div className="mt-8 text-center border-t border-slate-200 pt-6">
               <p className="text-sm text-slate-500 mb-3">Karyawan baru?</p>
               <button onClick={() => {setStep(0); setMessage('');}} className="w-full py-3 border-2 border-blue-600 text-blue-600 font-extrabold rounded-xl hover:bg-blue-50 transition">Daftar Akun Karyawan</button>
            </div>
          </div>
        )}

        {/* FASE 2: DASHBOARD */}
        {step === 2 && (
          <div className="flex-1 flex flex-col items-center pt-8 px-6 pb-24 overflow-y-auto">
             <h2 className="text-3xl font-black text-slate-900">Absensi</h2>
             <p className="text-slate-500 text-sm mt-1 mb-8">Hi, {karyawan?.nama_lengkap}.</p>

             <div className="w-full bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-12">
               <div className="text-center mb-6">
                 <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Status Hari Ini</p>
                 <p className={`font-black text-xl tracking-wide ${todayAbsen?.status === 'Hadir' ? 'text-blue-600' : todayAbsen?.status === 'Late' ? 'text-amber-500' : 'text-slate-400'}`}>
                   {todayAbsen?.status || 'Belum Absen'}
                 </p>
               </div>
               <div className="flex justify-between text-center divide-x divide-slate-100">
                 <div className="flex-1">
                    <p className="text-slate-400 text-xs font-semibold mb-1">Jam Masuk</p>
                    <p className="text-lg font-bold text-slate-900">{formatJam(todayAbsen?.waktu_masuk)}</p>
                 </div>
                 <div className="flex-1">
                    <p className="text-slate-400 text-xs font-semibold mb-1">Jam Pulang</p>
                    <p className="text-lg font-bold text-slate-900">{formatJam(todayAbsen?.waktu_keluar)}</p>
                 </div>
               </div>
             </div>

             <div className="relative flex items-center justify-center mb-10">
               <div className={`absolute w-[240px] h-[240px] rounded-full border ${isSelesai ? 'border-slate-200 bg-slate-100/50' : isBisaMasuk ? 'border-blue-100 bg-blue-50/50' : 'border-rose-100 bg-rose-50/50'}`}></div>
               <div className={`absolute w-[190px] h-[190px] rounded-full border ${isSelesai ? 'border-slate-300 bg-slate-50' : isBisaMasuk ? 'border-blue-200 bg-white' : 'border-rose-200 bg-white'} shadow-sm`}></div>
               
               <button 
                  onClick={openScanner}
                  disabled={isSelesai}
                  className={`relative z-10 w-[140px] h-[140px] rounded-full flex items-center justify-center font-black text-xl transition-all duration-300 active:scale-95 ${
                    isSelesai 
                    ? 'bg-slate-200 border-2 border-slate-300 text-slate-400 shadow-none' 
                    : isBisaMasuk 
                      ? 'bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-[0_10px_20px_rgba(37,99,235,0.3)]'
                      : 'bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-[0_10px_20px_rgba(225,29,72,0.3)]'
                  }`}
                >
                  <span className="tracking-wider">{isSelesai ? 'Selesai' : isBisaMasuk ? 'Check In' : 'Check Out'}</span>
                </button>
             </div>
             
             <div className="w-full bg-white text-slate-900 rounded-3xl p-5 mt-auto border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                   <p className="font-bold text-sm tracking-wide">Rekap Periode</p>
                   <p className="text-[10px] font-bold bg-slate-100 px-3 py-1.5 rounded-full text-slate-500">Bulan Ini</p>
                </div>
                <div className="grid grid-cols-4 gap-3 text-center text-xs font-bold">
                   <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p className="text-[10px] text-slate-400 mb-1">Masuk</p><p className="text-base text-blue-600">0</p></div>
                   <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p className="text-[10px] text-slate-400 mb-1">Izin</p><p className="text-base text-slate-700">0</p></div>
                   <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p className="text-[10px] text-slate-400 mb-1">Telat</p><p className="text-amber-500 text-base">0</p></div>
                   <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p className="text-[10px] text-slate-400 mb-1">Bolos</p><p className="text-rose-600 text-base">0</p></div>
                </div>
             </div>
          </div>
        )}

        {/* FASE 3: SCANNER */}
        {step === 3 && (
          <div className="flex-1 flex flex-col bg-black">
             <div className="p-5 flex justify-between items-center bg-slate-900 border-b border-slate-800 z-10">
                <p className="text-white font-bold tracking-wide">Pindai QR Kiosk</p>
                <button onClick={batalScanner} className="px-5 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg shadow-sm">Batal</button>
             </div>
             <div className="flex-1 relative flex flex-col items-center justify-center bg-[#050505]">
                <div id="reader" className="w-full max-w-sm overflow-hidden bg-black rounded-3xl border border-slate-800 shadow-2xl"></div>
                <button onClick={toggleCamera} className="mt-10 flex items-center gap-2 bg-slate-800 text-white px-8 py-4 rounded-full font-bold border border-slate-700 active:bg-slate-700 transition-colors">
                  <RefreshCcw className="w-5 h-5" /> Putar Kamera
                </button>
             </div>
          </div>
        )}

        {/* FASE 4: STATUS ABSENSI */}
        {step === 4 && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50">
            {message.includes('BERHASIL') ? <div className="w-28 h-28 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-8 border border-blue-100 shadow-sm"><CheckCircle2 className="w-14 h-14" /></div> : <div className="w-28 h-28 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-8 border border-rose-100 shadow-sm"><AlertCircle className="w-14 h-14" /></div>}
            <h2 className={`text-3xl font-black mb-3 tracking-wide ${message.includes('BERHASIL') ? 'text-blue-600' : 'text-rose-600'}`}>{message.includes('BERHASIL') ? message : 'GAGAL'}</h2>
            {!message.includes('BERHASIL') && <p className="text-slate-500 text-center font-medium">{message.replace('GAGAL: ', '')}</p>}
            <button onClick={() => { setStep(2); setMessage(''); }} className="mt-12 px-10 py-4 bg-slate-900 text-white font-extrabold rounded-full hover:bg-slate-800 transition-colors shadow-md">Kembali ke Dasbor</button>
          </div>
        )}

        {/* BOTTOM NAV */}
        {step === 2 && (
          <div className="absolute bottom-0 left-0 right-0 bg-white text-slate-400 flex justify-around items-center py-4 border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20">
            <button className="flex flex-col items-center text-blue-600 transition-all"><LayoutGrid className="w-6 h-6 mb-1.5" /><span className="text-[10px] font-bold tracking-widest">HOME</span></button>
            <button className="flex flex-col items-center transition-all hover:text-blue-600"><Clock className="w-6 h-6 mb-1.5" /><span className="text-[10px] font-bold tracking-widest">HISTORY</span></button>
            <button className="flex flex-col items-center transition-all hover:text-blue-600"><Bell className="w-6 h-6 mb-1.5" /><span className="text-[10px] font-bold tracking-widest">NOTIF</span></button>
          </div>
        )}
      </div>
    </div>
  );
}