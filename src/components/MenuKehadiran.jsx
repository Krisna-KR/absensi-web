'use client';
import { Calendar, CalendarCheck, UserX } from 'lucide-react';
import MenuNav from '@/components/MenuNav';

const ITEM = [
  { href: '/kehadiran', label: 'Harian', pendek: 'Harian', sub: 'Absen masuk & pulang per tim', icon: CalendarCheck },
  { href: '/kehadiran/tidak-masuk', label: 'Tidak masuk', pendek: 'Tidak masuk', sub: 'Yang tidak absen, dari yang terlama', icon: UserX },
];

// Tab "Kehadiran" di navbar dengan dropdown
export default function MenuKehadiran() {
  return <MenuNav label="Kehadiran" icon={Calendar} base="/kehadiran" items={ITEM} />;
}
