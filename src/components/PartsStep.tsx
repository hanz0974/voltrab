import { useState } from 'react';
import { Plus, Trash2, Search, Package, Check, PencilLine, ScanLine } from 'lucide-react';
import type { Floor, PartItem, ComponentSpec } from '../types';
import { COMPONENT_CATALOG, CATEGORY_COLORS, formatRupiah, uid } from '../data';
import { CategoryBadge } from './CategoryBadge';
import { Modal } from './Modal';

interface PartsStepProps {
  floors: Floor[];
  onChange: (floors: Floor[]) => void;
  onNext: () => void;
  onBack: () => void;
  onOpenDetection: (floorId: string, roomId: string) => void;
}

export function PartsStep({ floors, onChange, onNext, onBack, onOpenDetection }: PartsStepProps) {
  const [activeRoom, setActiveRoom] = useState<{ floorId: string; roomId: string } | null>(() => {
    const first = floors[0]?.rooms[0];
    return first ? { floorId: floors[0].id, roomId: first.id } : null;
  });
  const [pickerOpen, setPickerOpen] = useState(false);

  const currentFloor = floors.find((f) => f.id === activeRoom?.floorId);
  const currentRoom = currentFloor?.rooms.find((r) => r.id === activeRoom?.roomId);

  const updateRoom = (floorId: string, roomId: string, patch: Partial<typeof currentRoom>) => {
    onChange(
      floors.map((f) =>
        f.id === floorId
          ? { ...f, rooms: f.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)) }
          : f,
      ),
    );
  };

  const addPart = (component: ComponentSpec, qty: number) => {
    if (!activeRoom) return;
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
      parts: [...(currentRoom?.parts ?? []), part],
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

  const roomTotal = currentRoom?.parts.reduce((s, p) => s + p.quantity * p.price, 0) ?? 0;

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Komponen Kelistrikan</h2>
        <p className="mt-1 text-sm text-slate-500">
          Isi komponen untuk setiap ruangan. Pilih ruangan di sidebar kiri untuk mulai.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Sidebar room list */}
        <div className="card-base overflow-hidden lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)]">
          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-700">Daftar Ruangan</h3>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2 lg:max-h-[calc(100vh-200px)]">
            {floors.map((floor) => (
              <div key={floor.id} className="mb-2">
                <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {floor.name}
                </div>
                {floor.rooms.map((room) => {
                  const isActive = activeRoom?.roomId === room.id;
                  return (
                    <button
                      key={room.id}
                      onClick={() => setActiveRoom({ floorId: floor.id, roomId: room.id })}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all ${
                        isActive ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-200' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          room.inputMode === 'detect' ? 'bg-accent-100 text-accent-700' : 'bg-brand-100 text-brand-700'
                        }`}
                      >
                        {room.inputMode === 'detect' ? (
                          <span className="text-[10px] font-bold">SLD</span>
                        ) : (
                          <Package className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">{room.name}</div>
                        <div className="text-xs text-slate-500">{room.parts.length} komponen</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
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
                    <span
                      className={`chip ${
                        currentRoom.inputMode === 'detect'
                          ? 'bg-accent-100 text-accent-700'
                          : 'bg-brand-100 text-brand-700'
                      }`}
                    >
                      {currentRoom.inputMode === 'detect' ? 'Deteksi SLD' : 'Input Manual'}
                    </span>
                  </div>
                </div>

                {/* Mode selection or detection section */}
                <div className="mt-4 space-y-3">
                  <div>
                    <h4 className="font-semibold text-slate-800">Pilih Metode Input Komponen</h4>
                    <p className="text-sm text-slate-500">Pilih cara menambahkan komponen untuk ruangan ini</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      onClick={() => {
                        updateRoom(activeRoom!.floorId, activeRoom!.roomId, { inputMode: 'manual' });
                        setPickerOpen(true);
                      }}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        currentRoom.inputMode === 'manual'
                          ? 'border-brand-600 bg-brand-50 text-brand-700'
                          : 'border-brand-200 bg-brand-50/50 text-brand-700 hover:border-brand-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm">
                          <PencilLine className="h-5 w-5" />
                        </div>
                        <h4 className="font-semibold">Input Manual</h4>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">Isi komponen satu per satu dari katalog. Cocok untuk ruangan sederhana atau revisi cepat.</p>
                    </button>
                    <button
                      onClick={() => {
                        updateRoom(activeRoom!.floorId, activeRoom!.roomId, { inputMode: 'detect' });
                        onOpenDetection(activeRoom!.floorId, activeRoom!.roomId);
                      }}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        currentRoom.inputMode === 'detect'
                          ? 'border-accent-600 bg-accent-50 text-accent-700'
                          : 'border-accent-200 bg-accent-50/50 text-accent-700 hover:border-accent-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm">
                          <ScanLine className="h-5 w-5" />
                        </div>
                        <h4 className="font-semibold">Deteksi SLD (YOLOv8 + OCR)</h4>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">Unggah diagram SLD, sistem mendeteksi simbol & teks komponen secara otomatis.</p>
                    </button>
                  </div>
                  {currentRoom.inputMode === 'detect' && currentRoom.detectionStatus === 'done' && (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      <Check className="h-4 w-4" />
                      {currentRoom.detections?.length ?? 0} komponen terdeteksi. Periksa & sesuaikan di tabel bawah.
                    </div>
                  )}
                </div>
              </div>

              <div className="card-base overflow-hidden">
                <div className="border-b border-slate-100 px-5 py-3">
                  <h4 className="font-semibold text-slate-700">Daftar Komponen</h4>
                </div>

                {currentRoom.parts.length === 0 ? (
                  <div className="py-12 text-center">
                    <Package className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">Belum ada komponen. Tambahkan dari katalog atau deteksi SLD.</p>
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
                          <th className="px-3 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {currentRoom.parts.map((part) => (
                          <tr key={part.id} className="group transition-colors hover:bg-slate-50/50">
                            <td className="px-5 py-3 font-medium text-slate-800">{part.name}</td>
                            <td className="px-3 py-3">
                              <CategoryBadge category={part.category} size="sm" />
                            </td>
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
                            <td className="px-3 py-3 text-right font-semibold text-slate-900">
                              {formatRupiah(part.quantity * part.price)}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <button
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
                          <td className="px-3 py-3 text-right text-base font-bold text-brand-700">
                            {formatRupiah(roomTotal)}
                          </td>
                          <td></td>
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
        <button className="btn-secondary" onClick={onBack}>
          Kembali
        </button>
        <button className="btn-primary" onClick={onNext}>
          Lanjut ke Ringkasan RAB
        </button>
      </div>

      <ComponentPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={(comp, qty) => {
          addPart(comp, qty);
          setPickerOpen(false);
        }}
      />
    </div>
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

  const filtered = COMPONENT_CATALOG.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.category.toLowerCase().includes(search.toLowerCase()),
  );

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
                {filtered
                  .filter((c) => c.category === cat)
                  .map((comp) => (
                    <button
                      key={comp.id}
                      onClick={() => {
                        setSelected(comp);
                        setQty(1);
                      }}
                      className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
                        selected?.id === comp.id
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
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
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">Komponen tidak ditemukan.</div>
          )}
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
          <button className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button className="btn-primary" disabled={!selected} onClick={() => selected && onAdd(selected, qty)}>
            <Plus className="h-4 w-4" />
            Tambah ke Daftar
          </button>
        </div>
      </div>
    </Modal>
  );
}
