import { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  DoorOpen,
  Package,
  PencilLine,
  ScanLine,
  Search,
  Check,
} from 'lucide-react';
import type { Floor, Room, PartItem, ComponentSpec } from '../types';
import { COMPONENT_CATALOG, CATEGORY_COLORS, formatRupiah, uid } from '../data';
import { CategoryBadge } from './CategoryBadge';
import { Modal } from './Modal';
import { DetectionModal } from './DetectionModal';

interface ComponentsStepProps {
  floors: Floor[];
  onChange: (floors: Floor[]) => void;
  onNext: () => void;
  onBack: () => void;
  floorCount: number;
  onFloorCountChange: (count: number) => void;
}

export function ComponentsStep({
  floors,
  onChange,
  onNext,
  onBack,
  floorCount,
  onFloorCountChange,
}: ComponentsStepProps) {
  const [expandedId, setExpandedId] = useState<string | null>(floors[0]?.id ?? null);
  const [editingRoom, setEditingRoom] = useState<{ floorId: string; room: Room | null } | null>(null);
  const [quickAddFloorId, setQuickAddFloorId] = useState<string | null>(null);
  const [quickAddCount, setQuickAddCount] = useState(1);
  const [activeRoom, setActiveRoom] = useState<{ floorId: string; roomId: string } | null>(() => {
    const firstFloor = floors[0];
    const firstRoom = firstFloor?.rooms[0];
    return firstRoom ? { floorId: firstFloor.id, roomId: firstRoom.id } : null;
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detectionOpen, setDetectionOpen] = useState(false);
  const [editingRoomName, setEditingRoomName] = useState<{ floorId: string; roomId: string } | null>(null);
  const [roomNameDraft, setRoomNameDraft] = useState('');

  useEffect(() => {
    if (!activeRoom) {
      const firstFloor = floors[0];
      const firstRoom = firstFloor?.rooms[0];
      if (firstRoom) {
        setActiveRoom({ floorId: firstFloor.id, roomId: firstRoom.id });
      }
      return;
    }

    const floor = floors.find((f) => f.id === activeRoom.floorId);
    const room = floor?.rooms.find((r) => r.id === activeRoom.roomId);
    if (!floor || !room) {
      const fallbackFloor = floors[0];
      const fallbackRoom = fallbackFloor?.rooms[0];
      if (fallbackRoom) {
        setActiveRoom({ floorId: fallbackFloor.id, roomId: fallbackRoom.id });
      }
    }
  }, [activeRoom, floors]);

  const updateFloor = (floorId: string, patch: Partial<Floor>) => {
    onChange(floors.map((f) => (f.id === floorId ? { ...f, ...patch } : f)));
  };

  const updateRoom = (floorId: string, roomId: string, patch: Partial<Room>) => {
    const floor = floors.find((f) => f.id === floorId);
    if (!floor) return;
    updateFloor(floorId, {
      rooms: floor.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)),
    });
  };

  const addRoom = (floorId: string, name: string) => {
    const floor = floors.find((f) => f.id === floorId);
    if (!floor) return;
    const newRoom: Room = {
      id: uid(),
      name,
      inputMode: 'manual',
      parts: [],
      detectionStatus: 'idle',
    };
    updateFloor(floorId, { rooms: [...floor.rooms, newRoom] });
    setActiveRoom({ floorId, roomId: newRoom.id });
  };

  const deleteRoom = (floorId: string, roomId: string) => {
    const floor = floors.find((f) => f.id === floorId);
    if (!floor) return;
    const nextRooms = floor.rooms.filter((r) => r.id !== roomId);
    updateFloor(floorId, { rooms: nextRooms });
    if (activeRoom?.roomId === roomId) {
      const fallbackRoom = nextRooms[0];
      if (fallbackRoom) {
        setActiveRoom({ floorId, roomId: fallbackRoom.id });
      }
    }
  };

  const addMultipleRooms = (floorId: string, count: number) => {
    const floor = floors.find((f) => f.id === floorId);
    if (!floor) return;

    const newRooms: Room[] = Array.from({ length: count }, (_, i) => ({
      id: uid(),
      name: `Ruangan ${floor.rooms.length + i + 1}`,
      inputMode: 'manual',
      parts: [],
      detectionStatus: 'idle',
    }));

    updateFloor(floorId, { rooms: [...floor.rooms, ...newRooms] });
    setQuickAddFloorId(null);
    setQuickAddCount(1);
    if (newRooms.length > 0) {
      setActiveRoom({ floorId, roomId: newRooms[0].id });
    }
  };

  const totalRooms = floors.reduce((sum, f) => sum + f.rooms.length, 0);
  const currentFloor = floors.find((f) => f.id === activeRoom?.floorId);
  const currentRoom = currentFloor?.rooms.find((r) => r.id === activeRoom?.roomId);

  const addPart = (component: ComponentSpec, qty: number) => {
    if (!activeRoom || !currentRoom) return;
    const part: PartItem = {
      id: uid(),
      componentId: component.id,
      name: component.name,
      category: component.category,
      unit: component.unit,
      quantity: qty,
      price: component.price,
    };
    updateRoom(activeRoom.floorId, activeRoom.roomId, {
      parts: [...currentRoom.parts, part],
    });
  };

  const updatePart = (partId: string, patch: Partial<PartItem>) => {
    if (!activeRoom || !currentRoom) return;
    updateRoom(activeRoom.floorId, activeRoom.roomId, {
      parts: currentRoom.parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)),
    });
  };

  const deletePart = (partId: string) => {
    if (!activeRoom || !currentRoom) return;
    updateRoom(activeRoom.floorId, activeRoom.roomId, {
      parts: currentRoom.parts.filter((p) => p.id !== partId),
    });
  };

  const handleDetectionConfirm = (parts: PartItem[]) => {
    if (!activeRoom || !currentRoom) return;
    updateRoom(activeRoom.floorId, activeRoom.roomId, {
      parts: [...currentRoom.parts, ...parts],
      inputMode: 'detect',
      detectionStatus: parts.length > 0 ? 'done' : 'error',
    });
    setDetectionOpen(false);
    if (parts.length === 0) {
      setPickerOpen(true);
    }
  };

  const saveRoomName = (floorId: string, roomId: string, nextName: string) => {
    const trimmedName = nextName.trim();
    if (!trimmedName) {
      setEditingRoomName(null);
      setRoomNameDraft('');
      return;
    }

    updateRoom(floorId, roomId, { name: trimmedName });
    setEditingRoomName(null);
    setRoomNameDraft('');
  };

  const roomTotal = currentRoom?.parts.reduce((s, p) => s + p.quantity * p.price, 0) ?? 0;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="card-base overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Komponen & Struktur Bangunan</h2>
              <p className="mt-1 text-sm text-slate-500">
                Atur lantai, ruangan, lalu isi komponen untuk setiap ruangan. Jika deteksi SLD kosong, sistem akan membuka input manual.
              </p>
            </div>
            <div className="flex gap-2">
              <div className="rounded-xl bg-white px-3 py-2 shadow-soft">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Total Lantai</div>
                <div className="text-lg font-bold text-slate-900">{floors.length}</div>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 shadow-soft">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Total Ruangan</div>
                <div className="text-lg font-bold text-slate-900">{totalRooms}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <label className="label-base">Jumlah Lantai *</label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onFloorCountChange(Math.max(1, floorCount - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-semibold text-slate-600 transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={50}
              className="input-base w-24 text-center text-lg font-bold"
              value={floorCount ?? 1}
              onChange={(e) => onFloorCountChange(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            />
            <button
              type="button"
              onClick={() => onFloorCountChange(Math.min(50, floorCount + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-semibold text-slate-600 transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              +
            </button>
            <span className="text-sm text-slate-500">lantai</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          {floors.map((floor, idx) => (
            <div key={floor.id} className="card-base overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === floor.id ? null : floor.id)}
                className="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-left"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-800">{floor.name}</div>
                  <div className="text-xs text-slate-500">{floor.rooms.length} ruangan</div>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
                  {idx + 1}
                </div>
              </button>

              {expandedId === floor.id && (
                <div className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                      value={floor.name}
                      onChange={(e) => updateFloor(floor.id, { name: e.target.value })}
                    />
                  </div>

                  {floor.rooms.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
                      Belum ada ruangan.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {floor.rooms.map((room) => {
                        const isActive = activeRoom?.floorId === floor.id && activeRoom?.roomId === room.id;
                        const isEditing = editingRoomName?.floorId === floor.id && editingRoomName?.roomId === room.id;

                        return (
                          <div
                            key={room.id}
                            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${
                              isActive
                                ? 'border-brand-300 bg-brand-50 text-brand-700'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setActiveRoom({ floorId: floor.id, roomId: room.id })}
                              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                                <DoorOpen className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    value={roomNameDraft}
                                    onChange={(e) => setRoomNameDraft(e.target.value)}
                                    onBlur={() => saveRoomName(floor.id, room.id, roomNameDraft)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        saveRoomName(floor.id, room.id, roomNameDraft);
                                      }
                                      if (e.key === 'Escape') {
                                        setEditingRoomName(null);
                                        setRoomNameDraft('');
                                      }
                                    }}
                                    className="w-full truncate rounded-md border border-brand-200 bg-white px-2 py-1 text-sm font-medium text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                                  />
                                ) : (
                                  <div
                                    className="truncate text-sm font-medium"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingRoomName({ floorId: floor.id, roomId: room.id });
                                      setRoomNameDraft(room.name);
                                    }}
                                  >
                                    {room.name}
                                  </div>
                                )}
                                <div className="text-xs text-slate-500">{room.parts.length} komponen</div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteRoom(floor.id, room.id);
                              }}
                              className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-600"
                              aria-label={`Hapus ruangan ${room.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setEditingRoom({ floorId: floor.id, room: null })}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-2.5 text-sm font-medium text-slate-500 transition-all hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700"
                  >
                    <Plus className="h-4 w-4" />
                    Tambah Ruangan
                  </button>

                  {quickAddFloorId === floor.id ? (
                    <div className="mt-3 space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQuickAddCount(Math.max(1, quickAddCount - 1))}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-300 bg-white text-sm font-semibold text-brand-700"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          className="w-16 rounded-lg border border-brand-300 bg-white px-3 py-2 text-center text-sm font-bold text-brand-700 outline-none focus:ring-2 focus:ring-brand-500/30"
                          value={quickAddCount}
                          onChange={(e) => setQuickAddCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                        />
                        <button
                          type="button"
                          onClick={() => setQuickAddCount(Math.min(50, quickAddCount + 1))}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-300 bg-white text-sm font-semibold text-brand-700"
                        >
                          +
                        </button>
                        <span className="text-xs text-slate-500">ruangan</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setQuickAddFloorId(null);
                            setQuickAddCount(1);
                          }}
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={() => addMultipleRooms(floor.id, quickAddCount)}
                          className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white"
                        >
                          Buat {quickAddCount} Ruangan
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddFloorId(floor.id);
                        setQuickAddCount(1);
                      }}
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500"
                    >
                      Atau input jumlah ruangan
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {currentRoom ? (
            <>
              <div className="card-base p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{currentRoom.name}</h3>
                    <p className="text-sm text-slate-500">{currentFloor?.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`chip ${currentRoom.inputMode === 'detect' ? 'bg-accent-100 text-accent-700' : 'bg-brand-100 text-brand-700'}`}>
                      {currentRoom.inputMode === 'detect' ? 'Deteksi SLD' : 'Input Manual'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateRoom(activeRoom!.floorId, activeRoom!.roomId, { inputMode: 'manual' });
                      setPickerOpen(true);
                    }}
                    className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 text-left transition-all hover:border-brand-300"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm">
                        <PencilLine className="h-5 w-5 text-brand-700" />
                      </div>
                      <h4 className="font-semibold text-brand-700">Input Manual</h4>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">Tambahkan komponen satu per satu dari katalog.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateRoom(activeRoom!.floorId, activeRoom!.roomId, { inputMode: 'detect' });
                      setDetectionOpen(true);
                    }}
                    className="rounded-2xl border border-accent-200 bg-accent-50/60 p-4 text-left transition-all hover:border-accent-300"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm">
                        <ScanLine className="h-5 w-5 text-accent-700" />
                      </div>
                      <h4 className="font-semibold text-accent-700">Upload SLD</h4>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">Unggah gambar SLD untuk deteksi komponen otomatis dengan YOLOv8.</p>
                  </button>
                </div>

                {currentRoom.inputMode === 'detect' && currentRoom.detectionStatus === 'done' && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    <Check className="h-4 w-4" />
                    {currentRoom.detections?.length ?? 0} deteksi diterima. Cek dan tambahkan komponen manual bila perlu.
                  </div>
                )}
              </div>

              <div className="card-base overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-3">
                  <h4 className="font-semibold text-slate-700">Daftar Komponen</h4>
                </div>

                {currentRoom.parts.length === 0 ? (
                  <div className="py-12 text-center">
                    <Package className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">Belum ada komponen. Tambahkan lewat katalog atau upload SLD.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-5 py-3 font-semibold">Komponen</th>
                          <th className="px-3 py-3 font-semibold">Kategori</th>
                          <th className="px-3 py-3 text-center font-semibold">Qty</th>
                          <th className="px-3 py-3 font-semibold">Satuan</th>
                          <th className="px-3 py-3 text-right font-semibold">Harga</th>
                          <th className="px-3 py-3 text-right font-semibold">Subtotal</th>
                          <th className="px-3 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {currentRoom.parts.map((part) => (
                          <tr key={part.id} className="group transition-colors hover:bg-slate-50/50">
                            <td className="px-5 py-3 font-medium text-slate-800">{part.name}</td>
                            <td className="px-3 py-3"><CategoryBadge category={part.category} size="sm" /></td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                min={1}
                                value={part.quantity}
                                onChange={(e) => updatePart(part.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                              />
                            </td>
                            <td className="px-3 py-3 text-slate-500">{part.unit}</td>
                            <td className="px-3 py-3 text-right text-slate-600">{formatRupiah(part.price)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatRupiah(part.quantity * part.price)}</td>
                            <td className="px-3 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => deletePart(part.id)}
                                className="rounded-lg p-1.5 text-slate-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-100 bg-slate-50/60">
                          <td colSpan={5} className="px-5 py-3 text-right font-semibold text-slate-600">
                            Total {currentRoom.name}:
                          </td>
                          <td className="px-3 py-3 text-right text-base font-bold text-brand-700">{formatRupiah(roomTotal)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card-base py-16 text-center">
              <Package className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">Pilih ruangan untuk mulai mengisi komponen.</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <button type="button" className="btn-secondary" onClick={onBack}>
          Kembali
        </button>
        <button type="button" className="btn-primary" onClick={onNext}>
          Lanjut ke Ringkasan RAB
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

      <ComponentPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={(comp, qty) => {
          addPart(comp, qty);
          setPickerOpen(false);
        }}
      />

      <DetectionModal
        open={detectionOpen}
        onClose={() => setDetectionOpen(false)}
        onConfirm={handleDetectionConfirm}
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
    <Modal open={open} onClose={onClose} title="Tambah Ruangan" subtitle="Masukkan nama ruangan baru." maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setName(preset)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-600 hover:border-brand-300 hover:bg-brand-50"
            >
              {preset}
            </button>
          ))}
        </div>
        <input
          autoFocus
          className="input-base"
          placeholder="Nama ruangan"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="button" className="btn-primary" disabled={!name.trim()} onClick={() => { onSave(name.trim()); setName(''); }}>
            Simpan
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ComponentPicker({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (comp: ComponentSpec, qty: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ComponentSpec | null>(null);
  const [qty, setQty] = useState(1);

  const filtered = COMPONENT_CATALOG.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.category.toLowerCase().includes(search.toLowerCase()));
  const categories = [...new Set(filtered.map((c) => c.category))];

  return (
    <Modal open={open} onClose={onClose} title="Pilih Komponen" subtitle="Cari dari katalog komponen kelistrikan." maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            className="input-base pl-10"
            placeholder="Cari komponen atau kategori..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-[40vh] space-y-4 overflow-y-auto pr-1">
          {categories.map((cat) => (
            <div key={cat}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${CATEGORY_COLORS[cat].dot}`} />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{cat}</h4>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {filtered.filter((c) => c.category === cat).map((comp) => (
                  <button
                    key={comp.id}
                    type="button"
                    onClick={() => {
                      setSelected(comp);
                      setQty(1);
                    }}
                    className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
                      selected?.id === comp.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-800">{comp.name}</div>
                      <div className="text-xs text-slate-500">{formatRupiah(comp.price)} / {comp.unit}</div>
                    </div>
                    {selected?.id === comp.id && <Check className="h-4 w-4 text-brand-600" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="py-8 text-center text-sm text-slate-500">Komponen tidak ditemukan.</div>}
        </div>

        {selected && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 animate-scale-in">
            <div>
              <div className="text-sm font-medium text-slate-800">{selected.name}</div>
              <div className="text-xs text-slate-500">{formatRupiah(selected.price)} / {selected.unit}</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Qty:</label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className="btn-ghost" onClick={onClose}>Batal</button>
          <button type="button" className="btn-primary" disabled={!selected} onClick={() => selected && onAdd(selected, qty)}>
            <Plus className="h-4 w-4" />
            Tambah ke Daftar
          </button>
        </div>
      </div>
    </Modal>
  );
}
