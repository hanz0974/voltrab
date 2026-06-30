import type { ComponentSpec, PartCategory } from './types';

export const COMPONENT_CATALOG: ComponentSpec[] = [
  { id: 'c-mcb-16', name: 'MCB 16A 1P', category: 'Pengaman', unit: 'unit', price: 85000 },
  { id: 'c-mcb-25', name: 'MCB 25A 1P', category: 'Pengaman', unit: 'unit', price: 95000 },
  { id: 'c-mccb-100', name: 'MCCB 100A 3P', category: 'Pengaman', unit: 'unit', price: 1250000 },
  { id: 'c-rccb-40', name: 'RCCB 40A 2P 30mA', category: 'Pengaman', unit: 'unit', price: 320000 },
  { id: 'c-led-18', name: 'Lampu LED 18W', category: 'Penerangan', unit: 'unit', price: 75000 },
  { id: 'c-led-down', name: 'Downlight LED 12W', category: 'Penerangan', unit: 'unit', price: 95000 },
  { id: 'c-tl-led', name: 'TL LED 20W 120cm', category: 'Penerangan', unit: 'unit', price: 110000 },
  { id: 'c-saklar-1', name: 'Saklar Tunggal', category: 'Saklar & Stop Kontak', unit: 'titik', price: 35000 },
  { id: 'c-saklar-2', name: 'Saklar Ganda', category: 'Saklar & Stop Kontak', unit: 'titik', price: 45000 },
  { id: 'c-stop-1', name: 'Stop Kontak Tunggal', category: 'Saklar & Stop Kontak', unit: 'titik', price: 42000 },
  { id: 'c-stop-2', name: 'Stop Kontak Ganda', category: 'Saklar & Stop Kontak', unit: 'titik', price: 55000 },
  { id: 'c-kabel-nya-3x2.5', name: 'Kabel NYA 3x2.5mm', category: 'Kabel', unit: 'm', price: 12500 },
  { id: 'c-kabel-nym-3x2.5', name: 'Kabel NYM 3x2.5mm', category: 'Kabel', unit: 'm', price: 18500 },
  { id: 'c-kabel-nym-3x4', name: 'Kabel NYM 3x4mm', category: 'Kabel', unit: 'm', price: 28000 },
  { id: 'c-kabel-nycu', name: 'Kabel NYCU 6mm', category: 'Kabel', unit: 'm', price: 32000 },
  { id: 'c-panel-box', name: 'Box Panel 1 Pintu', category: 'Panel & MDP', unit: 'unit', price: 450000 },
  { id: 'c-mdp', name: 'MDP (Main Distribution Panel)', category: 'Panel & MDP', unit: 'unit', price: 3500000 },
  { id: 'c-sdp', name: 'SDP (Sub Distribution Panel)', category: 'Panel & MDP', unit: 'unit', price: 1850000 },
  { id: 'c-pipa-conduit', name: 'Pipa Conduit 3/4"', category: 'Lainnya', unit: 'm', price: 15000 },
  { id: 'c-accessories', name: 'Aksesoris Instalasi', category: 'Lainnya', unit: 'set', price: 25000 },
];

export const CATEGORY_COLORS: Record<PartCategory, { bg: string; text: string; dot: string }> = {
  Pengaman: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  Penerangan: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  'Saklar & Stop Kontak': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  Kabel: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Panel & MDP': { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
  Lainnya: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-500' },
};

export const formatRupiah = (value: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('id-ID').format(value);
};

export const uid = (): string => {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
};
