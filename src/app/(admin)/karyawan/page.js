'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/utils/supabase/client';
import { Plus, Search, X, Check, Trash2, KeyRound, Smartphone, Clock, Edit2, History, Users, ArrowRightLeft, TrendingUp, UserX, UserCheck, MapPin, PenLine, Wallet } from 'lucide-react';
import { tanggalWIB, jamMenitWIB, formatTanggal, formatTanggalWaktu } from '@/utils/waktu';
import { STATUS_KEHADIRAN, bandingTim } from '@/utils/kehadiran';
import { pesanError } from '@/utils/pesanError';
import { useFeedback } from '@/components/Feedback';
import { useUrutan, urutkan, KolomUrut } from '@/components/TabelSort';
import InputRupiah from '@/components/InputRupiah';
import PadTtd from '@/components/PadTtd';
import { formatRupiah } from '@/utils/rupiah';
import Modal from '@/components/Modal';
import InfoKaryawan from '@/components/InfoKaryawan';
import { useAkses } from '@/components/AksesAdmin';

const FORM_KOSONG = { nama_lengkap: '', dept: '', id_atasan: '', jabatan: '', id_lokasi: '', pakaiKhusus: false, allowance_khusus: null };
// Kolom password tidak bisa dibaca lewat API, jadi kolom disebut satu per satu
const KOLOM_KARYAWAN = 'id, nip, nama_lengkap, username, jabatan, id_departemen, id_atasan, id_lokasi, device_id, is_approved, is_aktif, nonaktif_at, created_at, allowance_khusus';
// Sama dengan tabel master_shift di database
const SHIFT = [
  { no: 1, label: 'Shift 1 (07.00–15.00)' },
  { no: 2, label: 'Shift 2 (12.00–20.00)' },
];
// Alasan input manual (jenis Hadir). "Lainnya" = isi sendiri.
const ALASAN_MANUAL = [
  'Appointment dengan client',
  'HP / kamera rusak',
  'Lupa scan absen',
  'Kendala sinyal / aplikasi error',
  'Dinas luar / training / event',
];
const LAINNYA = 'Lainnya (tulis sendiri)';
// Pilih "Appointment dengan client" -> jam masuk langsung diisi 09:00 (tetap bisa diubah). Karyawan shift tidak ikut.
const ALASAN_APPOINTMENT = 'Appointment dengan client';
const JAM_APPOINTMENT = '09:00';
const JENIS_MANUAL = [
  { v: 'Hadir', l: 'Hadir (input jam masuk / pulang)' },
  { v: 'Izin', l: 'Izin (kepentingan pribadi)' },
  { v: 'Sakit', l: 'Sakit' },
  { v: 'Cuti', l: 'Cuti' },
];

// Didefinisikan di luar komponen agar input tidak kehilangan fokus saat re-render
const ErrText = ({ msg }) => msg ? <p className="text-rose-600 text-xs mt-1">{msg}</p> : null;

// Tanda tangan karyawan (admin bisa buat/ganti pakai mouse). Disimpan langsung, terpisah dari tombol Simpan form.
function BagianTtd({ idKaryawan, nama }) {
  const { boleh } = useAkses();
  const { toast, konfirmasi } = useFeedback();
  const [ttd, setTtd] = useState(undefined); // undefined = memuat
  const [diubah, setDiubah] = useState(null);
  const [buat, setBuat] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let batal = false;
    (async () => {
      const { data, error } = await supabase.rpc('fn_ttd_karyawan', { p_id_karyawan: idKaryawan });
      if (batal) return;
      if (error) { toast(pesanError(error), 'gagal'); setTtd(null); return; }
      setTtd(data?.ttd || null); setDiubah(data?.diubah_at || null);
    })();
    return () => { batal = true; };
  }, [idKaryawan, toast]);

  const simpan = async (gambar) => {
    setSibuk(true);
    const { error } = await supabase.rpc('fn_ttd_karyawan_simpan', { p_id_karyawan: idKaryawan, p_ttd: gambar });
    setSibuk(false);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    setTtd(gambar); setDiubah(gambar ? new Date().toISOString() : null); setBuat(false);
    toast(gambar ? `Tanda tangan ${nama} tersimpan.` : `Tanda tangan ${nama} dihapus.`);
  };

  const hapus = async () => {
    const ok = await konfirmasi({ judul: `Hapus tanda tangan ${nama}?`, pesan: 'Slip allowance yang sudah disetujui tetap memakai tanda tangan lama. Untuk approve berikutnya, karyawan perlu membuat tanda tangan lagi.', tombolYa: 'Hapus', nada: 'bahaya' });
    if (ok) simpan(null);
  };

  return (
    <div className="pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5"><PenLine className="w-4 h-4 text-slate-400" />Tanda tangan</p>
        {!buat && ttd !== undefined && (
          <div className="flex gap-1">
            {ttd && boleh('karyawan', 'hapus') && <button type="button" onClick={hapus} disabled={sibuk} className="px-2 py-1 text-xs font-medium text-rose-600 rounded hover:bg-rose-50">Hapus</button>}
            {boleh('karyawan', 'ubah') && <button type="button" onClick={() => setBuat(true)} className="px-2 py-1 text-xs font-semibold text-blue-600 rounded hover:bg-blue-50">{ttd ? 'Ganti' : 'Buat'}</button>}
          </div>
        )}
      </div>
      {buat ? (
        <PadTtd sibuk={sibuk} onSimpan={simpan} onBatal={() => setBuat(false)} />
      ) : ttd === undefined ? (
        <p className="text-xs text-slate-400">Memuat...</p>
      ) : ttd ? (
        <div className="flex items-end gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ttd} alt={`Tanda tangan ${nama}`} className="h-16 max-w-[220px] object-contain bg-slate-50 border border-slate-200 rounded-lg p-1" />
          {diubah && <p className="text-[11px] text-slate-400">Diubah {formatTanggalWaktu(diubah)}</p>}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Belum ada. Karyawan bisa membuatnya sendiri dari HP saat menyetujui allowance, atau buat di sini pakai mouse.</p>
      )}
    </div>
  );
}

