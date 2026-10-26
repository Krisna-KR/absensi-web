/** @type {import('next').NextConfig} */
const nextConfig = {
  // Alamat lama Layar Presensi dipindah ke /layar; TV yang masih membuka alamat lama ikut pindah.
  // permanent: false (307) supaya browser tidak menyimpan pengalihan selamanya.
  async redirects() {
    return [
      { source: '/qr-kiosk', destination: '/layar', permanent: false },
    ];
  },
};

export default nextConfig;
