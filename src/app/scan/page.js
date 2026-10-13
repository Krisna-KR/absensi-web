'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Html5Qrcode } from 'html5-qrcode';
import { LayoutGrid, Clock, Bell, RefreshCcw, CheckCircle2, AlertCircle, Lock, UserPlus } from 'lucide-react';
import { tanggalWIB, jamWIB, rentangPeriode, formatJamDetik } from '@/utils/waktu';
import { hitungStatus, STATUS_KEHADIRAN } from '@/utils/kehadiran';
import { pesanError } from '@/utils/pesanError';
import { ambilToken, simpanToken, hapusToken, kodeError } from '@/utils/sesi';
import { useFeedback } from '@/components/Feedback';
import Image from 'next/image';

// Pesan untuk kode error dari fungsi database (fn_login_karyawan, fn_absen, ...)
const PESAN_KODE = {
  LOGIN_SALAH: 'Username atau password tidak cocok. Periksa lagi, lalu coba masuk.',
  AKUN_NONAKTIF: 'Akun ini sudah dinonaktifkan. Hubungi admin kalau menurutmu ini keliru.',
  BELUM_DISETUJUI: 'Akunmu belum disetujui admin. Hubungi admin untuk mengaktifkannya.',
  HP_LAIN: 'Akun ini terkunci di HP lain. Minta admin melepas HP lama supaya kamu bisa masuk dari HP ini.',
  DEVICE_KOSONG: 'Browser ini menolak penyimpanan data. Matikan mode penyamaran, lalu coba lagi.',
  NAMA_KOSONG: 'Isi nama lengkap minimal 2 huruf.',
};
const HASIL_GAGAL = {
  QR_TIDAK_DIKENAL: ['QR tidak dikenali', 'QR ini bukan QR absensi. Pindai QR yang tampil di layar presensi kantor.'],
  QR_KEDALUWARSA: ['QR sudah kedaluwarsa', 'QR di layar presensi berganti tiap 10 detik. Pindai QR yang sedang tampil sekarang.'],
  BELUM_BUKA: ['Absen belum dibuka', 'Absen dibuka mulai jam 07.00 WIB.'],
  SUDAH_MASUK: ['Kamu sudah absen masuk', 'Absen masuk hari ini sudah tercatat. Absen pulang dibuka mulai jam 12.00 WIB.'],
  SUDAH_PULANG: ['Kamu sudah absen pulang', 'Absen pulang hari ini sudah tercatat. Sampai jumpa besok.'],
  SESI_HABIS: ['Sesi berakhir', 'Login lagi untuk melanjutkan absen.'],
};

// Pendaftaran mandiri dari HP. Ubah ke true untuk membuka lagi
// (fungsi fn_register_karyawan di database juga harus di-GRANT ulang).
const PENDAFTARAN_DIBUKA = false;

function ambilDeviceId() {
  try {
    let id = localStorage.getItem('device_id');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('device_id', id); }
    return id;
  } catch { return ''; }
}

