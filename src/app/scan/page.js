'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { CheckCircle2, AlertCircle, Camera, Lock } from 'lucide-react';

export default function MobileScannerPage() {
  const [step, setStep] = useState(1); // 1: Login, 2: Scan, 3: Status
  const [deviceKey, setDeviceKey] = useState('');
  const [karyawan, setKaryawan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const scannerRef = useRef(null);

  // Inisialisasi: Cek apakah HP ini sudah terkunci ke seorang karyawan
  useEffect(() => {
    const savedKaryawan = localStorage.getItem('karyawan_data');
    if (savedKaryawan) {
      setKaryawan(JSON.parse(savedKaryawan));
      setStep(2); // Langsung ke kamera
    }
  }, []);

  // Logika Login & Kunci Perangkat
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    // 1. Cari karyawan berdasarkan Device Key
    const { data, error } = await supabase.from('karyawan').select('*').eq('device_key', deviceKey).single();
    
    if (error || !data) {
      setMessage('Device Key tidak ditemukan.');
      setLoading(false);
      return;
    }

    // 2. Buat ID unik untuk HP ini jika karyawan belum terkunci
    let currentDeviceId = localStorage.getItem('device_id');
    if (!currentDeviceId) {
      currentDeviceId = crypto.randomUUID();
      localStorage.setItem('device_id', currentDeviceId);
    }

    // 3. Validasi: Apakah karyawan ini sudah dikunci ke HP lain?
    if (data.device_id && data.device_id !== currentDeviceId) {
      setMessage('Akses ditolak! Key ini sudah terkait dengan perangkat/HP lain.');
      setLoading(false);
      return;
    }

    // 4. Update tabel karyawan untuk mengunci device_id ini
    if (!data.device_id) {
      await supabase.from('karyawan').update({ device_id: currentDeviceId }).eq('id', data.id);
    }

    localStorage.setItem('karyawan_data', JSON.stringify(data));
    setKaryawan(data);
    setStep(2);
    setLoading(false);
  };

  // Logika Menyalakan Kamera (HTML5 QR Code)
  useEffect(() => {
    if (step === 2) {
      const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
      scannerRef.current = scanner;
      
      scanner.render(async (decodedText) => {
        // Hentikan scanner segera setelah berhasil baca 1 kali
        scanner.clear();
        await prosesAbsensi(decodedText);
      }, (error) => {
        // Abaikan galat pembacaan background
      });

      return () => {
        scanner.clear().catch(error => console.error("Gagal membersihkan scanner", error));
      };
    }
  }, [step]);

  // Logika Utama Absensi (Masuk vs Keluar)
  const prosesAbsensi = async (qrData) => {
    setLoading(true);
    setStep(3); // Pindah ke layar status

    try {
      // 1. Validasi Kode QR (Format: ABSENSI-KR-[Timestamp])
      if (!qrData.startsWith('ABSENSI-KR-')) throw new Error('Kode QR tidak valid.');
      
      const qrTimestamp = parseInt(qrData.split('-')[2]);
      const selisihDetik = (Date.now() - qrTimestamp) / 1000;
      
      // Tolak jika QR berumur lebih dari 60 detik (mencegah curang via foto)
      if (selisihDetik > 60) throw new Error('Kode QR sudah kedaluwarsa. Harap scan ulang dari Kiosk.');

      // 2. Tentukan Jenis Absen Berdasarkan Jam Saat Ini
      const currentHour = new Date().getHours();
      let jenisAbsen = '';
      
      if (currentHour >= 7 && currentHour <= 12) jenisAbsen = 'MASUK';
      else if (currentHour >= 12 && currentHour <= 23) jenisAbsen = 'KELUAR';
      else throw new Error('Di luar jam operasional absensi (07:00 - 23:59).');

      // 3. Eksekusi ke Database
      const today = new Date().toISOString().split('T')[0];

      if (jenisAbsen === 'MASUK') {
        // Cek apakah sudah absen masuk hari ini
        const { data: cekMasuk } = await supabase.from('absensi').select('id').eq('id_karyawan', karyawan.id).gte('waktu_masuk', `${today}T00:00:00`).single();
        if (cekMasuk) throw new Error('Anda sudah melakukan absensi MASUK hari ini.');

        const { error } = await supabase.from('absensi').insert([{
          id_karyawan: karyawan.id,
          waktu_masuk: new Date().toISOString(),
          status: currentHour > 8 ? 'Late' : 'Hadir' // Misal jam masuk jam 08:00
        }]);
        if (error) throw error;
        setMessage('BERHASIL ABSEN MASUK');

      } else if (jenisAbsen === 'KELUAR') {
        // Cari absensi masuk hari ini untuk di-update
        const { data: dataMasuk } = await supabase.from('absensi').select('*').eq('id_karyawan', karyawan.id).gte('waktu_masuk', `${today}T00:00:00`).order('waktu_masuk', { ascending: false }).limit(1);
        
        if (!dataMasuk || dataMasuk.length === 0) throw new Error('Anda belum absen masuk hari ini. Tidak bisa absen keluar.');
        if (dataMasuk[0].waktu_keluar) throw new Error('Anda sudah melakukan absensi KELUAR hari ini.');

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
        
        {/* Header Biru */}
        <div className="bg-blue-600 p-6 text-center text-white">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
            {step === 1 ? <Lock className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
          </div>
          <h1 className="text-xl font-bold tracking-wide">Absensi Seluler KR</h1>
          {karyawan && <p className="text-blue-100 text-sm mt-1">{karyawan.nama_lengkap}</p>}
        </div>

        <div className="p-6">
          {/* FASE 1: LOGIN DEVICE KEY */}
          {step === 1 && (
            <form onSubmit={handleLogin} className="space-y-4">
              <p className="text-slate-600 text-sm text-center mb-6">Masukkan Device Key yang diberikan oleh HRD untuk menautkan perangkat ini secara permanen.</p>
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">Device Key</label>
                <input required type="text" value={deviceKey} onChange={e => setDeviceKey(e.target.value.toUpperCase())} placeholder="Contoh: KR-ABCD12345678" className="w-full px-4 py-3 border border-slate-300 rounded-xl text-center font-mono font-bold text-lg tracking-widest uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500"/>
              </div>
              {message && <div className="p-3 bg-rose-50 text-rose-600 text-sm rounded-lg flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/> <p>{message}</p></div>}
              <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition">
                {loading ? 'Memvalidasi...' : 'Tautkan Perangkat'}
              </button>
            </form>
          )}

          {/* FASE 2: SCANNER KAMERA */}
          {step === 2 && (
            <div className="flex flex-col items-center">
              <div id="qr-reader" className="w-full overflow-hidden rounded-xl border-2 border-slate-200"></div>
              <p className="text-slate-500 text-sm mt-4 text-center">Arahkan kamera ke layar Kiosk Absensi untuk merekam kehadiran.</p>
            </div>
          )}

          {/* FASE 3: STATUS HASIL */}
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