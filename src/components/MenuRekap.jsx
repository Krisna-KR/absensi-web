'use client';
import { FileText, Network, Wallet, ClipboardList } from 'lucide-react';
import MenuNav from '@/components/MenuNav';
import { useAkses } from '@/components/AksesAdmin';

const ITEM = [
  { href: '/rekap/absensi', menu: 'rekap', label: 'Rekap absensi', pendek: 'Absensi', sub: 'Per periode 21–20, per divisi, export Excel', icon: ClipboardList },
  { href: '/rekap', menu: 'rekap', label: 'Struktur karyawan', pendek: 'Struktur', sub: 'Susunan Backoffice & tim Marketing', icon: Network },
  { href: '/rekap/allowance', menu: 'allowance', label: 'Allowance', pendek: 'Allowance', sub: 'Isi allowance, kirim ke HP & slip', icon: Wallet },
];

// Tab "Rekap" di navbar dengan dropdown (hanya item yang boleh dilihat)
export default function MenuRekap() {
  const { boleh } = useAkses();
  return <MenuNav label="Rekap" icon={FileText} base="/rekap" items={ITEM.filter(i => boleh(i.menu))} />;
}