export default function MobileScannerPage() {
  // Step 0: Register, Step 1: Login, Step 2: Dashboard, Step 3: Kamera, Step 4: Status
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({ username: '', password: '' });
  const [karyawan, setKaryawan] = useState(null);
  const [todayAbsen, setTodayAbsen] = useState(null);
  const [rekap, setRekap] = useState({ masuk: 0, izin: 0, telat: 0, bolos: 0 });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [hasilScan, setHasilScan] = useState(null); // { sukses, judul, pesan }
  const { info, konfirmasi } = useFeedback();

  // State Registrasi
  const [regType, setRegType] = useState('MT'); // 'MT' atau 'BO'
  const [regForm, setRegForm] = useState({ nama_lengkap: '', id_atasan: '', jabatan: '', id_lokasi: '' });
  const [opsi, setOpsi] = useState({ atasan: [], jabatan: [], lokasi: [] });

  const html5QrCodeRef = useRef(null);
  const [cameraMode, setCameraMode] = useState('environment');
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      info({
        judul: 'Pasang aplikasi di HP',
        pesan: (
          <ul className="space-y-2">
            <li><b>Android:</b> ketuk ikon titik tiga di pojok kanan atas, lalu pilih <i>Add to Home screen</i>.</li>
            <li><b>iPhone:</b> ketuk tombol Share (kotak dengan panah ke atas), lalu pilih <i>Add to Home Screen</i>.</li>
          </ul>
        ),
      });
    }
  };

  const keluarSesi = (pesan) => {
    hapusToken('karyawan');
    try { localStorage.removeItem('karyawan_data'); } catch { /* abaikan */ }
    setKaryawan(null); setTodayAbsen(null); setStep(1);
    if (pesan) info({ judul: 'Silakan login lagi', pesan });
  };

  const fetchDataHariIni = async () => {
    const { mulai, sampai } = rentangPeriode('bulan_ini');
    const { data, error } = await supabase.rpc('fn_kehadiran_saya', { p_mulai: mulai, p_sampai: sampai });
    if (error) {
      if (kodeError(error) === 'SESI_HABIS') { keluarSesi('Admin melepas HP ini atau menonaktifkan akunmu. Login lagi kalau akunmu masih aktif.'); return; }
      setMessage(`Data absensimu belum bisa dimuat. ${pesanError(error)}`);
      return;
    }
    const rows = data || [];
    const hariIni = tanggalWIB();
    setTodayAbsen(rows.find(r => String(r.tanggal).slice(0, 10) === hariIni) || null);
    const c = hitungStatus(rows);
    setRekap({ masuk: c.Hadir + c.Late, izin: c.Izin + c.Sakit + c.Cuti, telat: c.Late, bolos: c.Bolos });
  };

  useEffect(() => {
    // Lanjutkan sesi yang tersimpan di HP
    const checkSesi = async () => {
      if (!ambilToken('karyawan')) return;
      const { data, error } = await supabase.rpc('fn_sesi_karyawan');
      if (error || !data) { keluarSesi(); return; }
      setKaryawan(data); setStep(2); fetchDataHariIni();
    };
    checkSesi();

    // Pilihan untuk form daftar
    const fetchOpsi = async () => {
      const { data } = await supabase.rpc('fn_opsi_registrasi');
      if (data) setOpsi(data);
    };
    fetchOpsi();

    const handleBeforeInstallPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    // Sengaja hanya dijalankan sekali saat halaman dibuka
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setMessage('');
    const { data, error } = await supabase.rpc('fn_login_karyawan', {
      p_username: form.username, p_password: form.password, p_device_id: ambilDeviceId(),
    });
    if (error) { setMessage(PESAN_KODE[kodeError(error)] || pesanError(error)); setLoading(false); return; }
    simpanToken('karyawan', data.token);
    setKaryawan(data.karyawan); await fetchDataHariIni(); setStep(2); setLoading(false);
  };

  // =================== LOGIKA PENDAFTARAN (REGISTER) ===================
  const isMT = regType === 'MT';
  const deptDaftar = isMT ? 'Marketing' : 'Backoffice';
  const jabatanDaftar = opsi.jabatan.filter(j => j.departemen === deptDaftar);

  const handleRegister = async (e) => {
    e.preventDefault(); setLoading(true); setMessage('');
    const jabatan = regForm.jabatan || (jabatanDaftar.length === 1 ? jabatanDaftar[0].nama : '');
    const idLokasi = regForm.id_lokasi || (opsi.lokasi.length === 1 ? opsi.lokasi[0].id : '');
    if (!regForm.nama_lengkap.trim() || !jabatan || !idLokasi || (isMT && !regForm.id_atasan)) {
      setMessage(isMT ? 'Isi nama lengkap, lalu pilih atasan dan lokasi kerja.' : 'Isi nama lengkap, lalu pilih jabatan dan lokasi kerja.');
      setLoading(false); return;
    }

    // NIP & username dibuat otomatis oleh database
    const { data, error } = await supabase.rpc('fn_register_karyawan', {
      p_nama: regForm.nama_lengkap.trim(), p_departemen: deptDaftar, p_jabatan: jabatan,
      p_id_atasan: isMT ? regForm.id_atasan : null, p_id_lokasi: idLokasi,
    });

    if (error) { setMessage(`Pendaftaran belum berhasil. ${PESAN_KODE[kodeError(error)] || pesanError(error)}`); }
    else {
      await info({
        judul: 'Pendaftaran berhasil', nada: 'sukses', tombolYa: 'Lanjut login',
        pesan: (
          <div className="space-y-3">
            <p>Simpan username ini. Kamu butuh untuk login.</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-slate-900">
              <dt className="text-slate-500">Username</dt><dd className="font-bold">{data.username}</dd>
              <dt className="text-slate-500">Sandi</dt><dd>admin123</dd>
            </dl>
          </div>
        ),
      });
      setForm({ username: data.username, password: 'admin123' });
      setRegForm({ nama_lengkap: '', id_atasan: '', jabatan: '', id_lokasi: '' });
      setStep(1);
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
    } catch { setMessage('Kamera belum bisa dibuka. Izinkan akses kamera untuk situs ini di pengaturan browser, lalu coba lagi.'); }
  };

  const openScanner = () => { setMessage(''); setStep(3); setTimeout(() => startCamera(cameraMode), 300); };
  const toggleCamera = () => { const newMode = cameraMode === 'environment' ? 'user' : 'environment'; setCameraMode(newMode); startCamera(newMode); };
  const batalScanner = async () => { if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) { await html5QrCodeRef.current.stop().catch(() => {}); html5QrCodeRef.current.clear(); } setStep(2); };

  // QR, jam, dan status divalidasi oleh database (fn_absen), bukan oleh HP
  const prosesAbsensi = async (qrData) => {
    setLoading(true); setHasilScan(null); setStep(4);
    const { data, error } = await supabase.rpc('fn_absen', { p_qr: qrData });
    if (error) {
      const kode = kodeError(error);
      const [judul, pesan] = HASIL_GAGAL[kode] || ['Absen belum tercatat', pesanError(error)];
      setHasilScan({ sukses: false, judul, pesan });
      setLoading(false);
      if (kode === 'SESI_HABIS') keluarSesi('Sesimu berakhir. Login lagi untuk absen.');
      return;
    }
    const jam = formatJamDetik(data.waktu);
    if (data.jenis === 'MASUK') {
      setHasilScan({
        sukses: true, judul: 'Absen masuk tercatat',
        pesan: data.status === 'Late' ? `Jam ${jam} WIB. Kamu terlambat ${data.telat_menit} menit.` : `Jam ${jam} WIB. Selamat bekerja.`,
      });
    } else {
      setHasilScan({
        sukses: true, judul: 'Absen pulang tercatat',
        pesan: data.tanpa_masuk
          ? `Jam ${jam} WIB. Hari ini kamu tidak absen masuk, jadi statusmu tercatat Terlambat.`
          : `Jam ${jam} WIB. Terima kasih untuk hari ini.`,
      });
    }
    fetchDataHariIni();
    setLoading(false);
  };

  const formatJam = formatJamDetik;

  const handleLogout = async () => {
    const ok = await konfirmasi({
      judul: 'Keluar dari aplikasi?',
      pesan: 'Akunmu tetap terkunci di HP ini. Kamu bisa login lagi kapan saja dari HP yang sama.',
      tombolYa: 'Keluar',
    });
    if (!ok) return;
    await supabase.rpc('fn_logout', { p_jenis: 'karyawan' });
    keluarSesi();
  };

  const isSelesai = !!todayAbsen?.waktu_keluar;
  // Sebelum 12:00 dan belum ada data -> Check In; setelahnya -> Check Out (boleh tanpa absen masuk)
  const isBisaMasuk = !todayAbsen?.waktu_masuk && !isSelesai && jamWIB() < 12;

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center text-slate-900 font-sans">
      <div className="w-full max-w-md flex flex-col relative bg-slate-50 shadow-2xl overflow-x-hidden">
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-5 bg-white border-b border-slate-200 z-10">
          <div className="flex items-center gap-3">
            <Image src="/logo-gifx.png" alt="Logo GIFX" width={40} height={40} priority className="w-10 h-10 rounded-full shadow-sm" />
            <h1 className="font-bold text-lg text-slate-900 tracking-wide">Absensi GIFX</h1>
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
        {PENDAFTARAN_DIBUKA && step === 0 && (
          <div className="flex-1 flex flex-col justify-center p-6">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-blue-100">
               <UserPlus className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-center mb-2 text-slate-900">Daftar Absensi</h2>
            <p className="text-center text-sm text-slate-500 mb-6">Pendaftaran akun pengguna baru.</p>
            
            <div className="flex bg-slate-100 p-1 rounded-xl mb-6 shadow-inner">
               <button onClick={() => { setRegType('MT'); setRegForm({ ...regForm, jabatan: '' }); }} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${regType === 'MT' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Daftar MT</button>
               <button onClick={() => { setRegType('BO'); setRegForm({ ...regForm, jabatan: '' }); }} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${regType === 'BO' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Daftar BO / Manager</button>
            </div>

            <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-700 mb-6 text-center">
               {regType === 'MT' ? <>Pendaftaran <b>Marketing</b>: isi nama, lalu pilih atasan dan lokasi kerja.</> : <>Pendaftaran <b>Backoffice</b>: isi nama, lalu pilih jabatan dan lokasi kerja.</>} Username dan sandi dibuat otomatis.
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                 <label className="text-sm font-bold text-slate-700 mb-1 block">Nama Lengkap</label>
                 <input required type="text" placeholder="Masukkan nama Anda..." value={regForm.nama_lengkap} onChange={e => setRegForm({...regForm, nama_lengkap: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm"/>
              </div>
              {jabatanDaftar.length > 1 && (
                <div>
                   <label className="text-sm font-bold text-slate-700 mb-1 block">Jabatan</label>
                   <select required value={regForm.jabatan} onChange={e => setRegForm({...regForm, jabatan: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm">
                      <option value="">Pilih jabatan</option>
                      {jabatanDaftar.map(j => <option key={j.nama} value={j.nama}>{j.nama}</option>)}
                   </select>
                </div>
              )}
              {isMT && (
                <div>
                   <label className="text-sm font-bold text-slate-700 mb-1 block">Atasan</label>
                   <select required value={regForm.id_atasan} onChange={e => setRegForm({...regForm, id_atasan: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm">
                      <option value="">Pilih atasan</option>
                      {opsi.atasan.map(b => <option key={b.id} value={b.id}>{b.nama_lengkap}</option>)}
                   </select>
                </div>
              )}
              {opsi.lokasi.length > 1 && (
                <div>
                   <label className="text-sm font-bold text-slate-700 mb-1 block">Lokasi kerja</label>
                   <select required value={regForm.id_lokasi} onChange={e => setRegForm({...regForm, id_lokasi: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm">
                      <option value="">Pilih lokasi</option>
                      {opsi.lokasi.map(l => <option key={l.id} value={l.id}>{l.nama}</option>)}
                   </select>
                </div>
              )}
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
            
            {/* TOMBOL MENUJU PENDAFTARAN (disembunyikan: karyawan baru ditambahkan lewat admin) */}
            {PENDAFTARAN_DIBUKA && (
            <div className="mt-8 text-center border-t border-slate-200 pt-6">
               <p className="text-sm text-slate-500 mb-3">Karyawan baru?</p>
               <button onClick={() => {setStep(0); setMessage('');}} className="w-full py-3 border-2 border-blue-600 text-blue-600 font-extrabold rounded-xl hover:bg-blue-50 transition">Daftar Akun Karyawan</button>
            </div>
            )}
          </div>
        )}

        {/* FASE 2: DASHBOARD */}
        {step === 2 && (
          <div className="flex-1 flex flex-col items-center pt-8 px-6 pb-24 overflow-y-auto">
             <h2 className="text-3xl font-black text-slate-900">Absensi</h2>
             <p className="text-slate-500 text-sm mt-1 mb-8">Hi, {karyawan?.nama_lengkap}.</p>
             {message && <div className="w-full -mt-4 mb-6 p-3 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-200">{message}</div>}

             <div className="w-full bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mb-12">
               <div className="text-center mb-6">
                 <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Status Hari Ini</p>
                 <span className={`inline-block px-3 py-1 rounded-lg border font-black text-lg tracking-wide ${(STATUS_KEHADIRAN[todayAbsen?.status] || STATUS_KEHADIRAN['Belum Absen']).cls}`}>
                   {(STATUS_KEHADIRAN[todayAbsen?.status] || STATUS_KEHADIRAN['Belum Absen']).label}
                 </span>
                 {todayAbsen?.keterangan && <p className="text-xs text-slate-500 mt-2">{todayAbsen.keterangan}</p>}
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
                   <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p className="text-[10px] text-slate-400 mb-1">Masuk</p><p className="text-base text-blue-600">{rekap.masuk}</p></div>
                   <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p className="text-[10px] text-slate-400 mb-1">Izin</p><p className="text-base text-slate-700">{rekap.izin}</p></div>
                   <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p className="text-[10px] text-slate-400 mb-1">Telat</p><p className="text-amber-500 text-base">{rekap.telat}</p></div>
                   <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p className="text-[10px] text-slate-400 mb-1">Alpha</p><p className="text-rose-600 text-base">{rekap.bolos}</p></div>
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
                {message && <p className="mt-6 mx-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm text-center">{message}</p>}
                <button onClick={toggleCamera} className="mt-10 flex items-center gap-2 bg-slate-800 text-white px-8 py-4 rounded-full font-bold border border-slate-700 active:bg-slate-700 transition-colors">
                  <RefreshCcw className="w-5 h-5" /> Putar Kamera
                </button>
             </div>
          </div>
        )}

        {/* FASE 4: STATUS ABSENSI */}
        {step === 4 && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50">
            {loading || !hasilScan ? (
              <p className="text-slate-500 font-medium">Mencatat absensi...</p>
            ) : (
              <>
                <div className={`w-28 h-28 rounded-full flex items-center justify-center mb-8 border shadow-sm ${hasilScan.sukses ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                  {hasilScan.sukses ? <CheckCircle2 className="w-14 h-14" /> : <AlertCircle className="w-14 h-14" />}
                </div>
                <h2 className={`text-2xl font-black mb-3 text-center ${hasilScan.sukses ? 'text-blue-600' : 'text-rose-600'}`}>{hasilScan.judul}</h2>
                <p className="text-slate-500 text-center font-medium max-w-xs">{hasilScan.pesan}</p>
              </>
            )}
            <button onClick={() => { setStep(2); setMessage(''); setHasilScan(null); }} disabled={loading} className="mt-12 px-10 py-4 bg-slate-900 text-white font-extrabold rounded-full hover:bg-slate-800 transition-colors shadow-md">Kembali ke Dasbor</button>
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