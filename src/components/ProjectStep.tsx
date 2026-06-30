import { Building2, MapPin, User, Calendar, Layers, FileText } from 'lucide-react';
import type { ProjectState } from '../types';

interface ProjectStepProps {
  project: ProjectState;
  onChange: (patch: Partial<ProjectState>) => void;
  floorCount: number;
  onFloorCountChange: (count: number) => void;
  onNext: () => void;
}

export function ProjectStep({ project, onChange, floorCount, onFloorCountChange, onNext }: ProjectStepProps) {
  const canProceed = project.name.trim().length > 0 && floorCount > 0;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Informasi Project</h2>
        <p className="mt-1 text-sm text-slate-500">
          Mulai dengan memberikan identitas project dan menentukan struktur bangunan.
        </p>
      </div>

      <div className="card-base overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Identitas Project
            </h3>
          </div>
        </div>
        <div className="grid gap-5 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label-base">Nama Project *</label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input-base pl-10"
                placeholder="Contoh: Instalasi Kelistrikan Gedung Perkantoran 5 Lantai"
                value={project.name}
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label-base">Nama Klien</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input-base pl-10"
                placeholder="PT. Contoh Sejahtera"
                value={project.client}
                onChange={(e) => onChange({ client: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label-base">Lokasi</label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input-base pl-10"
                placeholder="Jakarta Selatan, DKI Jakarta"
                value={project.location}
                onChange={(e) => onChange({ location: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label-base">Tanggal Penawaran</label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                className="input-base pl-10"
                value={project.date}
                onChange={(e) => onChange({ date: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Struktur Bangunan
            </h3>
          </div>
        </div>
        <div className="p-6">
          <label className="label-base">Jumlah Lantai *</label>
          <p className="mb-4 text-xs text-slate-500">
            Tentukan jumlah lantai pada bangunan. Anda akan mengatur ruangan untuk setiap lantai pada langkah berikutnya.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onFloorCountChange(Math.max(1, floorCount - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-semibold text-slate-600 transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              −
            </button>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={50}
                className="input-base w-24 text-center text-lg font-bold"
                value={floorCount}
                onChange={(e) => onFloorCountChange(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              />
            </div>
            <button
              type="button"
              onClick={() => onFloorCountChange(Math.min(50, floorCount + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-semibold text-slate-600 transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              +
            </button>
            <span className="text-sm text-slate-500">lantai</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onFloorCountChange(n)}
                className={`rounded-xl border-2 px-4 py-3 text-center transition-all ${
                  floorCount === n
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="text-lg font-bold">{n}</div>
                <div className="text-xs">{n === 1 ? 'Lantai' : 'Lantai'}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" disabled={!canProceed} onClick={onNext}>
          Lanjut ke Lantai & Ruangan
        </button>
      </div>
    </div>
  );
}
