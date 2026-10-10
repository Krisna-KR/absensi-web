'use client';
import { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { RefreshCw, MapPin } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';
import { pesanError } from '@/utils/pesanError';

// QR dibuat server (bertanda tangan + lokasi), diperbarui tiap 10 detik.
const INTERVAL = 10;
const KUNCI_LOKASI = 'kiosk_lokasi';

export default function QrKiosk() {
  const [lokasiList, setLokasiList] = useState([]);
  const [idLokasi, setIdLokasi] = useState('');
  const [qr, setQr] = useState('');
  const [countdown, setCountdown] = useState(INTERVAL);
  const [galat, setGalat] = useState('');

  useEffect(() => {
    let batal = false;
    (async () => {
      const { data, error } = await supabase.from('master_lokasi').select('id, nama_cabang').order('nama_cabang');
      if (batal) return;
      if (error) { setGalat(pesanError(error)); return; }
      setLokasiList(data || []);
      let simpanan = '';
      try { simpanan = localStorage.getItem(KUNCI_LOKASI) || ''; } catch { /* abaikan */ }
      setIdLokasi((data || []).some(l => l.id === simpanan) ? simpanan : (data?.[0]?.id || ''));
    })();
    return () => { batal = true; };
  }, []);

  useEffect(() => {
    if (!idLokasi) return;
    let batal = false;
    const ambil = async () => {
      const { data, error } = await supabase.rpc('fn_qr_kiosk', { p_id_lokasi: idLokasi });
      if (batal) return;
      if (error) { setGalat(pesanError(error)); setQr(''); return; }
      setGalat(''); setQr(data.qr); setCountdown(INTERVAL);
    };
    ambil();
    const tQr = setInterval(ambil, INTERVAL * 1000);
    const tDetik = setInterval(() => setCountdown(c => (c > 1 ? c - 1 : INTERVAL)), 1000);
    return () => { batal = true; clearInterval(tQr); clearInterval(tDetik); };
  }, [idLokasi]);

  const gantiLokasi = (id) => {
    setIdLokasi(id);
    try { localStorage.setItem(KUNCI_LOKASI, id); } catch { /* abaikan */ }
  };

  const namaLokasi = lokasiList.find(l => l.id === idLokasi)?.nama_cabang;

  return (
    <div className="flex flex-col items-center justify-center bg-white border border-slate-200 rounded-xl shadow-sm p-8 md:p-12 min-h-[80vh]">
      <div className="inline-flex p-1 bg-slate-100 rounded-lg mb-8">
        {lokasiList.map(l => (
          <button key={l.id} onClick={() => gantiLokasi(l.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold ${idLokasi === l.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <MapPin className="w-4 h-4" />{l.nama_cabang}
          </button>
        ))}
      </div>

      <h2 className="text-3xl font-bold text-slate-900 mb-2 text-center">Presensi {namaLokasi || ''}</h2>
      <p className="text-slate-500 mb-10 text-lg text-center">Buka aplikasi absensi di HP kamu, lalu pindai kode ini.</p>

      <div className="p-6 bg-white border-4 border-blue-100 rounded-2xl shadow-inner">
        {qr ? (
          <QRCodeCanvas value={qr} size={350} level="M" includeMargin={true} />
        ) : (
          <div className="w-[350px] h-[350px] bg-slate-100 animate-pulse rounded-lg flex items-center justify-center text-sm text-slate-400 text-center p-6">
            {galat || 'Menyiapkan kode...'}
          </div>
        )}
      </div>

      {galat && qr === '' && <p className="mt-6 text-sm text-rose-600">{galat}</p>}

      <div className="mt-10 flex items-center gap-3 text-slate-600 font-medium text-lg border border-slate-200 bg-slate-50 px-6 py-3 rounded-full shadow-sm">
        <RefreshCw className={`w-6 h-6 ${countdown <= 3 ? 'text-rose-500 animate-spin' : 'text-blue-500'}`} />
        <span>Kode berganti dalam <strong className="text-slate-900 tabular-nums">{countdown}</strong> detik</span>
      </div>
    </div>
  );
}
