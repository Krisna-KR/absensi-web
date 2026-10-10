'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Plus, X, Check, Trash2, KeyRound, Smartphone, Clock, Edit2, History, Users, ArrowRightLeft, TrendingUp } from 'lucide-react';
import { tanggalWIB, jamMenitWIB, formatTanggal, formatTanggalWaktu } from '@/utils/waktu';
import { JABATAN_BACKOFFICE, STATUS_KEHADIRAN } from '@/utils/kehadiran';
import { pesanError } from '@/utils/pesanError';
import { useFeedback } from '@/components/Feedback';

const FORM_KOSONG = { nama_lengkap: '', dept: '', id_atasan: '', jabatan: '' };
const JENIS_MANUAL = [
  { v: 'Hadir', l: 'Hadir (input jam masuk / pulang)' },
  { v: 'Izin', l: 'Izin (kepentingan pribadi)' },
  { v: 'Sakit', l: 'Sakit' },
  { v: 'Cuti', l: 'Cuti' },
];

// Didefinisikan di luar komponen agar input tidak kehilangan fokus saat re-render
const ErrText = ({ msg }) => msg ? <p className="text-rose-600 text-xs mt-1">{msg}</p> : null;

const Modal = ({ judul, onClose, children, lebar = 'max-w-md' }) => (
  <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div className={`bg-white rounded-2xl shadow-xl w-full ${lebar} overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col`}>
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
        <h2 className="text-lg font-bold text-slate-900">{judul}</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
      </div>
      <div className="overflow-y-auto">{children}</div>
    </div>
  </div>
);

