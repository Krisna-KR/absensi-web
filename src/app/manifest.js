// Manifest PWA: membuat aplikasi bisa di-install ke layar utama HP
// (layar penuh tanpa address bar, ikon logo GIFX). Next.js otomatis
// menyajikannya di /manifest.webmanifest dan memasang <link rel="manifest">.
export default function manifest() {
  return {
    name: "Absensi GIFX",
    short_name: "Absensi GIFX",
    description: "Sistem absensi karyawan GIFX",
    start_url: "/scan",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/logo-gifx.png", sizes: "192x192", type: "image/png" },
      { src: "/logo-gifx-besar.png", sizes: "512x512", type: "image/png" },
    ],
  };
}