// Baris tombol di bawah popup: selalu terlihat walau isi form panjang
const FooterModal = ({ children, className = 'justify-end' }) => (
  <div className={`sticky bottom-0 z-10 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 mt-4 px-5 sm:px-6 py-3 bg-white border-t border-slate-100 flex flex-wrap items-center gap-3 ${className}`}>{children}</div>
);

export default function KaryawanPage() {
  const [karyawan, setKaryawan] = useState([]);
  const [departemen, setDepartemen] = useState([]);
  const [jabatanList, setJabatanList] = useState([]);
  const [lokasiList, setLokasiList] = useState([]);
  const [lihatNonaktif, setLihatNonaktif] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast, konfirmasi, info } = useFeedback();
  const { boleh } = useAkses();
  const bisa = { tambah: boleh('karyawan', 'tambah'), ubah: boleh('karyawan', 'ubah'), hapus: boleh('karyawan', 'hapus') };
  const [cari, setCari] = useState('');
  const [filterTim, setFilterTim] = useState('semua');   // chip divisi/tim
  const [urut, gantiUrut] = useUrutan({ kunci: 'nama', arah: 'asc' });

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
  const [idInfo, setIdInfo] = useState(null);     // popup info karyawan

  const [versi, setVersi] = useState(0);
  const fetchData = () => setVersi(v => v + 1); // muat ulang data

  useEffect(() => {
    let batal = false;
    (async () => {
      const [{ data: deptData }, { data: jabData }, { data: lokData }, { data: karData, error }] = await Promise.all([
        supabase.from('master_departemen').select('id, nama_departemen, allowance_flat'),
        supabase.from('master_jabatan').select('nama, id_departemen, bisa_jadi_atasan, allowance, pakai_shift').order('nama'),
        supabase.from('master_lokasi').select('id, nama_cabang').order('nama_cabang'),
        supabase.from('karyawan').select(KOLOM_KARYAWAN).order('created_at', { ascending: false }),
      ]);
      if (batal) return;
      if (error) toast(`Data karyawan belum bisa dimuat. ${pesanError(error)}`, 'gagal');
      setDepartemen(deptData || []); setJabatanList(jabData || []); setLokasiList(lokData || []); setKaryawan(karData || []);
    })();
    return () => { batal = true; };
  }, [versi, toast]);

  // =================== HELPER STRUKTUR ===================
  const deptById = useMemo(() => Object.fromEntries(departemen.map(d => [d.id, d.nama_departemen])), [departemen]);
  const deptIdByName = useMemo(() => Object.fromEntries(departemen.map(d => [d.nama_departemen, d.id])), [departemen]);
  const karById = useMemo(() => Object.fromEntries(karyawan.map(k => [k.id, k])), [karyawan]);
  const namaDept = (k) => deptById[k?.id_departemen] || '';
  const bawahanOf = (id) => karyawan.filter(k => k.id_atasan === id && k.is_aktif);
  const lokasiById = useMemo(() => Object.fromEntries(lokasiList.map(l => [l.id, l.nama_cabang])), [lokasiList]);
  const jabatanAtasan = useMemo(() => new Set(jabatanList.filter(j => j.bisa_jadi_atasan).map(j => j.nama)), [jabatanList]);
  const jabatanDept = (dept) => jabatanList.filter(j => j.id_departemen === deptIdByName[dept]);
  const jumlahAktif = karyawan.filter(k => k.is_aktif).length;
  const jumlahNonaktif = karyawan.length - jumlahAktif;
  // Kelompok divisi/tim tiap karyawan: Backoffice, "Tim <kepala tim>" untuk Marketing, atau Marketing tanpa atasan
  const timKar = useMemo(() => {
    const peta = {};
    for (const k of karyawan) {
      const dept = deptById[k.id_departemen] || null;
      let nama = dept || 'Tanpa departemen';
      if (dept === 'Marketing') {
        const kepala = jabatanAtasan.has(k.jabatan) ? k : karById[k.id_atasan];
        nama = kepala ? `Tim ${kepala.nama_lengkap}` : 'Marketing tanpa atasan';
      }
      peta[k.id] = { key: `${dept || ''}|${nama}`, nama, divisi: dept };
    }
    return peta;
  }, [karyawan, deptById, karById, jabatanAtasan]);
  // Chip filter divisi/tim (dengan jumlah orang) sesuai tab Aktif/Nonaktif
  const opsiTim = useMemo(() => {
    const peta = new Map();
    for (const k of karyawan) {
      if (lihatNonaktif ? k.is_aktif : !k.is_aktif) continue;
      const t = timKar[k.id];
      if (!peta.has(t.key)) peta.set(t.key, { ...t, n: 0 });
      peta.get(t.key).n++;
    }
    return [...peta.values()].sort(bandingTim);
  }, [karyawan, timKar, lihatNonaktif]);
  const timAktif = opsiTim.some(t => t.key === filterTim) ? filterTim : 'semua';
  // Pencarian & urutan tabel
  const daftarTampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const namaAtasan = (k) => karById[k.id_atasan]?.nama_lengkap || '';
    const sesuaiStatus = karyawan.filter(k => (lihatNonaktif ? !k.is_aktif : k.is_aktif) && (timAktif === 'semua' || timKar[k.id]?.key === timAktif));
    const rows = q ? sesuaiStatus.filter(k => [k.nama_lengkap, k.nip, k.username, namaAtasan(k), k.jabatan, lokasiById[k.id_lokasi]].some(v => v?.toLowerCase().includes(q))) : sesuaiStatus;
    return urutkan(rows, urut, {
      nama: k => k.nama_lengkap,
      struktur: k => `${deptById[k.id_departemen] || 'zzz'} ${k.jabatan || ''} ${namaAtasan(k)}`,
      akun: k => (!k.is_approved ? 0 : k.device_id ? 1 : 2),
    });
  }, [karyawan, cari, urut, karById, deptById, lokasiById, lihatNonaktif, timAktif, timKar]);

  // Yang boleh membawahi Marketing: job role tercentang "bisa jadi atasan" (Business Manager, Branch Manager, Vice President)
  const bisaMembawahi = (k) => jabatanAtasan.has(k.jabatan);
  const daftarBM = karyawan.filter(k => bisaMembawahi(k) && k.is_approved && k.is_aktif);
  const labelAtasan = (b) => `${b.nama_lengkap} · ${b.jabatan}`;
  // Marketing dengan job role "bisa jadi atasan" (Business Manager) = kepala tim, tidak punya atasan
  const formKepalaTim = form.dept === 'Marketing' && jabatanAtasan.has(form.jabatan);
  // Departemen dengan allowance flat (nominal dari job role / allowance khusus); lainnya diisi manual tiap bulan
  const deptFlat = !!departemen.find(d => d.nama_departemen === form.dept)?.allowance_flat;

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

  const aksiNonaktif = async (kar) => {
    const ok = await konfirmasi({
      judul: `Nonaktifkan ${kar.nama_lengkap}?`,
      pesan: `${kar.nama_lengkap} langsung keluar dari semua HP dan tidak bisa login lagi. Riwayat absensinya tetap tersimpan. Kamu bisa mengaktifkannya kembali dari tab Nonaktif.`,
      tombolYa: 'Nonaktifkan', nada: 'bahaya',
    });
    if (!ok) return;
    const { error } = await supabase.from('karyawan').update({ is_aktif: false }).eq('id', kar.id);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`${kar.nama_lengkap} sudah dinonaktifkan.`); fetchData();
  };

  const aksiAktifkan = async (kar) => {
    const ok = await konfirmasi({
      judul: `Aktifkan lagi ${kar.nama_lengkap}?`,
      pesan: `${kar.nama_lengkap} muncul lagi di daftar karyawan dan rekap kehadiran, dan bisa login dengan sandi lamanya.`,
      tombolYa: 'Aktifkan',
    });
    if (!ok) return;
    const { error } = await supabase.from('karyawan').update({ is_aktif: true }).eq('id', kar.id);
    if (error) { toast(pesanError(error), 'gagal'); return; }
    toast(`${kar.nama_lengkap} aktif kembali.`); fetchData();
  };

  // =================== TAMBAH / EDIT KARYAWAN ===================
  const bukaTambah = () => { setEditKar(null); setForm({ ...FORM_KOSONG, id_lokasi: (lokasiList.find(l => l.nama_cabang?.trim().toLowerCase() === 'surabaya') || lokasiList[0])?.id || '' }); setErrorsKar({}); setShowModal(true); };

  const bukaEdit = (kar) => {
    setEditKar(kar);
    setForm({ nama_lengkap: kar.nama_lengkap, dept: namaDept(kar), id_atasan: kar.id_atasan || '', jabatan: kar.jabatan || '', id_lokasi: kar.id_lokasi || '',
      pakaiKhusus: kar.allowance_khusus !== null && kar.allowance_khusus !== undefined, allowance_khusus: kar.allowance_khusus ?? null });
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
    if (formKepalaTim && !jabatanAtasan.has(editKar.jabatan)) return {
      icon: TrendingUp, teks: `Promosi jadi ${form.jabatan}. ${editKar.id_atasan ? `Keluar dari tim ${atasanLama}, ` : ''}tidak punya atasan dan bisa membawahi Marketing.`,
      judul: `Promosikan ${nama} jadi ${form.jabatan}?`,
      pesan: `${nama} tidak lagi punya atasan${editKar.id_atasan ? ` (keluar dari tim ${atasanLama})` : ''} dan bisa dipilih sebagai atasan karyawan Marketing lain. Riwayat struktur mencatat promosi ini.`,
      tombolYa: 'Promosikan',
    };
    if (form.dept === 'Marketing' && !formKepalaTim && jabatanAtasan.has(editKar.jabatan) && form.id_atasan) return {
      icon: ArrowRightLeft, teks: `Jadi ${form.jabatan}, masuk tim ${atasanBaru}.`,
      judul: `Ubah ${nama} jadi ${form.jabatan}?`,
      pesan: `${nama} tidak lagi membawahi Marketing dan masuk tim ${atasanBaru}. Kalau masih punya bawahan, pindahkan dulu bawahannya lewat tombol Pindahkan bawahan.`,
      tombolYa: 'Simpan',
    };
    if (form.dept === 'Marketing' && !formKepalaTim && (editKar.id_atasan || '') !== form.id_atasan && form.id_atasan) return {
      icon: ArrowRightLeft, teks: `Atasan berubah: ${atasanLama} → ${atasanBaru}.`,
      judul: `Pindahkan ${nama} ke tim ${atasanBaru}?`,
      pesan: editKar.id_atasan
        ? `${nama} keluar dari tim ${atasanLama} dan masuk tim ${atasanBaru}. Riwayat struktur mencatat perpindahan ini.`
        : `${nama} belum punya atasan. Setelah disimpan, ${atasanBaru} jadi atasannya dan riwayat struktur mencatatnya.`,
      tombolYa: 'Simpan',
    };
    if ((editKar.jabatan || '') !== form.jabatan && form.jabatan) return {
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
    if (form.dept === 'Marketing' && form.jabatan && !formKepalaTim && !form.id_atasan) errs.id_atasan = 'Pilih atasan (Business Manager).';
    if (editKar && bawahanOf(editKar.id).length > 0 && !jabatanAtasan.has(form.jabatan))
      errs.jabatan = `Masih membawahi ${bawahanOf(editKar.id).length} Marketing. Pindahkan dulu bawahannya lewat tombol Pindahkan bawahan.`;
    if (form.dept && !form.jabatan) errs.jabatan = 'Pilih job role.';
    if (!form.id_lokasi) errs.id_lokasi = 'Pilih lokasi kerja.';
    if (deptFlat && form.pakaiKhusus && form.allowance_khusus === null) errs.allowance = 'Isi nominal allowance khusus, atau hilangkan centangnya.';
    if (Object.keys(errs).length > 0) { setErrorsKar(errs); return; }
    if (perubahan && !(await konfirmasi({ judul: perubahan.judul, pesan: perubahan.pesan, tombolYa: perubahan.tombolYa }))) return;

    setLoading(true);
    const payload = {
      nama_lengkap: form.nama_lengkap.trim(),
      id_departemen: deptIdByName[form.dept],
      id_atasan: form.dept === 'Marketing' && !formKepalaTim ? form.id_atasan : null,
      jabatan: form.jabatan,
      id_lokasi: form.id_lokasi,
      allowance_khusus: form.pakaiKhusus ? form.allowance_khusus : null,
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
      shift: abs?.shift ? String(abs.shift) : '',
      pakaiShift: !!jabatanList.find(j => j.nama === kar.jabatan)?.pakai_shift,
      keluar: jamMenitWIB(abs?.waktu_keluar) || '',
      keterangan: izin?.keterangan || abs?.keterangan || '',
      absensiId: abs?.id || null,
      izinId: izin?.id || null,
      info: abs ? `Sudah ada absensi (${STATUS_KEHADIRAN[abs.status]?.label || abs.status})${abs.updated_at ? `, terakhir diubah ${formatTanggalWaktu(abs.updated_at)}` : ''}.`
          : izin ? `Tercatat ${izin.jenis} (${izin.status_approval || 'Pending'}).` : 'Belum ada data. Kalau tanggal ini hari kerja dan tetap kosong, statusnya Alpha.',
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
      if (m.pakaiShift && m.masuk && !m.shift) errs.shift = 'Pilih shift supaya status telat dihitung dari jam shift yang benar.';
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
        shift: m.pakaiShift && m.shift ? Number(m.shift) : null,
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
      pesan: `Semua catatan ${m.kar.nama_lengkap} di tanggal ini terhapus. Kalau tanggal ini hari kerja, statusnya jadi Alpha.`,
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

  const getStyleInput = (isError) => `w-full px-3 py-2 border rounded-lg mt-1 outline-none transition-colors text-base sm:text-sm ${isError ? 'border-rose-500 bg-rose-50 focus:ring-1 focus:ring-rose-500' : 'border-slate-200 bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400'}`;
  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Karyawan & Akses</h1>
          <div className="inline-flex p-1 bg-slate-100 rounded-lg text-sm" role="tablist" aria-label="Status karyawan">
            {[{ v: false, l: 'Aktif', n: jumlahAktif }, { v: true, l: 'Nonaktif', n: jumlahNonaktif }].map(t => (
              <button key={t.l} role="tab" aria-selected={lihatNonaktif === t.v} onClick={() => setLihatNonaktif(t.v)}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${lihatNonaktif === t.v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t.l} <span className="text-xs text-slate-400 tabular-nums">{t.n}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <label className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="search" value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama, NIP, atau atasan"
              className="w-full sm:w-64 pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none" />
          </label>
          {bisa.tambah && <button onClick={bukaTambah} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Tambah Karyawan
          </button>}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {opsiTim.length > 0 && (
          <div className="flex gap-1.5 px-4 py-3 border-b border-slate-100 overflow-x-auto scrollbar-hide sm:flex-wrap" role="tablist" aria-label="Divisi / tim">
            {[{ key: 'semua', nama: 'Semua', n: lihatNonaktif ? jumlahNonaktif : jumlahAktif }, ...opsiTim].map(t => {
              const aktif = timAktif === t.key;
              const titik = t.divisi === 'Marketing' ? (t.nama === 'Marketing tanpa atasan' ? 'bg-rose-500' : 'bg-emerald-500') : t.divisi === 'Backoffice' ? 'bg-blue-500' : 'bg-rose-500';
              return (
                <button key={t.key} role="tab" aria-selected={aktif} onClick={() => setFilterTim(t.key)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border font-semibold whitespace-nowrap transition-colors ${aktif ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                  {t.key !== 'semua' && <span className={`w-2 h-2 rounded-full ${aktif ? 'bg-white' : titik}`} />}
                  {t.nama}
                  <span className={`text-xs tabular-nums ${aktif ? 'text-white/70' : 'text-slate-400'}`}>{t.n}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 min-w-[760px]">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-xs">
              <tr>
                <KolomUrut kunci="nama" urut={urut} onUrut={gantiUrut}>Karyawan</KolomUrut>
                <KolomUrut kunci="struktur" urut={urut} onUrut={gantiUrut}>Struktur</KolomUrut>
                <KolomUrut kunci="akun" urut={urut} onUrut={gantiUrut}>Status Akun</KolomUrut>
                <th className="px-6 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {daftarTampil.length === 0 && (
                <tr><td colSpan="4" className="px-6 py-16 text-center text-slate-500">{cari ? `Tidak ada karyawan yang cocok dengan "${cari}"${timAktif !== 'semua' ? ' di kelompok ini' : ''}.` : lihatNonaktif ? 'Tidak ada karyawan nonaktif.' : 'Belum ada karyawan.'}</td></tr>
              )}
              {daftarTampil.map((kar) => {
                const dept = namaDept(kar);
                const bawahan = bawahanOf(kar.id);
                const atasan = karById[kar.id_atasan];
                return (
                  <tr key={kar.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <button type="button" onClick={() => setIdInfo(kar.id)} className="font-bold text-slate-900 hover:text-blue-700 hover:underline underline-offset-2 text-left" title="Lihat info & rekap absensi">{kar.nama_lengkap}</button>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{kar.nip} | Username: {kar.username}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2.5 py-1 text-[10px] font-bold rounded border tracking-wide ${dept === 'Marketing' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : dept === 'Backoffice' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        {dept || 'Tanpa Departemen'}{kar.jabatan && kar.jabatan !== dept ? ` · ${kar.jabatan}` : ''}
                      </span>
                      {dept === 'Marketing' && !bisaMembawahi(kar) && (
                        <p className={`text-xs mt-1.5 ${atasan ? 'text-slate-500' : 'text-rose-600 font-semibold'}`}>
                          {atasan ? `Atasan: ${atasan.nama_lengkap}` : 'Belum punya atasan. Klik edit untuk memilih.'}
                        </p>
                      )}
                      {bisaMembawahi(kar) && (
                        <p className="text-xs mt-1.5 text-slate-500">Membawahi {bawahan.length} Marketing</p>
                      )}
                      {kar.id_lokasi && (
                        <p className="text-xs mt-1 text-slate-500 inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{lokasiById[kar.id_lokasi]}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {!kar.is_aktif ? (
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 font-semibold rounded border border-slate-200 text-xs">
                          Nonaktif{kar.nonaktif_at ? ` sejak ${formatTanggalWaktu(kar.nonaktif_at)}` : ''}
                        </span>
                      ) : !kar.is_approved ? (
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
                      {!kar.is_aktif ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => bukaRiwayat(kar)} className="p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg" title="Riwayat struktur"><History className="w-4 h-4" /></button>
                        {bisa.hapus && <button onClick={() => aksiAktifkan(kar)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-semibold"><UserCheck className="w-4 h-4" /> Aktifkan</button>}
                      </div>
                      ) : (
                      <div className="flex justify-end gap-2">
                        {bisa.ubah && !kar.is_approved && (<button onClick={() => aksiApprove(kar)} className="p-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg" title="Setujui akun"><Check className="w-4 h-4" /></button>)}
                        {bisa.ubah && <button onClick={() => bukaEdit(kar)} className="p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg" title="Edit, pindah tim, atau promosi"><Edit2 className="w-4 h-4" /></button>}
                        {bisa.ubah && bawahan.length > 0 && (<button onClick={() => bukaTransfer(kar)} className="p-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 rounded-lg" title="Pindahkan bawahan"><Users className="w-4 h-4" /></button>)}
                        <button onClick={() => bukaRiwayat(kar)} className="p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg" title="Riwayat struktur"><History className="w-4 h-4" /></button>
                        {bisa.ubah && <button onClick={() => muatManual(kar, tanggalWIB())} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 rounded-lg" title="Input absen manual"><Clock className="w-4 h-4" /></button>}
                        {bisa.ubah && <button onClick={() => aksiResetSandi(kar)} className="p-2 bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg" title="Reset sandi ke admin123"><KeyRound className="w-4 h-4" /></button>}
                        {bisa.ubah && kar.device_id && (<button onClick={() => aksiKick(kar)} className="p-2 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-100 rounded-lg" title="Lepas HP"><Smartphone className="w-4 h-4" /></button>)}
                        {bisa.hapus && <button onClick={() => aksiNonaktif(kar)} className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 rounded-lg" title="Nonaktifkan karyawan"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {karyawan.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-100 text-sm text-slate-500 tabular-nums">
            {`${daftarTampil.length} karyawan ${lihatNonaktif ? 'nonaktif' : 'aktif'}${timAktif !== 'semua' ? ` · ${opsiTim.find(t => t.key === timAktif)?.nama}` : ''}`}
          </div>
        )}
      </div>

      {idInfo && <InfoKaryawan id={idInfo} onClose={() => setIdInfo(null)} />}

      {/* MODAL TAMBAH / EDIT KARYAWAN */}
      {showModal && (
        <Modal judul={editKar ? `Edit Karyawan · ${editKar.nama_lengkap}` : 'Tambah Karyawan'} onClose={() => setShowModal(false)} lebar="sm:max-w-4xl">
          <form onSubmit={handleSimpanKaryawan} className="p-5 sm:p-6">
           {/* Baris atas: nama & lokasi. Lalu 2 kolom: struktur | akun & allowance. Dibuat ringkas supaya di laptop tidak perlu scroll. */}
           <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3.5">
            <div>
              <label className="text-sm font-semibold text-slate-700">Nama Lengkap <span className="text-rose-500">*</span></label>
              <input type="text" value={form.nama_lengkap} onChange={e => { setForm({ ...form, nama_lengkap: e.target.value }); setErrorsKar({ ...errorsKar, nama_lengkap: null }); }} className={getStyleInput(errorsKar.nama_lengkap)} placeholder="Contoh: Aris Wijaya" />
              <ErrText msg={errorsKar.nama_lengkap} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Lokasi Kerja <span className="text-rose-500">*</span></label>
              <select value={form.id_lokasi} onChange={e => { setForm({ ...form, id_lokasi: e.target.value }); setErrorsKar({ ...errorsKar, id_lokasi: null }); }} className={getStyleInput(errorsKar.id_lokasi)}>
                <option value="">-- Pilih Lokasi --</option>
                {lokasiList.map(l => <option key={l.id} value={l.id}>{l.nama_cabang}</option>)}
              </select>
              <ErrText msg={errorsKar.id_lokasi} />
            </div>
           </div>
           <div className="grid md:grid-cols-2 gap-x-6 gap-y-3.5 mt-3.5 pt-3.5 border-t border-slate-100">
            <div className="space-y-3.5">
            <div>
              <label className="text-sm font-semibold text-slate-700">Departemen <span className="text-rose-500">*</span></label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {['Marketing', 'Backoffice'].map(d => (
                  <button type="button" key={d} onClick={() => { const roles = jabatanDept(d); setForm({ ...form, dept: d, id_atasan: d === 'Marketing' ? form.id_atasan : '', jabatan: roles.some(r => r.nama === form.jabatan) ? form.jabatan : (roles.length === 1 ? roles[0].nama : '') }); setErrorsKar({}); }}
                    className={`py-2.5 rounded-lg border text-sm font-bold transition-colors ${form.dept === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{d}</button>
                ))}
              </div>
              <ErrText msg={errorsKar.dept} />
            </div>

            {form.dept && (
              <div>
                <label className="text-sm font-semibold text-slate-700">Job Role <span className="text-rose-500">*</span></label>
                <select value={form.jabatan} onChange={e => { setForm({ ...form, jabatan: e.target.value }); setErrorsKar({ ...errorsKar, jabatan: null }); }} className={getStyleInput(errorsKar.jabatan)}>
                  <option value="">-- Pilih Job Role --</option>
                  {jabatanDept(form.dept).map(j => <option key={j.nama} value={j.nama}>{j.nama}{j.bisa_jadi_atasan ? ' (bisa jadi atasan)' : ''}</option>)}
                </select>
                <ErrText msg={errorsKar.jabatan} />
              </div>
            )}

            {formKepalaTim && (
              <p className="px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                <b className="font-semibold">{form.jabatan}</b> adalah kepala tim: tidak punya atasan dan bisa membawahi karyawan Marketing lain.
              </p>
            )}

            {form.dept === 'Marketing' && !formKepalaTim && (
              <div>
                <label className="text-sm font-semibold text-slate-700">Atasan <span className="text-rose-500">*</span></label>
                <select value={form.id_atasan} onChange={e => { setForm({ ...form, id_atasan: e.target.value }); setErrorsKar({ ...errorsKar, id_atasan: null }); }} className={getStyleInput(errorsKar.id_atasan)}>
                  <option value="">-- Pilih Atasan --</option>
                  {daftarBM.filter(b => b.id !== editKar?.id).map(b => <option key={b.id} value={b.id}>{labelAtasan(b)}</option>)}
                </select>
                {daftarBM.length === 0 && <p className="text-[11px] text-amber-600 mt-1">Belum ada atasan. Tambahkan dulu karyawan dengan job role Business Manager.</p>}
                <ErrText msg={errorsKar.id_atasan} />
              </div>
            )}
            {editKar && <BagianTtd idKaryawan={editKar.id} nama={editKar.nama_lengkap} />}
            </div>

            <div className="space-y-3.5 md:border-l md:border-slate-100 md:pl-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">NIP (Otomatis)</label>
                <input type="text" value={editKar ? editKar.nip : 'GIFX' + tanggalWIB().slice(2, 4) + '####'} disabled className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-sm cursor-not-allowed font-mono shadow-inner" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Username (Otomatis)</label>
                <input type="text" value={editKar ? editKar.username : 'sama dengan NIP'} disabled className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 text-sm cursor-not-allowed font-mono shadow-inner" />
              </div>
            </div>

            {form.dept && !deptFlat && (
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1">
                <p className="text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5"><Wallet className="w-4 h-4 text-slate-400" />Allowance</p>
                <p className="text-xs text-slate-500">Allowance {form.dept} diisi manual tiap bulan di Rekap → Allowance.</p>
              </div>
            )}
            {deptFlat && (() => {
              const jab = jabatanList.find(j => j.nama === form.jabatan);
              return (
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <p className="text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5"><Wallet className="w-4 h-4 text-slate-400" />Allowance</p>
                  <p className="text-xs text-slate-500">
                    {jab ? <>Default job role {jab.nama}: <b className="text-slate-700">{jab.allowance ? formatRupiah(jab.allowance) : 'belum diisi'}</b>. Ubah di Master Data → Job Role.</> : 'Pilih job role untuk melihat allowance default.'}
                  </p>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={form.pakaiKhusus} onChange={e => { setForm({ ...form, pakaiKhusus: e.target.checked }); setErrorsKar({ ...errorsKar, allowance: null }); }} />
                    Pakai allowance khusus untuk karyawan ini
                  </label>
                  {form.pakaiKhusus && (
                    <>
                      <InputRupiah value={form.allowance_khusus} onChange={v => { setForm({ ...form, allowance_khusus: v }); setErrorsKar({ ...errorsKar, allowance: null }); }} />
                      <p className="text-[11px] text-slate-500">Nominal ini dipakai menggantikan allowance job role.</p>
                    </>
                  )}
                  <ErrText msg={errorsKar.allowance} />
                </div>
              );
            })()}

            </div>
           </div>

            {perubahan && (
              <div className="mt-5 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium flex items-center gap-2">
                <IconPerubahan className="w-4 h-4 shrink-0" /> {perubahan.teks}
              </div>
            )}

            <FooterModal>
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors">Batal</button>
              <button type="submit" disabled={loading} className="flex-[2] sm:flex-none px-6 py-2.5 text-white font-medium bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors">{loading ? 'Menyimpan...' : (editKar ? 'Simpan Perubahan' : 'Daftarkan Karyawan')}</button>
            </FooterModal>
          </form>
        </Modal>
      )}

      {/* MODAL TRANSFER BAWAHAN */}
      {transfer && (
        <Modal judul={`Pindahkan bawahan ${transfer.dari.nama_lengkap}`} onClose={() => setTransfer(null)} lebar="sm:max-w-xl">
          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Pilih Marketing yang dipindah</p>
              <ul className="space-y-1 max-h-[40dvh] overflow-y-auto border border-slate-200 rounded-lg p-2">
                {bawahanOf(transfer.dari.id).map(k => (
                  <li key={k.id}>
                    <label className="flex items-center gap-2 text-sm p-2 rounded hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={transfer.ids.includes(k.id)} onChange={e => setTransfer({ ...transfer, ids: e.target.checked ? [...transfer.ids, k.id] : transfer.ids.filter(x => x !== k.id) })} />
                      {k.nama_lengkap} <span className="text-xs text-slate-400 font-mono">{k.nip}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Ke atasan</label>
              <select value={transfer.ke} onChange={e => setTransfer({ ...transfer, ke: e.target.value })} className={getStyleInput(false)}>
                <option value="">-- Pilih Tujuan --</option>
                {daftarBM.filter(b => b.id !== transfer.dari.id).map(b => <option key={b.id} value={b.id}>{labelAtasan(b)}</option>)}
              </select>
            </div>
            <FooterModal>
              <button onClick={() => setTransfer(null)} className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200">Batal</button>
              <button onClick={simpanTransfer} disabled={loading || !transfer.ke || transfer.ids.length === 0} className="flex-[2] sm:flex-none px-6 py-2.5 text-white font-medium bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">{loading ? 'Memindahkan...' : 'Pindahkan'}</button>
            </FooterModal>
          </div>
        </Modal>
      )}

      {/* MODAL RIWAYAT STRUKTUR */}
      {riwayat && (
        <Modal judul={`Riwayat Struktur ${riwayat.kar.nama_lengkap}`} onClose={() => setRiwayat(null)} lebar="sm:max-w-2xl">
          <div className="p-5 sm:p-6">
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
        <Modal judul={`Input Manual: ${manual.kar.nama_lengkap}`} onClose={() => setShowManual(false)} lebar="sm:max-w-2xl">
          <form onSubmit={simpanManual} className="p-5 sm:p-6 space-y-4">
            <div className="px-3 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-xs font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" /> {manual.info}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
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
                {manual.pakaiShift && (
                  <div>
                    <label className="text-sm font-semibold text-slate-700">Shift</label>
                    <select value={manual.shift} onChange={e => { setManual({ ...manual, shift: e.target.value }); setErrorsManual({ ...errorsManual, shift: null }); }} className={getStyleInput(errorsManual.shift)}>
                      <option value="">-- Pilih shift --</option>
                      {SHIFT.map(sh => <option key={sh.no} value={sh.no}>{sh.label}</option>)}
                    </select>
                    <ErrText msg={errorsManual.shift} />
                  </div>
                )}
                <p className="text-[11px] text-slate-500">
                  {manual.pakaiShift
                    ? 'Status dihitung otomatis: masuk lewat jam mulai shift = Terlambat, hanya jam pulang (tanpa jam masuk) = Terlambat. Format 24 jam WIB.'
                    : 'Status dihitung otomatis: masuk lewat 09:00 = Terlambat, hanya jam pulang (tanpa jam masuk) = Terlambat. Jam kerja 09:00–17:00, format 24 jam WIB.'}
                </p>
                {(() => {
                  // Nilai dropdown: salah satu alasan baku, atau "Lainnya" untuk teks bebas (juga untuk keterangan lama)
                  const pilihan = manual.alasanLain || (manual.keterangan && !ALASAN_MANUAL.includes(manual.keterangan)) ? LAINNYA : manual.keterangan;
                  return (
                    <div className="space-y-2">
                      <div>
                        <label className="text-sm font-semibold text-slate-700">Alasan Input Manual</label>
                        <select value={pilihan || ''} onChange={e => {
                          const v = e.target.value;
                          setManual(v === LAINNYA
                            ? { ...manual, alasanLain: true, keterangan: ALASAN_MANUAL.includes(manual.keterangan) ? '' : manual.keterangan }
                            : { ...manual, alasanLain: false, keterangan: v,
                                ...(v === ALASAN_APPOINTMENT && !manual.pakaiShift ? { masuk: JAM_APPOINTMENT } : {}) });
                          if (v === ALASAN_APPOINTMENT && !manual.pakaiShift) setErrorsManual({ ...errorsManual, masuk: null });
                        }} className={getStyleInput(false)}>
                          <option value="">-- Pilih alasan --</option>
                          {ALASAN_MANUAL.map(a => <option key={a} value={a}>{a}</option>)}
                          <option value={LAINNYA}>{LAINNYA}</option>
                        </select>
                      </div>
                      {pilihan === ALASAN_APPOINTMENT && !manual.pakaiShift && (
                        <p className="text-[11px] text-slate-500">Jam masuk otomatis diisi {JAM_APPOINTMENT}. Masih bisa diubah.</p>
                      )}
                      {pilihan === LAINNYA && (
                        <input type="text" autoFocus placeholder="Tulis alasannya" value={manual.keterangan} onChange={e => setManual({ ...manual, keterangan: e.target.value })} className={getStyleInput(false)} />
                      )}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div>
                <label className="text-sm font-semibold text-slate-700">Keterangan <span className="text-rose-500">*</span></label>
                <textarea rows="3" placeholder="Contoh: Demam, ada surat dokter" value={manual.keterangan} onChange={e => { setManual({ ...manual, keterangan: e.target.value }); setErrorsManual({ ...errorsManual, keterangan: null }); }} className={getStyleInput(errorsManual.keterangan)}></textarea>
                <ErrText msg={errorsManual.keterangan} />
              </div>
            )}

            <FooterModal className="justify-between">
              {bisa.hapus ? <button type="button" onClick={kosongkanManual} disabled={loading || (!manual.absensiId && !manual.izinId)} className="px-3 py-2 text-rose-600 text-sm font-medium rounded-lg hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent">Kosongkan</button> : <span />}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowManual(false)} className="px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors">Batal</button>
                <button type="submit" disabled={loading} className="px-6 py-2.5 text-white font-medium bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors">{loading ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </FooterModal>
          </form>
        </Modal>
      )}
    </div>
  );
}
