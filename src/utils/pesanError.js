// Menerjemahkan error teknis (Supabase/PostgreSQL/jaringan) menjadi kalimat yang dipahami pengguna.
export function pesanError(error) {
  if (!error) return 'Ada kendala. Coba lagi.';
  const pesan = String(error.message || error);
  const kode = error.code;

  // Pesan dari trigger validasi struktur (RAISE EXCEPTION)
  if (pesan.includes('Marketing wajib memiliki 1 atasan')) return 'Pilih Business Manager untuk karyawan Marketing ini.';
  if (pesan.includes('Atasan Marketing harus')) return 'Atasan Marketing harus Business Manager dari Backoffice. Pilih atasan lain.';
  if (pesan.includes('Jabatan Backoffice harus')) return 'Pilih jabatan Backoffice: Business Manager, IT, atau Admin.';
  const bawahan = pesan.match(/Masih membawahi (\d+) Marketing/);
  if (bawahan) return `Karyawan ini masih membawahi ${bawahan[1]} Marketing. Pindahkan dulu bawahannya ke Business Manager lain lewat tombol Pindahkan bawahan.`;

  // Constraint database
  if (kode === '23505') {
    if (pesan.includes('absensi')) return 'Karyawan ini sudah punya data absen di tanggal tersebut.';
    if (pesan.includes('izin_harian')) return 'Karyawan ini sudah punya catatan izin di tanggal tersebut.';
    if (pesan.includes('username') || pesan.includes('nip')) return 'NIP atau username sudah dipakai karyawan lain.';
    if (pesan.includes('master_libur')) return 'Tanggal ini sudah terdaftar sebagai hari libur.';
    return 'Data yang sama sudah ada.';
  }
  if (kode === '23503') return 'Data ini masih terhubung dengan data lain, jadi belum bisa dihapus.';
  if (kode === '23514') {
    if (pesan.includes('keluar_setelah_masuk')) return 'Jam pulang harus setelah jam masuk.';
    if (pesan.includes('ada_jam')) return 'Isi jam masuk atau jam pulang.';
    return 'Isian belum sesuai aturan. Periksa lagi datanya.';
  }
  if (kode === '42501' || pesan.includes('row-level security') || pesan.includes('permission denied')) {
    return 'Aplikasi belum punya izin membuka data ini. Hubungi admin sistem.';
  }

  // Jaringan
  if (pesan.includes('Failed to fetch') || pesan.includes('NetworkError') || pesan.includes('Load failed')) {
    return 'Koneksi ke server terputus. Cek internet kamu, lalu coba lagi.';
  }

  return `Ada kendala: ${pesan}`;
}
