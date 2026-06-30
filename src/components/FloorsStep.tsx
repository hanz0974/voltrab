import { useState } from 'react';
import { Plus, Trash2, ChevronDown, DoorOpen, GripVertical, Check } from 'lucide-react';
import type { Floor, Room } from '../types';
import { uid } from '../data';
import { Modal } from './Modal';

interface FloorsStepProps {
  floors: Floor[];
  onChange: (floors: Floor[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function FloorsStep({ floors, onChange, onNext, onBack }: FloorsStepProps) {
  const [expandedId, setExpandedId] = useState<string | null>(floors[0]?.id ?? null);
  const [editingRoom, setEditingRoom] = useState<{ floorId: string; room: Room | null } | null>(null);

  const updateFloor = (floorId: string, patch: Partial<Floor>) => {
    onChange(floors.map((f) => (f.id === floorId ? { ...f, ...patch } : f)));
  };

  const addRoom = (floorId: string, name: string) => {
    const newRoom: Room = {
      id: uid(),
      name,
      inputMode: 'manual',
      parts: [],
      detectionStatus: 'idle',
    };
    updateFloor(floorId, {
      rooms: [...(floors.find((f) => f.id === floorId)?.rooms ?? []), newRoom],
    });
  };

  const updateRoom = (floorId: string, roomId: string, patch: Partial<Room>) => {
    const floor = floors.find((f) => f.id === floorId);
    if (!floor) return;
    updateFloor(floorId, {
      rooms: floor.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)),
    });
  };

  const deleteRoom = (floorId: string, roomId: string) => {
    const floor = floors.find((f) => f.id === floorId);
    if (!floor) return;
    updateFloor(floorId, { rooms: floor.rooms.filter((r) => r.id !== roomId) });
  };

  const totalRooms = floors.reduce((sum, f) => sum + f.rooms.length, 0);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Lantai & Ruangan</h2>
          <p className="mt-1 text-sm text-slate-500">
            Atur nama setiap lantai dan tambahkan ruangan di dalamnya.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="rounded-xl bg-white px-4 py-2 shadow-soft">
            <div className="text-xs text-slate-500">Total Lantai</div>
            <div className="text-lg font-bold text-slate-900">{floors.length}</div>
          </div>
          <div className="rounded-xl bg-white px-4 py-2 shadow-soft">
            <div className="text-xs text-slate-500">Total Ruangan</div>
            <div className="text-lg font-bold text-slate-900">{totalRooms}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {floors.map((floor, idx) => {
          const isExpanded = expandedId === floor.id;
          return (
            <div key={floor.id} className="card-base overflow-hidden">
              <div
                className="flex items-center gap-3 px-4 py-4 cursor-pointer transition-colors hover:bg-slate-50/60"
                onClick={() => setExpandedId(isExpanded ? null : floor.id)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    className="w-full bg-transparent text-base font-semibold text-slate-900 outline-none focus:bg-white focus:px-2 focus:py-1 focus:rounded-lg focus:ring-2 focus:ring-brand-500/20"
                    value={floor.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateFloor(floor.id, { name: e.target.value })}
                    placeholder={`Lantai ${idx + 1}`}
                  />
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <DoorOpen className="h-3.5 w-3.5" />
                    {floor.rooms.length} ruangan
                  </div>
                </div>
                <ChevronDown
                  className={`h-5 w-5 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                />
              </div>

              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/40 p-4 animate-fade-in">
                  {floor.rooms.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center">
                      <DoorOpen className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-2 text-sm text-slate-500">Belum ada ruangan di lantai ini.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {floor.rooms.map((room) => (
                        <div
                          key={room.id}
                          className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-all hover:border-brand-200 hover:shadow-soft"
                        >
                          <GripVertical className="h-4 w-4 text-slate-300" />
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                            <DoorOpen className="h-4 w-4" />
                          </div>
                          <input
                            className="flex-1 bg-transparent text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-brand-500/20 focus:rounded-md focus:px-2 focus:py-1"
                            value={room.name}
                            onChange={(e) => updateRoom(floor.id, room.id, { name: e.target.value })}
                            placeholder="Nama ruangan"
                          />
                          <span className="hidden text-xs text-slate-400 sm:block">
                            {room.parts.length} part · {room.inputMode === 'detect' ? 'Deteksi SLD' : 'Manual'}
                          </span>
                          <button
                            onClick={() => deleteRoom(floor.id, room.id)}
                            className="rounded-lg p-1.5 text-slate-400 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                            aria-label="Hapus ruangan"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => setEditingRoom({ floorId: floor.id, room: null })}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-medium text-slate-500 transition-all hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700"
                  >
                    <Plus className="h-4 w-4" />
                    Tambah Ruangan
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between">
        <button className="btn-secondary" onClick={onBack}>
          Kembali
        </button>
        <button className="btn-primary" disabled={totalRooms === 0} onClick={onNext}>
          Lanjut ke Metode Input
        </button>
      </div>

      <AddRoomModal
        open={editingRoom !== null}
        onClose={() => setEditingRoom(null)}
        onSave={(name) => {
          if (editingRoom) addRoom(editingRoom.floorId, name);
          setEditingRoom(null);
        }}
      />
    </div>
  );
}

function AddRoomModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const presets = ['Ruang Tamu', 'Kamar Tidur', 'Dapur', 'Kamar Mandi', 'Ruang Kerja', 'Gudang', 'Garasi', 'Koridor'];

  return (
    <Modal open={open} onClose={onClose} title="Tambah Ruangan" subtitle="Beri nama ruangan atau pilih dari preset.">
      <div className="space-y-4">
        <div>
          <label className="label-base">Nama Ruangan</label>
          <input
            autoFocus
            className="input-base"
            placeholder="Contoh: Ruang Tamu Lantai 1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())}
          />
        </div>
        <div>
          <label className="label-base">Pilih Cepat</label>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setName(p)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button className="btn-primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>
            <Check className="h-4 w-4" />
            Tambah
          </button>
        </div>
      </div>
    </Modal>
  );
}
