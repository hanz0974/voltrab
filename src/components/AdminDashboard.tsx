import { useEffect, useState } from 'react';
import {
  Zap,
  LogOut,
  LayoutDashboard,
  Package,
  Brain,
  ClipboardList,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { ComponentsManager } from './ComponentsManager';
import { ModelsManager } from './ModelsManager';
import { ReportsManager } from './ReportsManager.tsx';


type AdminView = 'overview' | 'components' | 'models' | 'reports';
const ADMIN_VIEW_STORAGE_KEY = 'voltrab-admin-view';

function parseAdminView(value: string | null): AdminView {
  if (value === 'components' || value === 'models' || value === 'overview' || value === 'reports') {
    return value;
  }
  return 'overview';
}

interface AdminDashboardProps {
  user: User;
  isAdmin: boolean;
  onSignOut: () => void;
  onBackToApp: () => void;
}

export function AdminDashboard({ user, isAdmin, onSignOut, onBackToApp }: AdminDashboardProps) {
  const [activeView, setActiveView] = useState<AdminView>(() => {
    if (typeof window === 'undefined') return 'overview';
    return parseAdminView(window.localStorage.getItem(ADMIN_VIEW_STORAGE_KEY));
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ADMIN_VIEW_STORAGE_KEY, activeView);
  }, [activeView]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Akses Ditolak</h1>
          <p className="mt-2 text-slate-600">Anda tidak memiliki akses ke halaman ini.</p>
          <button
            onClick={onBackToApp}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Aplikasi
          </button>
        </div>
      </div>
    );
  }

  const menuItems = [
    {
      id: 'overview' as const,
      label: 'Overview',
      icon: LayoutDashboard,
      description: 'Ringkasan sistem dan statistik',
    },
    {
      id: 'components' as const,
      label: 'Komponen Katalog',
      icon: Package,
      description: 'Kelola daftar komponen dan harga',
    },
    {
      id: 'models' as const,
      label: 'Model YOLOv8',
      icon: Brain,
      description: 'Upload dan kelola model deteksi',
    },
    {
      id: 'reports' as const,
      label: 'Report',
      icon: ClipboardList,
      description: 'Laporan keluhan hasil deteksi dari user',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed left-0 top-0 z-40 h-full w-64 border-r border-slate-200 bg-white shadow-sm">
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg">
                <Zap className="h-5 w-5" fill="currentColor" />
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight text-slate-900">VoltRAB</h1>
                <p className="text-xs text-slate-500">Admin Dashboard</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3">
            <ul className="space-y-1">
              {menuItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveView(item.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      activeView === item.id
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-slate-200 p-4">
            <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-sm font-medium text-slate-700">{user.email}</div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Admin
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={onBackToApp}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Kembali ke Aplikasi
              </button>
              <button
                onClick={onSignOut}
                className="flex items-center justify-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-100"
              >
                <LogOut className="h-4 w-4" />
                Keluar
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="ml-64 min-h-screen p-8">
        {activeView === 'overview' && (
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Dashboard Overview</h2>
            <p className="mt-1 text-slate-600">Selamat datang di panel admin VoltRAB.</p>

            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {menuItems.slice(1).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className="group rounded-xl border border-slate-200 bg-white p-6 text-left transition-all hover:border-brand-300 hover:shadow-lg"
                >
                  <div className="mb-4 inline-flex items-center justify-center rounded-lg bg-brand-50 p-3 text-brand-600">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{item.label}</h3>
                  <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-medium text-brand-600">
                    Kelola
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-semibold text-slate-900">Statistik Sistem</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-brand-50 p-4">
                  <div className="text-2xl font-bold text-brand-700">20+</div>
                  <div className="text-sm text-brand-600">Komponen Katalog</div>
                </div>
                <div className="rounded-lg bg-emerald-50 p-4">
                  <div className="text-2xl font-bold text-emerald-700">YOLOv8</div>
                  <div className="text-sm text-emerald-600">Model Deteksi</div>
                </div>
                <div className="rounded-lg bg-sky-50 p-4">
                  <div className="text-2xl font-bold text-sky-700">Admin</div>
                  <div className="text-sm text-sky-600">Mode Aktif</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeView === 'components' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <ComponentsManager />
          </div>
        )}

        {activeView === 'models' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <ModelsManager />
          </div>
        )}

        {activeView === 'reports' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <ReportsManager />
          </div>
        )}
      </main>
    </div>
  );
}
