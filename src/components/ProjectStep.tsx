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
  const canProceed = project.name.trim().length > 0;

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

      <div className="flex justify-end">
        <button className="btn-primary" disabled={!canProceed} onClick={onNext}>
          Lanjut ke Lantai & Ruangan
        </button>
      </div>
    </div>
  );
}
