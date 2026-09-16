'use client';
import { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { RefreshCw } from 'lucide-react';

export default function QrKiosk() {
  const [token, setToken] = useState('');
  const [countdown, setCountdown] = useState(30);

  const generateToken = () => {
    const rawString = `ABSENSI-KR-${Date.now()}`;
    setToken(btoa(rawString)); // Encode ke Base64 dasar
    setCountdown(30);
  };

  useEffect(() => {
    generateToken();
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          generateToken();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center bg-white border border-slate-200 rounded-xl shadow-sm p-12 h-full">
      <h2 className="text-3xl font-bold text-slate-900 mb-2">Pemindai Presensi Aktif</h2>
      <p className="text-slate-500 mb-10 text-lg">Gunakan perangkat genggam Anda untuk memindai kode ini.</p>
      
      <div className="p-6 bg-white border-4 border-blue-100 rounded-2xl shadow-inner">
        {token ? (
          <QRCodeCanvas value={token} size={350} level="H" includeMargin={true} />
        ) : (
          <div className="w-[350px] h-[350px] bg-slate-100 animate-pulse rounded-lg" />
        )}
      </div>
      
      <div className="mt-10 flex items-center gap-3 text-slate-600 font-medium text-lg border border-slate-200 bg-slate-50 px-6 py-3 rounded-full shadow-sm">
        <RefreshCw className={`w-6 h-6 ${countdown <= 5 ? 'text-rose-500 animate-spin' : 'text-blue-500'}`} />
        <span>Diperbarui otomatis dalam <strong className="text-slate-900">{countdown}</strong> detik</span>
      </div>
    </div>
  );
}