export default function KaryawanPage() {
  const [karyawan, setKaryawan] = useState([]);
  const [departemen, setDepartemen] = useState([]);
  const [loading, setLoading] = useState(false);
  const { toast, konfirmasi, info } = useFeedback();

  // Modal Tambah/Edit Karyawan
  const [showModal, setShowModal] = useState(false);
  const [editKar, setEditKar] = useState(null);
  const [form, setForm] = useState(FORM_KOSONG);
  const [errorsKar, setErrorsKar] = useState({});

  // Modal Input Manual (bypass admin)
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState(null);
  const [errorsManual, setErrorsManual] = useState({});

  // Modal Transfer Bawahan & Riwayat
  const [transfer, setTransfer] = useState(null); // { dari, ids, ke }
  const [riwayat, setRiwayat] = useState(null);   // { kar, rows }

  const [versi, setVersi] = useState(0);
  const fetchData = () => setVersi(v => v + 1); // muat ulang data

  useEffect(() => {
    let batal = false;
    (async () => {
      const [{ data: deptData }, { data: karData }] = await Promise.all([
        supabase.from('master_departemen').select('id, nama_departemen'),
        supabase.from('karyawan').select('*').order('created_at', { ascending: false }),
      ]);
      if (batal) return;
      setDepartemen(deptData || []); setKaryawan(karData || []);
    })();
    return () => { batal = true; };
  }, [versi]);

  // =================== HELPER STRUKTUR ===================
  const deptById = useMemo(() => Object.fromEntries(departemen.map(d => [d.id, d.nama_departemen])), [departemen]);
  const deptIdByName = useMemo(() => Object.fromEntries(departemen.map(d => [d.nama_departemen, d.id])), [departemen]);
  const karById = useMemo(() => Object.fromEntries(karyawan.map(k => [k.id, k])), [karyawan]);
  const namaDept = (k) => deptById[k?.id_departemen] || '';
  const bawahanOf = (id) => karyawan.filter(k => k.id_atasan === id);
  const daftarBM = karyawan.filter(k => namaDept(k) === 'Backoffice' && k.jabatan === 'Business Manager' && k.is_approved);

  // =================== AKSI CEPAT ===================
  const aksiApprove = async (kar) => {
    const ok = await konfirmasi({ judul: `Setujui akun ${kar.nama_lengkap}?`, pesan: 'Setelah disetujui, karyawan ini bisa login dan absen dari HP.', tombolYa: 'Setujui' });
    if (!ok) return;
    const { error } = await supabase.from('karyawan').update({ is_approved: true }).eq('id', kar.id);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`Akun ${kar.nama_lengkap} sudah aktif.`); fetchData();
  };

  const aksiKick = async (kar) => {
    const ok = await konfirmasi({
      judul: `Lepas HP ${kar.nama_lengkap}?`,
      pesan: `${kar.nama_lengkap} akan keluar dari HP yang sekarang. Akunnya terkunci lagi ke HP yang dia pakai saat login berikutnya.`,
      tombolYa: 'Lepas HP', nada: 'bahaya',
    });
    if (!ok) return;
    const { error } = await supabase.from('karyawan').update({ device_id: null }).eq('id', kar.id);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`HP ${kar.nama_lengkap} sudah dilepas. Dia bisa login dari HP baru.`); fetchData();
  };

  const aksiResetSandi = async (kar) => {
    const ok = await konfirmasi({
      judul: `Reset sandi ${kar.nama_lengkap}?`,
      pesan: <>Sandi kembali ke <b className="font-mono">admin123</b>. Sandi lama tidak bisa dipakai lagi.</>,
      tombolYa: 'Reset sandi', nada: 'bahaya',
    });
    if (!ok) return;
    const { error } = await supabase.from('karyawan').update({ password: 'admin123' }).eq('id', kar.id);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`Sandi ${kar.nama_lengkap} sekarang admin123.`); fetchData();
  };

  // =================== TAMBAH / EDIT KARYAWAN ===================
  const bukaTambah = () => { setEditKar(null); setForm(FORM_KOSONG); setErrorsKar({}); setShowModal(true); };

  const bukaEdit = (kar) => {
    setEditKar(kar);
    setForm({ nama_lengkap: kar.nama_lengkap, dept: namaDept(kar), id_atasan: kar.id_atasan || '', jabatan: kar.jabatan || '' });
    setErrorsKar({}); setShowModal(true);
  };

  // Perubahan struktur yang akan tercatat di riwayat (hanya mode edit)
  const previewPerubahan = () => {
    if (!editKar) return null;
    const nama = editKar.nama_lengkap;
    const deptLama = namaDept(editKar);
    const atasanLama = karById[editKar.id_atasan]?.nama_lengkap || 'belum ada';
    const atasanBaru = karById[form.id_atasan]?.nama_lengkap;
    if (deptLama === 'Marketing' && form.dept === 'Backoffice') return {
      icon: TrendingUp, teks: `Promosi ke Backoffice${form.jabatan ? ` sebagai ${form.jabatan}` : ''}. Atasan lama dilepas.`,
      judul: `Promosikan ${nama} ke Backoffice?`,
      pesan: `${nama} jadi ${form.jabatan || 'karyawan Backoffice'} dan tidak lagi punya atasan. Riwayat struktur mencatat promosi ini.`,
      tombolYa: 'Promosikan',
    };
    if (deptLama && form.dept && deptLama !== form.dept) return {
      icon: ArrowRightLeft, teks: `Pindah departemen: ${deptLama} → ${form.dept}.`,
      judul: `Pindahkan ${nama} ke ${form.dept}?`,
      pesan: `Riwayat struktur mencatat perpindahan ${nama} dari ${deptLama} ke ${form.dept}.`,
      tombolYa: 'Pindahkan',
    };
    if (form.dept === 'Marketing' && (editKar.id_atasan || '') !== form.id_atasan && form.id_atasan) return {
      icon: ArrowRightLeft, teks: `Atasan berubah: ${atasanLama} → ${atasanBaru}.`,
      judul: `Pindahkan ${nama} ke tim ${atasanBaru}?`,
      pesan: editKar.id_atasan
        ? `${nama} keluar dari tim ${atasanLama} dan masuk tim ${atasanBaru}. Riwayat struktur mencatat perpindahan ini.`
        : `${nama} belum punya atasan. Setelah disimpan, ${atasanBaru} jadi atasannya dan riwayat struktur mencatatnya.`,
      tombolYa: 'Simpan',
    };
    if (form.dept === 'Backoffice' && (editKar.jabatan || '') !== form.jabatan && form.jabatan) return {
      icon: ArrowRightLeft, teks: `Jabatan berubah: ${editKar.jabatan || 'belum ada'} → ${form.jabatan}.`,
      judul: `Ubah jabatan ${nama} jadi ${form.jabatan}?`,
      pesan: 'Riwayat struktur mencatat perubahan jabatan ini.',
      tombolYa: 'Ubah jabatan',
    };
    return null;
  };
  const perubahan = previewPerubahan();
  const IconPerubahan = perubahan?.icon;

  const handleSimpanKaryawan = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.nama_lengkap.trim()) errs.nama_lengkap = 'Isi nama lengkap.';
    if (!form.dept) errs.dept = 'Pilih Marketing atau Backoffice.';
    if (form.dept === 'Marketing' && !form.id_atasan) errs.id_atasan = 'Pilih Business Manager yang membawahi karyawan ini.';
    if (form.dept === 'Backoffice' && !form.jabatan) errs.jabatan = 'Pilih jabatan.';
    if (Object.keys(errs).length > 0) { setErrorsKar(errs); return; }
    if (perubahan && !(await konfirmasi({ judul: perubahan.judul, pesan: perubahan.pesan, tombolYa: perubahan.tombolYa }))) return;

    setLoading(true);
    const payload = {
      nama_lengkap: form.nama_lengkap.trim(),
      id_departemen: deptIdByName[form.dept],
      id_atasan: form.dept === 'Marketing' ? form.id_atasan : null,
      jabatan: form.dept === 'Marketing' ? 'Marketing' : form.jabatan,
    };

    if (editKar) {
      const { error } = await supabase.from('karyawan').update(payload).eq('id', editKar.id);
      setLoading(false);
      if (error) { toast(pesanError(error), 'gagal'); return; }
      toast(`Data ${payload.nama_lengkap} tersimpan.`);
      setShowModal(false); fetchData();
    } else {
      // NIP & username dibuat otomatis oleh database (trigger fn_karyawan_generate_id)
      const { data, error } = await supabase.from('karyawan')
        .insert([{ ...payload, password: 'admin123', role: 'Karyawan', is_approved: true }])
        .select('nip, username').single();
      setLoading(false);
      if (error) { toast(pesanError(error), 'gagal'); return; }
      setShowModal(false); fetchData();
      await info({
        judul: `${payload.nama_lengkap} sudah terdaftar`, nada: 'sukses', tombolYa: 'Selesai',
        pesan: (
          <div className="space-y-3">
            <p>Berikan data login ini ke {payload.nama_lengkap} untuk masuk dari HP.</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-slate-900">
              <dt className="text-slate-500">NIP</dt><dd>{data.nip}</dd>
              <dt className="text-slate-500">Username</dt><dd className="font-bold">{data.username}</dd>
              <dt className="text-slate-500">Sandi</dt><dd>admin123</dd>
            </dl>
          </div>
        ),
      });
    }
  };

  // =================== TRANSFER BAWAHAN ===================
  const bukaTransfer = (bm) => setTransfer({ dari: bm, ids: bawahanOf(bm.id).map(k => k.id), ke: '' });

  const simpanTransfer = async () => {
    const tujuan = karById[transfer.ke]?.nama_lengkap;
    const n = transfer.ids.length;
    const ok = await konfirmasi({
      judul: `Pindahkan ${n} Marketing ke tim ${tujuan}?`,
      pesan: `Mereka keluar dari tim ${transfer.dari.nama_lengkap}. Riwayat struktur mencatat setiap perpindahan.`,
      tombolYa: 'Pindahkan',
    });
    if (!ok) return;
    setLoading(true);
    const { error } = await supabase.from('karyawan').update({ id_atasan: transfer.ke }).in('id', transfer.ids);
    setLoading(false);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`${n} Marketing sudah pindah ke tim ${tujuan}.`);
    setTransfer(null); fetchData();
  };

  // =================== RIWAYAT STRUKTUR ===================
  const bukaRiwayat = async (kar) => {
    const { data, error } = await supabase.from('riwayat_struktur').select('*').eq('id_karyawan', kar.id).order('berlaku_mulai', { ascending: false });
    if (error) { toast(pesanError(error), 'gagal'); return; }
    setRiwayat({ kar, rows: data || [] });
  };

  // =================== INPUT MANUAL (BYPASS ADMIN) ===================
  const muatManual = async (kar, tanggal) => {
    setLoading(true); setErrorsManual({});
    const [{ data: abs, error: e1 }, { data: izin, error: e2 }] = await Promise.all([
      supabase.from('absensi').select('*').eq('id_karyawan', kar.id).eq('tanggal', tanggal).maybeSingle(),
      supabase.from('izin_harian').select('*').eq('id_karyawan', kar.id).eq('tanggal', tanggal).maybeSingle(),
    ]);
    setLoading(false);
    if (e1 || e2) { toast(pesanError(e1 || e2), 'gagal'); return; }
    setManual({
      kar, tanggal,
      jenis: izin ? izin.jenis : 'Hadir',
      masuk: jamMenitWIB(abs?.waktu_masuk) || '',
      keluar: jamMenitWIB(abs?.waktu_keluar) || '',
      keterangan: izin?.keterangan || abs?.keterangan || '',
      absensiId: abs?.id || null,
      izinId: izin?.id || null,
      info: abs ? `Sudah ada absensi (${STATUS_KEHADIRAN[abs.status]?.label || abs.status})${abs.updated_at ? `, terakhir diubah ${formatTanggalWaktu(abs.updated_at)}` : ''}.`
          : izin ? `Tercatat ${izin.jenis} (${izin.status_approval || 'Pending'}).` : 'Belum ada data. Kalau tanggal ini hari kerja dan tetap kosong, statusnya Bolos.',
    });
    setShowManual(true);
  };

  const simpanManual = async (e) => {
    e.preventDefault();
    const m = manual; const errs = {};
    const hariIni = tanggalWIB();
    if (!m.tanggal) errs.tanggal = 'Pilih tanggal.';
    if (m.jenis === 'Hadir') {
      if (m.tanggal > hariIni) errs.tanggal = 'Jam hadir hanya bisa diisi untuk hari ini atau sebelumnya.';
      if (!m.masuk && !m.keluar) errs.masuk = 'Isi jam masuk, jam pulang, atau keduanya.';
      if (m.keluar && m.masuk && m.keluar <= m.masuk) errs.keluar = 'Jam pulang harus setelah jam masuk.';
    } else if (!m.keterangan.trim()) {
      errs.keterangan = `Tulis alasan ${m.jenis.toLowerCase()}, misalnya "demam, ada surat dokter".`;
    }
    if (Object.keys(errs).length > 0) { setErrorsManual(errs); return; }

    if (m.jenis !== 'Hadir' && m.absensiId) {
      const ok = await konfirmasi({
        judul: `Ganti absensi jadi ${m.jenis}?`,
        pesan: `${m.kar.nama_lengkap} sudah punya jam masuk/pulang di ${formatTanggal(m.tanggal)}. Kalau lanjut, jam itu terhapus dan diganti ${m.jenis}.`,
        tombolYa: `Ganti jadi ${m.jenis}`, nada: 'bahaya',
      });
      if (!ok) return;
    }

    setLoading(true);
    let error;
    if (m.jenis === 'Hadir') {
      ({ error } = await supabase.from('absensi').upsert({
        id_karyawan: m.kar.id,
        tanggal: m.tanggal,
        waktu_masuk: m.masuk ? `${m.tanggal}T${m.masuk}:00+07:00` : null,
        waktu_keluar: m.keluar ? `${m.tanggal}T${m.keluar}:00+07:00` : null,
        keterangan: m.keterangan.trim() || null,
      }, { onConflict: 'id_karyawan,tanggal' }));
      if (!error && m.izinId) ({ error } = await supabase.from('izin_harian').delete().eq('id', m.izinId));
    } else {
      ({ error } = await supabase.from('izin_harian').upsert({
        id_karyawan: m.kar.id, tanggal: m.tanggal, jenis: m.jenis,
        keterangan: m.keterangan.trim(), status_approval: 'Disetujui',
      }, { onConflict: 'id_karyawan,tanggal' }));
      if (!error && m.absensiId) ({ error } = await supabase.from('absensi').delete().eq('id', m.absensiId));
    }
    setLoading(false);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`Absensi ${m.kar.nama_lengkap} untuk ${formatTanggal(m.tanggal)} tersimpan.`);
    setShowManual(false);
  };

  const kosongkanManual = async () => {
    const m = manual;
    if (!m.absensiId && !m.izinId) return;
    const ok = await konfirmasi({
      judul: `Kosongkan data ${formatTanggal(m.tanggal)}?`,
      pesan: `Semua catatan ${m.kar.nama_lengkap} di tanggal ini terhapus. Kalau tanggal ini hari kerja, statusnya jadi Bolos.`,
      tombolYa: 'Kosongkan', nada: 'bahaya',
    });
    if (!ok) return;
    setLoading(true);
    const r1 = m.absensiId ? await supabase.from('absensi').delete().eq('id', m.absensiId) : {};
    const r2 = m.izinId ? await supabase.from('izin_harian').delete().eq('id', m.izinId) : {};
    setLoading(false);
    if (r1.error || r2.error) { toast(pesanError(r1.error || r2.error), 'gagal'); return; }
    toast(`Data ${m.kar.nama_lengkap} di ${formatTanggal(m.tanggal)} sudah dikosongkan.`);
    setShowManual(false);
  };

  const getStyleInput = (isError) => `w-full px-3 py-2 border rounded-lg mt-1 outline-none transition-colors text-sm ${isError ? 'border-rose-500 bg-rose-50 focus:ring-1 focus:ring-rose-500' : 'border-slate-200 bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400'}`;
  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Karyawan & Akses</h1>
          <p className="text-slate-500 text-sm mt-1">Struktur: setiap Marketing di bawah 1 Business Manager (Backoffice).</p>
        </div>
        <button onClick={bukaTambah} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Tambah Karyawan
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 min-w-[760px]">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Profil & Akun</th>
                <th className="px-6 py-4 font-semibold">Struktur</th>
                <th className="px-6 py-4 font-semibold">Status Auth</th>
                <th className="px-6 py-4 font-semibold text-right">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {karyawan.map((kar) => {
                const dept = namaDept(kar);
                const bawahan = bawahanOf(kar.id);
                const atasan = karById[kar.id_atasan];
                return (
                  <tr key={kar.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{kar.nama_lengkap}</p>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{kar.nip} | Username: {kar.username}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2.5 py-1 text-[10px] font-bold rounded border tracking-wide ${dept === 'Marketing' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : dept === 'Backoffice' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        {dept || 'Tanpa Departemen'}{kar.jabatan && kar.jabatan !== dept ? ` · ${kar.jabatan}` : ''}
                      </span>
                      {dept === 'Marketing' && (
                        <p className={`text-xs mt-1.5 ${atasan ? 'text-slate-500' : 'text-rose-600 font-semibold'}`}>
                          {atasan ? `Atasan: ${atasan.nama_lengkap}` : 'Belum punya atasan. Klik edit untuk memilih.'}
                        </p>
                      )}
                      {kar.jabatan === 'Business Manager' && (
                        <p className="text-xs mt-1.5 text-slate-500">Membawahi {bawahan.length} Marketing</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {!kar.is_approved ? (
                        <span className="px-2 py-1 bg-amber-50 text-amber-700 font-semibold rounded border border-amber-200 text-xs">Menunggu Approve</span>
                      ) : kar.device_id ? (
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 font-semibold rounded border border-blue-200 text-xs flex items-center gap-1 w-max">
                          <Smartphone className="w-3 h-3" /> HP Tertaut
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Belum Login</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {!kar.is_approved && (<button onClick={() => aksiApprove(kar)} className="p-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg" title="Setujui akun"><Check className="w-4 h-4" /></button>)}
                        <button onClick={() => bukaEdit(kar)} className="p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg" title="Edit, pindah tim, atau promosi"><Edit2 className="w-4 h-4" /></button>
                        {bawahan.length > 0 && (<button onClick={() => bukaTransfer(kar)} className="p-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 rounded-lg" title="Pindahkan bawahan"><Users className="w-4 h-4" /></button>)}
                        <button onClick={() => bukaRiwayat(kar)} className="p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg" title="Riwayat struktur"><History className="w-4 h-4" /></button>
                        <button onClick={() => muatManual(kar, tanggalWIB())} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 rounded-lg" title="Input absen manual"><Clock className="w-4 h-4" /></button>
                        <button onClick={() => aksiResetSandi(kar)} className="p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg" title="Reset sandi ke admin123"><KeyRound className="w-4 h-4" /></button>
                        {kar.device_id && (<button onClick={() => aksiKick(kar)} className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 rounded-lg" title="Lepas HP"><Trash2 className="w-4 h-4" /></button>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL TAMBAH / EDIT KARYAWAN */}
      {showModal && (
        <Modal judul={editKar ? 'Edit Karyawan' : 'Tambah Karyawan'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSimpanKaryawan} className="p-6 space-y-5">
            <div>
              <label className="text-sm font-semibold text-slate-700">Departemen <span className="text-rose-500">*</span></label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {['Marketing', 'Backoffice'].map(d => (
                  <button type="button" key={d} onClick={() => { setForm({ ...form, dept: d, id_atasan: d === 'Marketing' ? form.id_atasan : '', jabatan: d === 'Backoffice' ? (form.jabatan === 'Marketing' ? '' : form.jabatan) : '' }); setErrorsKar({}); }}
                    className={`py-2 rounded-lg border text-sm font-bold transition-colors ${form.dept === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{d}</button>
                ))}
              </div>
              <ErrText msg={errorsKar.dept} />
            </div>

            {form.dept === 'Marketing' && (
              <div>
                <label className="text-sm font-semibold text-slate-700">Atasan (Business Manager) <span className="text-rose-500">*</span></label>
                <select value={form.id_atasan} onChange={e => { setForm({ ...form, id_atasan: e.target.value }); setErrorsKar({ ...errorsKar, id_atasan: null }); }} className={getStyleInput(errorsKar.id_atasan)}>
                  <option value="">-- Pilih Business Manager --</option>
                  {daftarBM.filter(b => b.id !== editKar?.id).map(b => <option key={b.id} value={b.id}>{b.nama_lengkap}</option>)}
                </select>
                {daftarBM.length === 0 && <p className="text-[11px] text-amber-600 mt-1">Belum ada Business Manager. Tambahkan dulu karyawan Backoffice dengan jabatan Business Manager.</p>}
                <ErrText msg={errorsKar.id_atasan} />
              </div>
            )}

            {form.dept === 'Backoffice' && (
              <div>
                <label className="text-sm font-semibold text-slate-700">Jabatan <span className="text-rose-500">*</span></label>
                <select value={form.jabatan} onChange={e => { setForm({ ...form, jabatan: e.target.value }); setErrorsKar({ ...errorsKar, jabatan: null }); }} className={getStyleInput(errorsKar.jabatan)}>
                  <option value="">-- Pilih Jabatan --</option>
                  {JABATAN_BACKOFFICE.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
                <ErrText msg={errorsKar.jabatan} />
              </div>
            )}

            <div>
              <label className="text-sm font-semibold text-slate-700">Nama Lengkap <span className="text-rose-500">*</span></label>
              <input type="text" value={form.nama_lengkap} onChange={e => { setForm({ ...form, nama_lengkap: e.target.value }); setErrorsKar({ ...errorsKar, nama_lengkap: null }); }} className={getStyleInput(errorsKar.nama_lengkap)} placeholder="Contoh: Aris Wijaya" />
              <ErrText msg={errorsKar.nama_lengkap} />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">NIP (Otomatis)</label>
                <input type="text" value={editKar ? editKar.nip : 'KR' + tanggalWIB().slice(2, 4) + '####'} disabled className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-sm cursor-not-allowed font-mono shadow-inner" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Username (Otomatis)</label>
                <input type="text" value={editKar ? editKar.username : 'sama dengan NIP'} disabled className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-sm cursor-not-allowed font-mono shadow-inner" />
              </div>
            </div>

            {perubahan && (
              <div className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium flex items-center gap-2">
                <IconPerubahan className="w-4 h-4 shrink-0" /> {perubahan.teks}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors">Batal</button>
              <button type="submit" disabled={loading} className="px-6 py-2 text-white font-medium bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">{loading ? 'Menyimpan...' : (editKar ? 'Simpan Perubahan' : 'Daftarkan Karyawan')}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL TRANSFER BAWAHAN */}
      {transfer && (
        <Modal judul={`Pindahkan bawahan ${transfer.dari.nama_lengkap}`} onClose={() => setTransfer(null)}>
          <div className="p-6 space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Pilih Marketing yang dipindah</p>
              <ul className="space-y-1 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2">
                {bawahanOf(transfer.dari.id).map(k => (
                  <li key={k.id}>
                    <label className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={transfer.ids.includes(k.id)} onChange={e => setTransfer({ ...transfer, ids: e.target.checked ? [...transfer.ids, k.id] : transfer.ids.filter(x => x !== k.id) })} />
                      {k.nama_lengkap} <span className="text-xs text-slate-400 font-mono">{k.nip}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Ke Business Manager</label>
              <select value={transfer.ke} onChange={e => setTransfer({ ...transfer, ke: e.target.value })} className={getStyleInput(false)}>
                <option value="">-- Pilih Tujuan --</option>
                {daftarBM.filter(b => b.id !== transfer.dari.id).map(b => <option key={b.id} value={b.id}>{b.nama_lengkap}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setTransfer(null)} className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200">Batal</button>
              <button onClick={simpanTransfer} disabled={loading || !transfer.ke || transfer.ids.length === 0} className="px-6 py-2 text-white font-medium bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">{loading ? 'Memindahkan...' : 'Pindahkan'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL RIWAYAT STRUKTUR */}
      {riwayat && (
        <Modal judul={`Riwayat Struktur ${riwayat.kar.nama_lengkap}`} onClose={() => setRiwayat(null)} lebar="max-w-lg">
          <div className="p-6">
            {riwayat.rows.length === 0 ? <p className="text-sm text-slate-500 italic">Belum ada riwayat.</p> : (
              <ol className="space-y-3">
                {riwayat.rows.map(r => (
                  <li key={r.id} className={`p-3 rounded-lg border ${r.berlaku_sampai ? 'border-slate-200 bg-white' : 'border-blue-200 bg-blue-50'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-700">{r.jenis_perubahan}</span>
                      {!r.berlaku_sampai && <span className="text-[10px] font-bold text-blue-700">AKTIF</span>}
                    </div>
                    <p className="text-sm text-slate-900 mt-1">{deptById[r.id_departemen] || '-'} · {r.jabatan || '-'}{r.id_atasan ? ` · Atasan: ${karById[r.id_atasan]?.nama_lengkap || '(dihapus)'}` : ''}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{formatTanggalWaktu(r.berlaku_mulai)} sampai {r.berlaku_sampai ? formatTanggalWaktu(r.berlaku_sampai) : 'sekarang'}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Modal>
      )}

      {/* MODAL INPUT MANUAL */}
      {showManual && manual && (
        <Modal judul={`Input Manual: ${manual.kar.nama_lengkap}`} onClose={() => setShowManual(false)}>
          <form onSubmit={simpanManual} className="p-6 space-y-4">
            <div className="px-3 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-xs font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" /> {manual.info}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Tanggal <span className="text-rose-500">*</span></label>
              <input type="date" value={manual.tanggal} onChange={e => e.target.value && muatManual(manual.kar, e.target.value)} className={getStyleInput(errorsManual.tanggal)} />
              <ErrText msg={errorsManual.tanggal} />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Jenis <span className="text-rose-500">*</span></label>
              <select value={manual.jenis} onChange={e => { setManual({ ...manual, jenis: e.target.value }); setErrorsManual({}); }} className={getStyleInput(false)}>
                {JENIS_MANUAL.map(j => <option key={j.v} value={j.v}>{j.l}</option>)}
              </select>
            </div>

            {manual.jenis === 'Hadir' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-slate-700">Jam Masuk</label>
                    <input type="time" value={manual.masuk} onChange={e => setManual({ ...manual, masuk: e.target.value })} className={getStyleInput(errorsManual.masuk)} />
                    <ErrText msg={errorsManual.masuk} />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-700">Jam Pulang</label>
                    <input type="time" value={manual.keluar} onChange={e => setManual({ ...manual, keluar: e.target.value })} className={getStyleInput(errorsManual.keluar)} />
                    <ErrText msg={errorsManual.keluar} />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">Status dihitung otomatis: lewat 08:00 = Terlambat, hanya jam pulang (tanpa jam masuk) = Terlambat. Format 24 jam WIB.</p>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Alasan Input Manual</label>
                  <input type="text" placeholder="Contoh: HP rusak / kamera tidak bisa diakses" value={manual.keterangan} onChange={e => setManual({ ...manual, keterangan: e.target.value })} className={getStyleInput(false)} />
                </div>
              </>
            ) : (
              <div>
                <label className="text-sm font-semibold text-slate-700">Keterangan <span className="text-rose-500">*</span></label>
                <textarea rows="3" placeholder="Contoh: Demam, ada surat dokter" value={manual.keterangan} onChange={e => { setManual({ ...manual, keterangan: e.target.value }); setErrorsManual({ ...errorsManual, keterangan: null }); }} className={getStyleInput(errorsManual.keterangan)}></textarea>
                <ErrText msg={errorsManual.keterangan} />
              </div>
            )}

            <div className="flex justify-between gap-3 border-t border-slate-100 pt-5 mt-2">
              <button type="button" onClick={kosongkanManual} disabled={loading || (!manual.absensiId && !manual.izinId)} className="px-3 py-2 text-rose-600 text-sm font-medium rounded-lg hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent">Kosongkan</button>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowManual(false)} className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors">Batal</button>
                <button type="submit" disabled={loading} className="px-6 py-2 text-white font-medium bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors">{loading ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
