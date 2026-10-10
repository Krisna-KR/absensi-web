'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Plus, Trash2, CalendarOff } from 'lucide-react';
import { tanggalWIB, formatTanggal } from '@/utils/waktu';
import { pesanError } from '@/utils/pesanError';
import { useFeedback } from '@/components/Feedback';

const FORM_KOSONG = { tanggal: '', keterangan: '', jenis: 'Libur Nasional' };

export default function MasterDataPage() {
  const tahunIni = Number(tanggalWIB().slice(0, 4));
  const [tahun, setTahun] = useState(tahunIni);
  const [libur, setLibur] = useState([]);
  const [form, setForm] = useState(FORM_KOSONG);
  const [loading, setLoading] = useState(false);
  const { toast, konfirmasi } = useFeedback();
  const [versi, setVersi] = useState(0);
  const muatUlang = () => setVersi(v => v + 1);

  useEffect(() => {
    let batal = false;
    (async () => {
      const { data, error } = await supabase.from('master_libur').select('*')
        .gte('tanggal', `${tahun}-01-01`).lte('tanggal', `${tahun}-12-31`).order('tanggal');
      if (batal) return;
      if (error) toast(`Daftar libur belum bisa dimuat. ${pesanError(error)}`, 'gagal');
      setLibur(data || []);
    })();
    return () => { batal = true; };
  }, [tahun, versi, toast]);

  const simpan = async (e) => {
    e.preventDefault();
    if (!form.tanggal || !form.keterangan.trim()) return;
    setLoading(true);
    const { error } = await supabase.from('master_libur').upsert({ ...form, keterangan: form.keterangan.trim() }, { onConflict: 'tanggal' });
    setLoading(false);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`${formatTanggal(form.tanggal)} tercatat sebagai ${form.jenis}.`);
    setForm(FORM_KOSONG); muatUlang();
  };

  const hapus = async (tanggal) => {
    const ok = await konfirmasi({
      judul: `Hapus libur ${formatTanggal(tanggal)}?`,
      pesan: 'Tanggal ini kembali jadi hari kerja. Karyawan yang tidak absen di tanggal itu tercatat Bolos.',
      tombolYa: 'Hapus', nada: 'bahaya',
    });
    if (!ok) return;
    const { error } = await supabase.from('master_libur').delete().eq('tanggal', tanggal);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`Libur ${formatTanggal(tanggal)} dihapus.`); muatUlang();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Master Hari Libur</h1>
          <p className="text-slate-500 text-sm mt-1">Libur nasional & cuti bersama dihitung Libur. Sabtu & Minggu otomatis Libur, tidak perlu diinput.</p>
        </div>
        <select value={tahun} onChange={e => setTahun(Number(e.target.value))} className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold text-slate-700 outline-none">
          {[tahunIni - 1, tahunIni, tahunIni + 1].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <form onSubmit={simpan} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-[180px_1fr_180px_auto] gap-3 items-end">
        <div>
          <label className="text-sm font-semibold text-slate-700">Tanggal</label>
          <input type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg mt-1 text-sm" />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">Keterangan</label>
          <input type="text" value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} placeholder="Contoh: Hari Raya Idulfitri" className="w-full px-3 py-2 border border-slate-200 rounded-lg mt-1 text-sm" />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">Jenis</label>
          <select value={form.jenis} onChange={e => setForm({ ...form, jenis: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg mt-1 text-sm bg-white">
            <option value="Libur Nasional">Libur Nasional</option>
            <option value="Cuti Bersama">Cuti Bersama</option>
          </select>
        </div>
        <button type="submit" disabled={loading || !form.tanggal || !form.keterangan.trim()} title={!form.tanggal || !form.keterangan.trim() ? 'Isi tanggal dan keterangan dulu' : ''} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium h-[38px] disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="w-4 h-4" /> Simpan
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold">Tanggal</th>
              <th className="px-6 py-4 font-semibold">Keterangan</th>
              <th className="px-6 py-4 font-semibold">Jenis</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {libur.length === 0 ? (
              <tr><td colSpan="4" className="px-6 py-12 text-center text-slate-500">
                <CalendarOff className="w-6 h-6 mx-auto mb-2 text-slate-300" />Belum ada data libur untuk {tahun}.
              </td></tr>
            ) : libur.map(l => (
              <tr key={l.tanggal} className="hover:bg-slate-50">
                <td className="px-6 py-3 font-medium text-slate-800 whitespace-nowrap">{formatTanggal(l.tanggal)}</td>
                <td className="px-6 py-3">{l.keterangan}</td>
                <td className="px-6 py-3">
                  <span className={`px-2 py-1 rounded border text-xs font-bold ${l.jenis === 'Cuti Bersama' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{l.jenis}</span>
                </td>
                <td className="px-6 py-3 text-right">
                  <button onClick={() => hapus(l.tanggal)} className="p-2 text-rose-500 bg-rose-50 rounded-lg hover:bg-rose-100" title="Hapus"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
