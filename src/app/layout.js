import { Inter } from "next/font/google";
import "./globals.css";
import { FeedbackProvider } from "@/components/Feedback";

// fallback: dipakai browser kalau Inter tidak bisa dipakai (mis. daftar pilihan <select> di Windows),
// supaya tidak jatuh ke font serif (Times New Roman)
const inter = Inter({ subsets: ["latin"], fallback: ["system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"] });

export const metadata = {
  title: "Absensi GIFX",
  description: "Sistem absensi karyawan GIFX",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className={`${inter.className} min-h-full bg-slate-50 text-slate-900`}>
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}