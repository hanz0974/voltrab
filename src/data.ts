import type { PartCategory } from './types';

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

export const uid = (): string => {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
};
