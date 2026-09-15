import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Absensi Dashboard",
  description: "Sistem Absensi Karyawan",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className={`${inter.className} min-h-full bg-slate-950 text-slate-300`}>
        {children}
      </body>
    </html>
  );
}