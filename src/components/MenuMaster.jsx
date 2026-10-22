'use client';
import { Database, Table2, ShieldCheck } from 'lucide-react';
import MenuNav from '@/components/MenuNav';
import { useAkses } from '@/components/AksesAdmin';

const ITEM = [
  { href: '/master', menu: 'master', label: 'Data master', pendek: 'Data', sub: 'Lokasi, departemen, job role', icon: Table2 },
  { href: '/master/pengguna', menu: 'pengguna', label: 'Pengguna & hak akses', pendek: 'Pengguna', sub: 'User web, peran, centang View/New/Edit/Delete', icon: ShieldCheck },
];

// Tab "Master Data" di navbar dengan dropdown (hanya item yang boleh dilihat)
export default function MenuMaster() {
  const { boleh } = useAkses();
  return <MenuNav label="Master Data" icon={Database} base="/master" items={ITEM.filter(i => boleh(i.menu))} />;
}
