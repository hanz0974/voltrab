import { PencilLine, ScanLine, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { Floor, InputMode } from '../types';

interface MethodStepProps {
  floors: Floor[];
  onChange: (floors: Floor[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function MethodStep({ floors, onChange, onNext, onBack }: MethodStepProps) {
  const setRoomMode = (floorId: string, roomId: string, mode: InputMode) => {
    onChange(
      floors.map((f) =>
        f.id === floorId
          ? {
              ...f,
              rooms: f.rooms.map((r) => (r.id === roomId ? { ...r, inputMode: mode } : r)),
            }
          : f,
      ),
    );
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Metode Input Komponen</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pilih metode input untuk setiap ruangan: isi manual atau deteksi otomatis dari SLD kelistrikan.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <InfoCard
          icon={<PencilLine className="h-5 w-5" />}
          title="Input Manual"
          desc="Isi komponen satu per satu dari katalog. Cocok untuk ruangan sederhana atau revisi cepat."
          color="brand"
        />
        <InfoCard
          icon={<ScanLine className="h-5 w-5" />}
          title="Deteksi SLD (YOLOv8 + OCR)"
          desc="Unggah diagram SLD, sistem mendeteksi simbol & teks komponen secara otomatis."
          color="accent"
        />
      </div>

      <div className="space-y-4">
        {floors.map((floor, fIdx) => (
          <div key={floor.id} className="card-base overflow-hidden">
            <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                {fIdx + 1}
              </div>
              <h3 className="font-semibold text-slate-800">{floor.name}</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {floor.rooms.map((room) => (
                <div key={room.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <div className="font-medium text-slate-800">{room.name}</div>
                    <div className="text-xs text-slate-500">
                      {room.parts.length > 0
                        ? `${room.parts.length} komponen sudah diisi`
                        : 'Belum ada komponen'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:w-auto">
                    <ModeButton
                      active={room.inputMode === 'manual'}
                      icon={<PencilLine className="h-4 w-4" />}
                      label="Manual"
                      onClick={() => setRoomMode(floor.id, room.id, 'manual')}
                    />
                    <ModeButton
                      active={room.inputMode === 'detect'}
                      icon={<ScanLine className="h-4 w-4" />}
                      label="Deteksi SLD"
                      onClick={() => setRoomMode(floor.id, room.id, 'detect')}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between">
        <button className="btn-secondary" onClick={onBack}>
          Kembali
        </button>
        <button className="btn-primary" onClick={onNext}>
          Lanjut ke Komponen
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  desc,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: 'brand' | 'accent';
}) {
  const styles =
    color === 'brand'
      ? 'border-brand-200 bg-brand-50/50 text-brand-700'
      : 'border-accent-200 bg-accent-50/50 text-accent-700';
  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm`}>{icon}</div>
        <h4 className="font-semibold">{title}</h4>
      </div>
      <p className="mt-2 text-sm text-slate-600">{desc}</p>
    </div>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all ${
        active
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      {active ? <CheckCircle2 className="h-4 w-4" /> : icon}
      {label}
    </button>
  );
}
