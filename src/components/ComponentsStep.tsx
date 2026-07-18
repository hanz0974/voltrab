import { Fragment, useEffect, useState } from "react";
import { subscribeToActiveComponents } from '../lib/componentCatalog';
import {
  Plus,
  Trash2,
  DoorOpen,
  Package,
  ScanLine,
  Search,
  Check,
  Edit,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import type {
  Floor,
  Room,
  PartItem,
  ComponentSpec,
  DetectionResult,
} from "../types";
import { CATEGORY_COLORS, formatRupiah, uid } from "../data";
import { CategoryBadge } from "./CategoryBadge";
import { Modal } from "./Modal";
import { DetectionModal } from "./DetectionModal";
import { supabase } from "../lib/supabase";
import { getBiayaUmumKoef } from "../lib/biayaUmumSetting";

type DetailJenis = "A. Tenaga kerja" | "B. Bahan" | "C. Peralatan";

interface DetailKomponenView {
  id: string;
  jenis: DetailJenis;
  uraian: string;
  satuan: string;
  koefisien: number;
  harga_satuan: number;
  jumlah_harga: number;
}

const DETAIL_JENIS_ORDER: DetailJenis[] = [
  "A. Tenaga kerja",
  "B. Bahan",
  "C. Peralatan",
];

const clampBiayaUmumKoef = (value: number): number => {
  if (!Number.isFinite(value)) return 0.1;
  return Math.min(0.15, Math.max(0.1, value));
};

interface ComponentsStepProps {
  projectName: string;
  floors: Floor[];
  onChange: (floors: Floor[]) => void;
  onNext: () => void;
  onBack: () => void;
  floorCount: number;
  onFloorCountChange: (count: number) => void;
}

export function ComponentsStep({
  projectName,
  floors,
  onChange,
  onNext,
  onBack,
  floorCount,
  onFloorCountChange,
}: ComponentsStepProps) {
  const [expandedId, setExpandedId] = useState<string | null>(
    floors[0]?.id ?? null,
  );
  const [editingRoom, setEditingRoom] = useState<{
    floorId: string;
    room: Room | null;
  } | null>(null);
  const [quickAddFloorId, setQuickAddFloorId] = useState<string | null>(null);
  const [quickAddCount, setQuickAddCount] = useState(1);
  const [addFloorsOpen, setAddFloorsOpen] = useState(false);
  const [floorAddCount, setFloorAddCount] = useState(1);
  const [pendingDeleteFloor, setPendingDeleteFloor] = useState<Floor | null>(null);
  const [activeRoom, setActiveRoom] = useState<{
    floorId: string;
    roomId: string;
  } | null>(() => {
    const firstFloor = floors[0];
    const firstRoom = firstFloor?.rooms[0];
    return firstRoom ? { floorId: firstFloor.id, roomId: firstRoom.id } : null;
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalogComponents, setCatalogComponents] = useState<ComponentSpec[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [detectionOpen, setDetectionOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmDeleteImageOpen, setConfirmDeleteImageOpen] = useState(false);
  const [editingRoomName, setEditingRoomName] = useState<{
    floorId: string;
    roomId: string;
  } | null>(null);
  const [roomNameDraft, setRoomNameDraft] = useState("");
  const [detailViewerOpen, setDetailViewerOpen] = useState(false);
  const [detailViewerLoading, setDetailViewerLoading] = useState(false);
  const [detailViewerError, setDetailViewerError] = useState<string | null>(null);
  const [detailViewerRows, setDetailViewerRows] = useState<DetailKomponenView[]>([]);
  const [detailViewerPartName, setDetailViewerPartName] = useState("");
  const [biayaUmumKoef, setBiayaUmumKoef] = useState(0.1);

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

  useEffect(() => {
    setCatalogLoading(true);
    const unsubscribe = subscribeToActiveComponents((components) => {
      setCatalogComponents(components);
      setCatalogLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (catalogComponents.length === 0) return;

    const priceByComponentId = new Map(
      catalogComponents.map((component) => [component.id, component.price]),
    );

    let hasChanges = false;
    const nextFloors = floors.map((floor) => ({
      ...floor,
      rooms: floor.rooms.map((room) => {
        const nextParts = room.parts.map((part) => {
          const latestPrice = priceByComponentId.get(part.componentId);
          if (latestPrice === undefined || latestPrice === part.price) {
            return part;
          }
          hasChanges = true;
          return { ...part, price: latestPrice };
        });

        return nextParts === room.parts ? room : { ...room, parts: nextParts };
      }),
    }));

    if (hasChanges) {
      onChange(nextFloors);
    }
  }, [catalogComponents, floors, onChange]);

  useEffect(() => {
    const loadBiayaUmumKoef = async () => {
      try {
        const value = await getBiayaUmumKoef();
        setBiayaUmumKoef(clampBiayaUmumKoef(value));
      } catch {
        // keep default value when settings cannot be loaded.
      }
    };

    void loadBiayaUmumKoef();
  }, []);

  const updateFloor = (floorId: string, patch: Partial<Floor>) => {
    onChange(floors.map((f) => (f.id === floorId ? { ...f, ...patch } : f)));
  };

  const updateRoom = (
    floorId: string,
    roomId: string,
    patch: Partial<Room>,
  ) => {
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
      inputMode: "detect",
      parts: [],
      detectionStatus: "idle",
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
      inputMode: "detect",
      parts: [],
      detectionStatus: "idle",
    }));

    updateFloor(floorId, { rooms: [...floor.rooms, ...newRooms] });
    setQuickAddFloorId(null);
    setQuickAddCount(1);
    if (newRooms.length > 0) {
      setActiveRoom({ floorId, roomId: newRooms[0].id });
    }
  };

  const addFloors = (count: number) => {
    if (count < 1) return;

    const newFloors: Floor[] = Array.from({ length: count }, (_, index) => ({
      id: uid(),
      name: `Lantai ${floors.length + index + 1}`,
      rooms: [],
    }));

    onChange([...floors, ...newFloors]);
    setExpandedId(newFloors[0]?.id ?? expandedId);
    if (newFloors.length > 0) {
      setActiveRoom(null);
    }
  };

  const totalRooms = floors.reduce((sum, f) => sum + f.rooms.length, 0);
  const currentFloor = floors.find((f) => f.id === activeRoom?.floorId);
  const currentRoom = currentFloor?.rooms.find(
    (r) => r.id === activeRoom?.roomId,
  );

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
      parts: currentRoom.parts.map((p) =>
        p.id === partId ? { ...p, ...patch } : p,
      ),
    });
  };

  const deletePart = (partId: string) => {
    if (!activeRoom || !currentRoom) return;
    updateRoom(activeRoom.floorId, activeRoom.roomId, {
      parts: currentRoom.parts.filter((p) => p.id !== partId),
    });
  };

  const deleteAllParts = () => {
    if (!activeRoom || !currentRoom) return;
    updateRoom(activeRoom.floorId, activeRoom.roomId, {
      parts: [],
    });
    setConfirmClearOpen(false);
  };

  const handleDetectionComplete = (
    image: string,
    detections: DetectionResult[],
  ) => {
    if (!activeRoom || !currentRoom) return;
    updateRoom(activeRoom.floorId, activeRoom.roomId, {
      detectionImage: image,
      detections,
      detectionStatus: "done",
    });
  };

  const handleDetectionConfirm = (parts: PartItem[]) => {
    if (!activeRoom || !currentRoom) return;
    updateRoom(activeRoom.floorId, activeRoom.roomId, {
      parts: [...currentRoom.parts, ...parts],
      inputMode: "detect",
      detectionStatus: parts.length > 0 ? "done" : "error",
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
      setRoomNameDraft("");
      return;
    }

    updateRoom(floorId, roomId, { name: trimmedName });
    setEditingRoomName(null);
    setRoomNameDraft("");
  };

  const roomTotal =
    currentRoom?.parts.reduce((s, p) => s + p.quantity * p.price, 0) ?? 0;
  const detectionImage = currentRoom?.detectionImage;
  const detectionResults = currentRoom?.detections ?? [];

  const openDetailViewer = async (part: PartItem) => {
    setDetailViewerPartName(part.name);
    setDetailViewerOpen(true);
    setDetailViewerLoading(true);
    setDetailViewerError(null);

    const { data, error } = await supabase
      .from("detail_komponen")
      .select("id, jenis, uraian, satuan, koefisien, harga_satuan, jumlah_harga")
      .eq("component_id", part.componentId)
      .order("created_at", { ascending: true });

    if (error) {
      setDetailViewerRows([]);
      setDetailViewerError(error.message ?? "Gagal memuat detail komponen");
    } else {
      setDetailViewerRows((data ?? []) as DetailKomponenView[]);
    }

    setDetailViewerLoading(false);
  };

  const closeDetailViewer = () => {
    setDetailViewerOpen(false);
    setDetailViewerRows([]);
    setDetailViewerPartName("");
    setDetailViewerError(null);
    setDetailViewerLoading(false);
  };

  const groupedDetailViewerRows = DETAIL_JENIS_ORDER.map((jenis) => ({
    jenis,
    rows: detailViewerRows.filter((row) => row.jenis === jenis),
  }));
  const dTotal = detailViewerRows.reduce((sum, row) => sum + Number(row.jumlah_harga || 0), 0);
  const eTotal = dTotal * biayaUmumKoef;
  const fTotal = dTotal + eTotal;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="card-base overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                Komponen & Struktur Bangunan
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Atur lantai, ruangan, lalu isi komponen untuk setiap ruangan.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl bg-white px-3 py-2 shadow-soft min-w-[140px]">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  Total Lantai
                </div>
                <div className="text-lg font-bold text-slate-900">
                  {floors.length}
                </div>
              </div>
              <div className="rounded-xl bg-white px-3 py-2 shadow-soft min-w-[140px]">
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      Total Ruangan
                    </div>
                    <div className="text-lg font-bold text-slate-900">
                      {totalRooms}
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl px-4 py-3 text-slate-400">
                <button
                  type="button"
                  onClick={() => setAddFloorsOpen(true)}
                  className="w-full rounded-2xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
                >
                  Tambah Lantai
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(300px,360px)_1fr] py-4">
          <div className="space-y-4">
            {floors.map((floor, idx) => (
              <div key={floor.id} className="card-base overflow-hidden">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setExpandedId(expandedId === floor.id ? null : floor.id)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(expandedId === floor.id ? null : floor.id);
                    }
                  }}
                  className="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      {floor.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {floor.rooms.length} ruangan
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteFloor(floor);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition-colors hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Hapus lantai ${floor.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {expandedId === floor.id && (
                  <div className="p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <input
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                        value={floor.name}
                        onChange={(e) =>
                          updateFloor(floor.id, { name: e.target.value })
                        }
                      />
                    </div>

                    {floor.rooms.length === 0 ? (
                      <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
                        Belum ada ruangan.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {floor.rooms.map((room) => {
                          const isActive =
                            activeRoom?.floorId === floor.id &&
                            activeRoom?.roomId === room.id;
                          const isEditing =
                            editingRoomName?.floorId === floor.id &&
                            editingRoomName?.roomId === room.id;

                          return (
                            <div
                              key={room.id}
                              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${
                                isActive
                                  ? "border-brand-300 bg-brand-50 text-brand-700"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveRoom({
                                    floorId: floor.id,
                                    roomId: room.id,
                                  })
                                }
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
                                      onChange={(e) =>
                                        setRoomNameDraft(e.target.value)
                                      }
                                      onBlur={() =>
                                        saveRoomName(
                                          floor.id,
                                          room.id,
                                          roomNameDraft,
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          saveRoomName(
                                            floor.id,
                                            room.id,
                                            roomNameDraft,
                                          );
                                        }
                                        if (e.key === "Escape") {
                                          setEditingRoomName(null);
                                          setRoomNameDraft("");
                                        }
                                      }}
                                      className="w-full truncate rounded-md border border-brand-200 bg-white px-2 py-1 text-sm font-medium text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                                    />
                                  ) : (
                                    <div className="truncate text-sm font-medium">
                                      {room.name}
                                    </div>
                                  )}
                                  <div className="text-xs text-slate-500">
                                    {room.parts.length} komponen
                                  </div>
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingRoomName({
                                    floorId: floor.id,
                                    roomId: room.id,
                                  });
                                  setRoomNameDraft(room.name);
                                }}
                                className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700"
                                aria-label={`Edit nama ruangan ${room.name}`}
                              >
                                <Edit className="h-4 w-4" />
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
                      onClick={() =>
                        setEditingRoom({ floorId: floor.id, room: null })
                      }
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
                            onClick={() =>
                              setQuickAddCount(Math.max(1, quickAddCount - 1))
                            }
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
                            onChange={(e) =>
                              setQuickAddCount(
                                Math.max(
                                  1,
                                  Math.min(50, Number(e.target.value) || 1),
                                ),
                              )
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setQuickAddCount(Math.min(50, quickAddCount + 1))
                            }
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-300 bg-white text-sm font-semibold text-brand-700"
                          >
                            +
                          </button>
                          <span className="text-xs text-slate-500">
                            ruangan
                          </span>
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
                            onClick={() =>
                              addMultipleRooms(floor.id, quickAddCount)
                            }
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
                      <h3 className="text-lg font-bold text-slate-900">
                        {currentRoom.name}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {currentFloor?.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          updateRoom(activeRoom!.floorId, activeRoom!.roomId, {
                            inputMode: "detect",
                          });
                          setDetectionOpen(true);
                        }}
                        className="chip bg-accent-100 text-accent-700 transition-colors hover:bg-accent-200"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-white shadow-sm">
                            <ScanLine className="h-3 w-3 text-accent-700" />
                          </div>
                          <h4 className="font-semibold text-accent-700">
                            Upload SLD
                          </h4>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-3 min-h-[320px]">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            Hasil Deteksi SLD
                          </div>
                          <div className="text-xs text-slate-500">
                            Bounding box ditampilkan pada gambar.
                          </div>
                        </div>
                        {detectionImage && (
                          <button
                            type="button"
                            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100"
                            onClick={() => setConfirmDeleteImageOpen(true)}
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                      <div
                        className="relative overflow-hidden rounded-2xl bg-slate-50"
                        style={{ width: "100%", minHeight: 260 }}
                      >
                        {detectionImage ? (
                          <img
                            src={detectionImage}
                            alt="Hasil deteksi SLD"
                            className="block w-full"
                            style={{ height: "auto" }}
                          />
                        ) : (
                          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-slate-400">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                              <ImageIcon className="h-8 w-8" />
                            </div>
                            <div className="text-center text-sm font-medium text-slate-600">
                              Belum ada gambar SLD yang diunggah.
                            </div>
                            <div className="text-center text-xs text-slate-500">
                              Klik tombol Upload SLD untuk menambahkan gambar.
                            </div>
                          </div>
                        )}
                        {detectionResults.map((d) => (
                          <div
                            key={d.id}
                            className="absolute border-2 border-brand-400 bg-brand-400/10"
                            style={{
                              left: `${d.bbox.x}%`,
                              top: `${d.bbox.y}%`,
                              width: `${d.bbox.width}%`,
                              height: `${d.bbox.height}%`,
                            }}
                          >
                            <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                              {d.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="card-base overflow-visible my-5">
                    <div className="border-b border-slate-100 px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="font-semibold text-slate-700">
                          Daftar Komponen
                        </h4>
                        {currentRoom.parts.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setConfirmClearOpen(true)}
                            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100"
                          >
                            Hapus Semua
                          </button>
                        )}
                      </div>
                    </div>

                    {currentRoom.parts.length === 0 ? (
                      <div className="py-12 text-center">
                        <Package className="mx-auto h-10 w-10 text-slate-300" />
                        <p className="mt-2 text-sm text-slate-500">
                          Belum ada komponen. Unggah SLD untuk memulai deteksi.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                              <th className="px-5 py-3 font-semibold">
                                Komponen
                              </th>
                              <th className="px-3 py-3 font-semibold">
                                Kategori
                              </th>
                              <th className="px-3 py-3 text-center font-semibold">
                                Qty
                              </th>
                              <th className="px-3 py-3 font-semibold">
                                Satuan
                              </th>
                              <th className="px-3 py-3 text-right font-semibold">
                                Harga
                              </th>
                              <th className="px-3 py-3 text-right font-semibold">
                                Subtotal
                              </th>
                              <th className="px-3 py-3" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {currentRoom.parts.map((part) => (
                              <tr
                                key={part.id}
                                className="group transition-colors hover:bg-slate-50/50"
                              >
                                <td className="px-5 py-3 font-medium text-slate-800">
                                  {part.name}
                                </td>
                                <td className="px-3 py-3">
                                  <CategoryBadge
                                    category={part.category}
                                    size="sm"
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    type="number"
                                    min={1}
                                    value={part.quantity}
                                    onChange={(e) =>
                                      updatePart(part.id, {
                                        quantity: Math.max(
                                          1,
                                          Number(e.target.value) || 1,
                                        ),
                                      })
                                    }
                                    className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                                  />
                                </td>
                                <td className="px-3 py-3 text-slate-500">
                                  {part.unit}
                                </td>
                                <td className="px-3 py-3 text-right text-slate-600">
                                  {formatRupiah(part.price)}
                                </td>
                                <td className="px-3 py-3 text-right font-semibold text-slate-900">
                                  {formatRupiah(part.quantity * part.price)}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void openDetailViewer(part);
                                      }}
                                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition-all hover:bg-brand-50 hover:text-brand-800"
                                      title="Lihat Detail Komponen"
                                    >
                                      Detail
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deletePart(part.id)}
                                      className="rounded-lg p-1.5 text-slate-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-100 bg-slate-50/60">
                              <td
                                colSpan={5}
                                className="px-5 py-3 text-right font-semibold text-slate-600"
                              >
                                Total {currentRoom.name}:
                              </td>
                              <td className="px-3 py-3 text-right text-base font-bold text-brand-700">
                                {formatRupiah(roomTotal)}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="card-base py-16 text-center">
                <Package className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">
                  Pilih ruangan untuk mulai mengisi komponen.
                </p>
              </div>
            )}
          </div>
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
        catalogComponents={catalogComponents}
        catalogLoading={catalogLoading}
      />

      <DetectionModal
        open={detectionOpen}
        onClose={() => setDetectionOpen(false)}
        onConfirm={handleDetectionConfirm}
        onComplete={handleDetectionComplete}
        projectName={projectName || "Project Tanpa Nama"}
        floorName={currentFloor?.name ?? "-"}
        roomName={currentRoom?.name ?? "-"}
        catalogComponents={catalogComponents}
        catalogLoading={catalogLoading}
      />

      <Modal
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        title="Konfirmasi Hapus Semua"
        subtitle="Semua komponen di ruangan ini akan dihapus."
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Apakah Anda yakin ingin menghapus semua komponen pada ruangan ini?
            Tindakan ini tidak dapat dibatalkan.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmClearOpen(false)}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={deleteAllParts}
            >
              Hapus Semua
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmDeleteImageOpen}
        onClose={() => setConfirmDeleteImageOpen(false)}
        title="Konfirmasi Hapus Gambar"
        subtitle="Gambar SLD dan bounding box akan dihapus dari tampilan ini."
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Apakah Anda yakin ingin menghapus gambar SLD dan hasil deteksi yang
            sudah ditampilkan? Tindakan ini tidak akan memengaruhi komponen yang
            sudah ditambahkan ke daftar.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmDeleteImageOpen(false)}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                updateRoom(activeRoom!.floorId, activeRoom!.roomId, {
                  detectionImage: undefined,
                  detections: undefined,
                  detectionStatus: "idle",
                });
                setConfirmDeleteImageOpen(false);
              }}
            >
              Hapus Gambar
            </button>
          </div>
        </div>
      </Modal>

      <AddFloorsModal
        open={addFloorsOpen}
        onClose={() => setAddFloorsOpen(false)}
        count={floorAddCount}
        onCountChange={setFloorAddCount}
        onSave={() => {
          addFloors(floorAddCount);
          setAddFloorsOpen(false);
          setFloorAddCount(1);
        }}
      />

      <Modal
        open={Boolean(pendingDeleteFloor)}
        onClose={() => setPendingDeleteFloor(null)}
        title="Konfirmasi Hapus Lantai"
        subtitle={
          pendingDeleteFloor
            ? `${pendingDeleteFloor.name} akan dihapus.`
            : undefined
        }
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Semua ruangan dan data di lantai ini akan dihapus. Tindakan ini tidak dapat dibatalkan.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPendingDeleteFloor(null)}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (!pendingDeleteFloor) return;
                const nextFloors = floors.filter(
                  (floor) => floor.id !== pendingDeleteFloor.id,
                );
                onChange(nextFloors);
                if (activeRoom?.floorId === pendingDeleteFloor.id) {
                  const nextFloor = nextFloors[0];
                  const nextRoom = nextFloor?.rooms[0];
                  setActiveRoom(
                    nextRoom
                      ? { floorId: nextFloor.id, roomId: nextRoom.id }
                      : null,
                  );
                }
                setExpandedId(nextFloors[0]?.id ?? null);
                setPendingDeleteFloor(null);
              }}
            >
              Hapus Lantai
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={detailViewerOpen}
        onClose={closeDetailViewer}
        title="Detail Komponen"
        subtitle={detailViewerPartName}
        maxWidth="max-w-5xl"
      >
        <div className="space-y-4">
          {detailViewerLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="ml-2 text-sm">Memuat detail komponen...</span>
            </div>
          ) : detailViewerError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {detailViewerError}
            </div>
          ) : detailViewerRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              Detail komponen belum tersedia.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-sm text-slate-600">Total detail komponen</div>
                <div className="text-sm font-semibold text-slate-900">{formatRupiah(Math.round(fTotal))}</div>
              </div>

              <div className="max-h-[65vh] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Uraian</th>
                    <th className="px-3 py-3 font-semibold">Sat</th>
                    <th className="px-3 py-3 text-right font-semibold">Koefisien</th>
                    <th className="px-3 py-3 text-right font-semibold">Harga Satuan (Rp)</th>
                    <th className="px-3 py-3 text-right font-semibold">Jumlah Harga (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {groupedDetailViewerRows.map((group) => (
                    <Fragment key={group.jenis}>
                      <tr key={`heading-${group.jenis}`} className="bg-slate-100/70">
                        <td colSpan={5} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                          {group.jenis}
                        </td>
                      </tr>
                      {group.rows.length === 0 ? (
                        <tr key={`empty-${group.jenis}`}>
                          <td colSpan={5} className="px-4 py-2 italic text-slate-400">
                            Tidak ada data.
                          </td>
                        </tr>
                      ) : (
                        group.rows.map((row) => (
                          <tr key={row.id}>
                            <td className="px-4 py-3 text-slate-800">{row.uraian}</td>
                            <td className="px-3 py-3 text-slate-500">{row.satuan}</td>
                            <td className="px-3 py-3 text-right text-slate-600">
                              {Number(row.koefisien).toLocaleString("id-ID", { maximumFractionDigits: 4 })}
                            </td>
                            <td className="px-3 py-3 text-right text-slate-600">{formatRupiah(Number(row.harga_satuan))}</td>
                            <td className="px-3 py-3 text-right font-semibold text-slate-900">
                              {formatRupiah(Number(row.jumlah_harga))}
                            </td>
                          </tr>
                        ))
                      )}
                    </Fragment>
                  ))}

                  <tr className="bg-slate-100">
                    <td className="px-4 py-2 font-semibold text-slate-800">D. Jumlah A + B + C</td>
                    <td className="px-3 py-2 text-slate-500">-</td>
                    <td className="px-3 py-2 text-right text-slate-500">-</td>
                    <td className="px-3 py-2 text-right text-slate-500">-</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatRupiah(Math.round(dTotal))}</td>
                  </tr>

                  <tr className="bg-amber-50/70">
                    <td className="px-4 py-2 font-semibold text-slate-800">E. Biaya Umum dan Keuntungan</td>
                    <td className="px-3 py-2 text-slate-600">x D</td>
                    <td className="px-3 py-2 text-right text-slate-700">{(biayaUmumKoef * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right text-slate-500">-</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatRupiah(Math.round(eTotal))}</td>
                  </tr>

                  <tr className="bg-emerald-50/70">
                    <td className="px-4 py-2 font-semibold text-slate-900">F. Harga Satuan Pekerjaan (D + E)</td>
                    <td className="px-3 py-2 text-slate-500">-</td>
                    <td className="px-3 py-2 text-right text-slate-500">-</td>
                    <td className="px-3 py-2 text-right text-slate-500">-</td>
                    <td className="px-3 py-2 text-right font-bold text-slate-900">{formatRupiah(Math.round(fTotal))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            </div>
          )}

          <div className="flex justify-end">
            <button type="button" className="btn-secondary" onClick={closeDetailViewer}>
              Tutup
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AddFloorsModal({
  open,
  onClose,
  count,
  onCountChange,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  onCountChange: (next: number) => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tambah Lantai"
      subtitle="Masukkan jumlah lantai yang ingin ditambahkan."
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onCountChange(Math.max(1, count - 1))}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-semibold text-slate-600 transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            value={count}
            onChange={(e) =>
              onCountChange(Math.max(1, Number(e.target.value) || 1))
            }
            className="input-base w-24 text-center text-lg font-bold"
          />
          <button
            type="button"
            onClick={() => onCountChange(count + 1)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-semibold text-slate-600 transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            +
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button type="button" className="btn-primary" onClick={onSave}>
            Tambah
          </button>
        </div>
      </div>
    </Modal>
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
  const [name, setName] = useState("");
  const presets = [
    "Ruang Tamu",
    "Kamar Tidur",
    "Dapur",
    "Kamar Mandi",
    "Ruang Kerja",
    "Gudang",
    "Garasi",
    "Koridor",
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tambah Ruangan"
      subtitle="Masukkan nama ruangan baru."
      maxWidth="max-w-md"
    >
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
          <button
            type="button"
            className="btn-primary"
            disabled={!name.trim()}
            onClick={() => {
              onSave(name.trim());
              setName("");
            }}
          >
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
  catalogComponents,
  catalogLoading,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (comp: ComponentSpec, qty: number) => void;
  catalogComponents: ComponentSpec[];
  catalogLoading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ComponentSpec | null>(null);
  const [qty, setQty] = useState(1);

  const filtered = catalogComponents.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase()),
  );
  const categories = [...new Set(filtered.map((c) => c.category))];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pilih Komponen"
      subtitle="Cari dari katalog komponen kelistrikan."
      maxWidth="max-w-2xl"
    >
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
          {catalogLoading ? (
            <div className="py-8 text-center text-sm text-slate-500">Memuat katalog komponen...</div>
          ) : categories.map((cat) => (
            <div key={cat}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${CATEGORY_COLORS[cat].dot}`}
                />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {cat}
                </h4>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {filtered
                  .filter((c) => c.category === cat)
                  .map((comp) => (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => {
                        setSelected(comp);
                        setQty(1);
                      }}
                      className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
                        selected?.id === comp.id
                          ? "border-brand-600 bg-brand-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          {comp.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatRupiah(comp.price)} / {comp.unit}
                        </div>
                      </div>
                      {selected?.id === comp.id && (
                        <Check className="h-4 w-4 text-brand-600" />
                      )}
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {!catalogLoading && filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">
              Komponen tidak ditemukan atau semua komponen sedang nonaktif.
            </div>
          )}
        </div>

        {selected && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 animate-scale-in">
            <div>
              <div className="text-sm font-medium text-slate-800">
                {selected.name}
              </div>
              <div className="text-xs text-slate-500">
                {formatRupiah(selected.price)} / {selected.unit}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Qty:</label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) =>
                  setQty(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!selected}
            onClick={() => selected && onAdd(selected, qty)}
          >
            <Plus className="h-4 w-4" />
            Tambah ke Daftar
          </button>
        </div>
      </div>
    </Modal>
  );
}
