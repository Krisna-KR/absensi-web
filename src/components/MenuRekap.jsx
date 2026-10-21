'use client';
import { FileText, Network, Wallet, ClipboardList } from 'lucide-react';
import MenuNav from '@/components/MenuNav';

const ITEM = [
  { href: '/rekap/absensi', label: 'Rekap absensi', pendek: 'Absensi', sub: 'Per periode 21–20, per divisi, export Excel', icon: ClipboardList },
  { href: '/rekap', label: 'Struktur karyawan', pendek: 'Struktur', sub: 'Susunan Backoffice & tim Marketing', icon: Network },
  { href: '/rekap/allowance', label: 'Allowance', pendek: 'Allowance', sub: 'Isi allowance, kirim ke HP & slip', icon: Wallet },
];

// Tab "Rekap" di navbar dengan dropdown
export default function MenuRekap() {
  return <MenuNav label="Rekap" icon={FileText} base="/rekap" items={ITEM} />;
}
