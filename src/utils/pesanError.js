// Menerjemahkan error teknis (Supabase/PostgreSQL/jaringan) menjadi kalimat yang dipahami pengguna.
export function pesanError(error) {
  if (!error) return 'Ada kendala. Coba lagi.';
  const pesan = String(error.message || error);
  const kode = error.code;

  // Pesan dari trigger validasi struktur (RAISE EXCEPTION)
  if (pesan.includes('Marketing wajib memiliki 1 atasan')) return 'Pilih Business Manager untuk karyawan Marketing ini.';
  if (pesan.includes('Atasan Marketing harus')) return 'Atasan Marketing harus karyawan Backoffice aktif dengan job role yang bisa jadi atasan. Pilih atasan lain.';
  if (pesan.includes('bukan milik departemen')) return 'Job role yang dipilih bukan milik departemen ini. Pilih job role lain.';
  if (pesan.includes('Hanya job role Backoffice yang bisa jadi atasan')) return 'Hanya job role Backoffice yang boleh ditandai bisa jadi atasan.';
  if (pesan.includes('Departemen job role yang sudah dipakai')) return 'Job role ini sudah dipakai karyawan, jadi departemennya tidak bisa diganti.';
  const masihAda = pesan.match(/Masih ada (\d+) Marketing di bawah job role ini/);
  if (masihAda) return `${masihAda[1]} Marketing masih di bawah job role ini. Pindahkan dulu ke atasan lain.`;
  if (pesan === 'SESI_HABIS') return 'Sesi login berakhir. Muat ulang halaman lalu login lagi.';
  if (pesan === 'TOTAL_MINUS' || pesan.includes('ck_allowance_total')) return 'Potongan lebih besar dari allowance ditambah komisi. Kurangi potongannya.';
  if (pesan === 'NOMINAL_MINUS') return 'Potongan dan komisi tidak boleh minus.';
  if (pesan === 'TTD_TIDAK_VALID') return 'Gambar tanda tangan tidak bisa disimpan. Coba coret ulang.';
  if (pesan.includes('Jabatan Backoffice harus')) return 'Pilih jabatan Backoffice: Business Manager, IT, atau Admin.';
  const bawahan = pesan.match(/Masih membawahi (\d+) Marketing/);
  if (bawahan) return `Karyawan ini masih membawahi ${bawahan[1]} Marketing. Pindahkan dulu bawahannya ke Business Manager lain lewat tombol Pindahkan bawahan.`;

  // Constraint database
  if (kode === '23505') {
    if (pesan.includes('absensi')) return 'Karyawan ini sudah punya data absen di tanggal tersebut.';
    if (pesan.includes('izin_harian')) return 'Karyawan ini sudah punya catatan izin di tanggal tersebut.';
    if (pesan.includes('username') || pesan.includes('nip')) return 'NIP atau username sudah dipakai karyawan lain.';
    if (pesan.includes('master_libur')) return 'Tanggal ini sudah terdaftar sebagai hari libur.';
    if (pesan.includes('lokasi')) return 'Nama lokasi ini sudah ada.';
    if (pesan.includes('master_jabatan')) return 'Nama job role ini sudah ada.';
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
