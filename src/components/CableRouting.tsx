import { Fragment, useMemo, useState } from 'react';
import type React from 'react';
import { Calculator, Check, Plus, Route, Ruler, Trash2, Undo2, Wand2, X } from 'lucide-react';
import type { ComponentSpec, DetectionResult, PartItem } from '../types';
import { formatRupiah, uid } from '../data';
import {
  type CableParams,
  type CableRoute,
  type ImageSize,
  type RoutePoint,
  detectionCenter,
  dropVertex,
  insertVertex,
  minimumSpanningPaths,
  moveVertex,
  orthogonalize,
  pathSegments,
  pixelDistance,
  removeVertex,
  routeMetrics,
  snapToDetection,
  symbolKind,
} from '../lib/cableRouting';

/** Semua jalur memakai satu warna; jalur yang dipilih dibedakan dengan garis yang lebih tebal. */
const ROUTE_COLOR = '#f59e0b';

/** Akhiran nama komponen kabel hasil jalur, dipakai untuk mengganti hasil sebelumnya pada ruangan yang sama. */
export const CABLE_PART_SUFFIX = '(Jalur Kabel Denah)';

const formatMeters = (value: number) => `${value.toLocaleString('id-ID', { maximumFractionDigits: 1 })} m`;

type CableMode = 'idle' | 'calibrating' | 'drawing';

/** State dan aksi fitur jalur kabel. */
export function useCableRouting(detections: DetectionResult[], cableComponents: ComponentSpec[]) {
  const [mode, setMode] = useState<CableMode>('idle');
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [calibration, setCalibration] = useState<RoutePoint[]>([]);
  const [referenceLength, setReferenceLength] = useState('1.0');
  const [inputs, setInputs] = useState({
    ceilingHeight: '3.0',
    switchHeight: '1.5',
    socketHeight: '0.3',
    tolerancePercent: '10',
  });
  const [orthogonal, setOrthogonal] = useState(true);
  const [routes, setRoutes] = useState<CableRoute[]>([]);
  const [draft, setDraft] = useState<RoutePoint[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const params: CableParams = {
    ceilingHeight: parseFloat(inputs.ceilingHeight) || 0,
    switchHeight: parseFloat(inputs.switchHeight) || 0,
    socketHeight: parseFloat(inputs.socketHeight) || 0,
    tolerancePercent: parseFloat(inputs.tolerancePercent) || 0,
  };

  const metersPerPixel = useMemo(() => {
    if (calibration.length < 2 || !imageSize) return null;
    const pixels = pixelDistance(calibration[0], calibration[1], imageSize);
    const meters = parseFloat(referenceLength);
    return pixels > 0 && meters > 0 ? meters / pixels : null;
  }, [calibration, imageSize, referenceLength]);

  const detectionsById = useMemo(() => new Map(detections.map((d) => [d.id, d])), [detections]);

  const metrics = useMemo(() => {
    if (!metersPerPixel || !imageSize) return new Map<string, ReturnType<typeof routeMetrics>>();
    return new Map(routes.map((route) => [route.id, routeMetrics(route, detectionsById, imageSize, metersPerPixel, params)]));
    // params dibentuk ulang dari inputs pada setiap render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, detectionsById, imageSize, metersPerPixel, inputs]);

  /** Total meter per komponen kabel di katalog. */
  const totalsByComponent = useMemo(() => {
    const totals = new Map<string, number>();
    for (const route of routes) {
      const value = metrics.get(route.id);
      if (!value || !route.componentId) continue;
      totals.set(route.componentId, (totals.get(route.componentId) ?? 0) + value.total);
    }
    return totals;
  }, [routes, metrics]);

  const defaultComponentId = cableComponents[0]?.id ?? '';

  const handleImageClick = (point: { x: number; y: number }, displaySize: ImageSize) => {
    // Ukuran asli gambar diisi dari onLoad; ukuran tampilan hanya dipakai bila belum tersedia.
    if (!imageSize) setImageSize(displaySize);
    if (mode === 'calibrating') {
      const next = [...calibration, { x: point.x, y: point.y }];
      setCalibration(next);
      if (next.length >= 2) setMode('idle');
      return;
    }
    if (mode === 'drawing') {
      setDraft((current) => [...current, snapToDetection(point, detections)]);
      return;
    }
    // Klik pada area kosong gambar membatalkan pilihan jalur
    setSelectedRouteId(null);
  };

  const startCalibration = () => {
    setDraft([]);
    setSelectedRouteId(null);
    setCalibration([]);
    setMode('calibrating');
  };

  const startDrawing = () => {
    setDraft([]);
    setSelectedRouteId(null);
    setMode('drawing');
  };

  const finishRoute = () => {
    if (draft.length < 2) return;
    const id = uid();
    setRoutes((current) => [
      ...current,
      {
        id,
        name: `Jalur ${current.filter((r) => !r.auto).length + 1}`,
        componentId: defaultComponentId,
        paths: [orthogonal ? orthogonalize(draft) : draft],
        auto: false,
      },
    ]);
    setDraft([]);
    setMode('idle');
    setSelectedRouteId(id);
  };

  const cancelActiveMode = () => {
    setDraft([]);
    setMode('idle');
  };

  const removeLastPoint = () => setDraft((current) => current.slice(0, -1));

  /** Jalur otomatis dipisah per rangkaian: penerangan (lampu dan saklar) serta stop kontak. */
  const autoConnect = () => {
    if (!imageSize) return;
    const groups = [
      { name: 'Penerangan (otomatis)', kinds: ['lamp', 'switch'] },
      { name: 'Stop kontak (otomatis)', kinds: ['socket'] },
    ];
    const autoRoutes: CableRoute[] = [];
    for (const group of groups) {
      const nodes = detections.filter((d) => group.kinds.includes(symbolKind(d.label))).map(detectionCenter);
      if (nodes.length < 2) continue;
      autoRoutes.push({
        id: uid(),
        name: group.name,
        componentId: defaultComponentId,
        paths: minimumSpanningPaths(nodes, imageSize),
        auto: true,
      });
    }
    setRoutes((current) => [...current.filter((r) => !r.auto), ...autoRoutes]);
    setSelectedRouteId(null);
    cancelActiveMode();
  };

  /** Ubah satu path. Jalur otomatis yang diedit menjadi jalur manual agar tidak tertimpa saat dihubungkan ulang. */
  const updatePath = (routeId: string, pathIndex: number, change: (path: RoutePoint[]) => RoutePoint[]) =>
    setRoutes((current) =>
      current.map((route) =>
        route.id !== routeId
          ? route
          : { ...route, auto: false, paths: route.paths.map((path, i) => (i === pathIndex ? change(path) : path)) },
      ),
    );

  const editVertex = {
    move: (routeId: string, pathIndex: number, index: number, point: { x: number; y: number }) =>
      updatePath(routeId, pathIndex, (path) => moveVertex(path, index, point)),
    drop: (routeId: string, pathIndex: number, index: number) =>
      updatePath(routeId, pathIndex, (path) => dropVertex(path, index, detections)),
    insert: (routeId: string, pathIndex: number, index: number, point: { x: number; y: number }) =>
      updatePath(routeId, pathIndex, (path) => insertVertex(path, index, point)),
    remove: (routeId: string, pathIndex: number, index: number) =>
      updatePath(routeId, pathIndex, (path) => removeVertex(path, index)),
  };

  const deleteRoute = (id: string) => {
    setRoutes((current) => current.filter((r) => r.id !== id));
    setSelectedRouteId((current) => (current === id ? null : current));
  };

  const setRouteComponent = (id: string, componentId: string) =>
    setRoutes((current) => current.map((r) => (r.id === id ? { ...r, componentId } : r)));

  const buildParts = (catalogComponents: ComponentSpec[]): PartItem[] =>
    Array.from(totalsByComponent.entries()).flatMap(([componentId, meters]) => {
      const component = catalogComponents.find((c) => c.id === componentId);
      if (!component || meters <= 0) return [];
      return [{
        id: uid(),
        componentId: component.id,
        name: `${component.name} ${CABLE_PART_SUFFIX}`,
        category: component.category,
        unit: component.unit || 'Meter',
        quantity: Math.ceil(meters),
        price: component.price,
      }];
    });

  const reset = () => {
    setMode('idle');
    setImageSize(null);
    setCalibration([]);
    setReferenceLength('1.0');
    setInputs({ ceilingHeight: '3.0', switchHeight: '1.5', socketHeight: '0.3', tolerancePercent: '10' });
    setOrthogonal(true);
    setRoutes([]);
    setDraft([]);
    setSelectedRouteId(null);
  };

  return {
    mode, imageSize, setImageSize, calibration, referenceLength, setReferenceLength, inputs, setInputs,
    orthogonal, setOrthogonal, routes, draft, metersPerPixel, metrics, totalsByComponent,
    selectedRouteId, setSelectedRouteId, editVertex,
    handleImageClick, startCalibration, startDrawing, finishRoute, cancelActiveMode, removeLastPoint, autoConnect,
    deleteRoute, setRouteComponent, buildParts, reset,
  };
}

export type CableRoutingState = ReturnType<typeof useCableRouting>;

const stopClick = (event: React.MouseEvent) => event.stopPropagation();

/**
 * Garis kalibrasi, jalur kabel, dan jalur yang sedang digambar di atas gambar denah.
 * Jalur yang dipilih menampilkan pegangan titik yang dapat digeser, tanda + untuk menambah
 * titik belok, dan dapat diklik dua kali untuk menghapus titik.
 */
export function CableOverlay({ cable }: { cable: CableRoutingState }) {
  const editable = cable.mode === 'idle';
  const draftSegments = pathSegments(cable.orthogonal ? orthogonalize(cable.draft) : cable.draft);

  /** Mulai menggeser satu titik; posisi dihitung terhadap kotak gambar selama pointer bergerak. */
  const startDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    routeId: string,
    pathIndex: number,
    index: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const container = event.currentTarget.offsetParent as HTMLElement | null;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const toPercent = (e: PointerEvent) => ({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
    const onMove = (e: PointerEvent) => cable.editVertex.move(routeId, pathIndex, index, toPercent(e));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      cable.editVertex.drop(routeId, pathIndex, index);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const selected = cable.routes.find((r) => r.id === cable.selectedRouteId) ?? null;

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {cable.routes.map((route) => {
          const isSelected = route.id === cable.selectedRouteId;
          return route.paths.flatMap((path, p) =>
            pathSegments(path).map(([a, b], i) => (
              <g key={`${route.id}-${p}-${i}`}>
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={ROUTE_COLOR}
                  strokeWidth={isSelected ? 4 : 3}
                  strokeLinecap="round"
                  opacity={cable.selectedRouteId && !isSelected ? 0.45 : 1}
                  vectorEffect="non-scaling-stroke"
                />
                {editable && (
                  // Garis transparan yang lebih tebal agar jalur mudah diklik
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="transparent"
                    strokeWidth={14}
                    vectorEffect="non-scaling-stroke"
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      cable.setSelectedRouteId(route.id);
                    }}
                  />
                )}
              </g>
            )),
          );
        })}
        {draftSegments.map(([a, b], i) => (
          <line
            key={`draft-${i}`}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="#f59e0b"
            strokeWidth={3}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {cable.calibration.length === 2 && (
          <line
            x1={cable.calibration[0].x} y1={cable.calibration[0].y}
            x2={cable.calibration[1].x} y2={cable.calibration[1].y}
            stroke="#6366f1"
            strokeWidth={3}
            strokeDasharray="4 2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {cable.calibration.map((point, i) => (
        <div
          key={`cal-${i}`}
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-500 shadow"
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
        />
      ))}
      {cable.draft.map((point, i) => (
        <div
          key={`draft-${i}`}
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-500 shadow"
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
        />
      ))}

      {editable && selected &&
        selected.paths.map((path, p) => (
          <Fragment key={`edit-${p}`}>
            {/* Tanda + di tengah segmen: tarik untuk menambah titik belok baru */}
            {pathSegments(path).map(([a, b], i) => (
              <div
                key={`mid-${p}-${i}`}
                title="Tarik untuk menambah titik belok"
                onClick={stopClick}
                onPointerDown={(e) => {
                  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                  cable.editVertex.insert(selected.id, p, i + 1, mid);
                  startDrag(e, selected.id, p, i + 1);
                }}
                className="absolute flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-copy items-center justify-center rounded-full border bg-white/80 text-[10px] font-bold leading-none opacity-70 shadow-sm hover:opacity-100"
                style={{ left: `${(a.x + b.x) / 2}%`, top: `${(a.y + b.y) / 2}%`, borderColor: ROUTE_COLOR, color: ROUTE_COLOR }}
              >
                +
              </div>
            ))}
            {/* Pegangan titik: geser untuk memindahkan, klik dua kali untuk menghapus */}
            {path.map((point, i) => (
              <div
                key={`v-${p}-${i}`}
                title={point.detectionId ? 'Menempel pada simbol. Geser untuk memindahkan.' : 'Geser untuk memindahkan, klik dua kali untuk menghapus'}
                onClick={stopClick}
                onPointerDown={(e) => startDrag(e, selected.id, p, i)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  cable.editVertex.remove(selected.id, p, i);
                }}
                className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 shadow"
                style={{
                  left: `${point.x}%`,
                  top: `${point.y}%`,
                  borderColor: point.detectionId ? '#ffffff' : ROUTE_COLOR,
                  backgroundColor: point.detectionId ? ROUTE_COLOR : '#ffffff',
                  touchAction: 'none',
                }}
              />
            ))}
          </Fragment>
        ))}
    </>
  );
}

const inputClass =
  'w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-500';

/** Panel pengaturan skala, parameter vertikal, daftar jalur, dan ringkasan kabel. */
export function CablePanel({
  cable,
  cableComponents,
  onAddToRab,
}: {
  cable: CableRoutingState;
  cableComponents: ComponentSpec[];
  onAddToRab: () => void;
}) {
  const scaleReady = cable.metersPerPixel !== null;
  const missingCable = cable.routes.some((r) => !r.componentId);
  const grandTotal = Array.from(cable.totalsByComponent.values()).reduce((sum, v) => sum + v, 0);

  const numberInput = (key: keyof typeof cable.inputs, label: string, hint: string, step = '0.1') => (
    <div>
      <label className="mb-1 block text-xs font-medium text-indigo-900">{label}</label>
      <input
        type="number"
        step={step}
        min="0"
        value={cable.inputs[key]}
        onChange={(e) => cable.setInputs((current) => ({ ...current, [key]: e.target.value }))}
        className={inputClass}
      />
      <p className="mt-1 text-[10px] text-indigo-600">{hint}</p>
    </div>
  );

  return (
    <div className="animate-scale-in space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="flex items-center justify-between border-b border-indigo-200/80 pb-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-indigo-600" />
          <div>
            <h4 className="text-sm font-semibold text-indigo-900">Jalur Kabel</h4>
            <p className="text-xs text-indigo-700">
              Kalibrasi skala, gambar jalur antarsimbol, lalu hitung panjang kabel termasuk tarikan vertikal.
            </p>
          </div>
        </div>
        {scaleReady && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            ✓ Skala terkalibrasi
          </span>
        )}
      </div>

      {/* 1. Kalibrasi skala */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-indigo-900">1. Kalibrasi skala</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-indigo-900">Panjang garis referensi (m)</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={cable.referenceLength}
              onChange={(e) => cable.setReferenceLength(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={cable.startCalibration}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              cable.mode === 'calibrating' ? 'animate-pulse bg-amber-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            <Ruler className="h-3.5 w-3.5" />
            {cable.mode === 'calibrating' ? `Klik titik ${cable.calibration.length + 1} dari 2...` : 'Tarik garis referensi'}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-indigo-600">
          Klik dua ujung benda yang ukurannya diketahui pada denah, misalnya lebar pintu atau garis dimensi.
        </p>
      </div>

      {/* 2. Parameter vertikal */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-indigo-900">2. Parameter tinggi dan toleransi</p>
        <div className="grid gap-3 sm:grid-cols-4">
          {numberInput('ceilingHeight', 'Tinggi plafon (m)', 'Jalur horizontal di plafon.')}
          {numberInput('switchHeight', 'Tinggi saklar (m)', 'Kabel turun ke saklar.')}
          {numberInput('socketHeight', 'Tinggi stop kontak (m)', 'Kabel turun ke stop kontak.')}
          {numberInput('tolerancePercent', 'Toleransi (%)', 'Cadangan lekukan dan sambungan.', '1')}
        </div>
      </div>

      {/* 3. Jalur kabel */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-indigo-900">3. Jalur kabel</p>
          <label className="flex items-center gap-1.5 text-xs text-indigo-800">
            <input
              type="checkbox"
              checked={cable.orthogonal}
              onChange={(e) => cable.setOrthogonal(e.target.checked)}
              className="h-3.5 w-3.5 accent-indigo-600"
            />
            Tarikan siku-siku
          </label>
        </div>

        {cable.mode === 'drawing' ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
            <span className="text-xs text-amber-800">
              Klik simbol atau titik belok pada gambar ({cable.draft.length} titik).
            </span>
            <button type="button" onClick={cable.finishRoute} disabled={cable.draft.length < 2}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">
              <Check className="h-3.5 w-3.5" /> Selesai
            </button>
            <button type="button" onClick={cable.removeLastPoint} disabled={cable.draft.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50">
              <Undo2 className="h-3.5 w-3.5" /> Hapus titik terakhir
            </button>
            <button type="button" onClick={cable.cancelActiveMode}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
              <X className="h-3.5 w-3.5" /> Batal
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={cable.startDrawing} disabled={!scaleReady}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              <Route className="h-3.5 w-3.5" /> Gambar jalur
            </button>
            <button type="button" onClick={cable.autoConnect} disabled={!scaleReady}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
              <Wand2 className="h-3.5 w-3.5" /> Hubungkan otomatis
            </button>
          </div>
        )}
        {!scaleReady && (
          <p className="mt-1 text-[10px] text-indigo-600">Lakukan kalibrasi skala terlebih dahulu.</p>
        )}
        <p className="mt-1 text-[10px] text-indigo-600">
          Klik jalur pada gambar untuk mengeditnya: geser titik untuk memindahkan, tarik tanda + di tengah garis untuk
          menambah belokan, dan klik dua kali titik untuk menghapusnya. Titik yang dilepas di atas simbol akan menempel
          pada simbol tersebut. Tarikan vertikal dihitung setiap kali jalur tersambung ke saklar atau stop kontak.
        </p>

        {cable.routes.length > 0 && (
          <div className="mt-3 space-y-2">
            {cable.routes.map((route) => {
              const value = cable.metrics.get(route.id);
              const isSelected = route.id === cable.selectedRouteId;
              return (
                <div
                  key={route.id}
                  onClick={() => cable.setSelectedRouteId(isSelected ? null : route.id)}
                  className={`flex cursor-pointer flex-wrap items-center gap-2 rounded-lg border bg-white p-2 ${
                    isSelected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-indigo-100 hover:border-indigo-300'
                  }`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: ROUTE_COLOR }} />
                  <span className="min-w-[8rem] text-xs font-semibold text-slate-700">
                    {route.name}
                    {isSelected && <span className="ml-1 font-normal text-indigo-600">· sedang diedit</span>}
                  </span>
                  {value && (
                    <span className="text-[11px] text-slate-500">
                      {formatMeters(value.horizontal)} + {formatMeters(value.vertical)} vertikal →{' '}
                      <strong className="text-indigo-700">{formatMeters(value.total)}</strong>
                    </span>
                  )}
                  <select
                    value={route.componentId}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => cable.setRouteComponent(route.id, e.target.value)}
                    className="ml-auto max-w-[200px] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-500"
                  >
                    <option value="">Pilih kabel...</option>
                    {cableComponents.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({formatRupiah(c.price)}/{c.unit})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    title="Hapus jalur"
                    onClick={(e) => {
                      e.stopPropagation();
                      cable.deleteRoute(route.id);
                    }}
                    className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Ringkasan */}
      {cable.routes.length > 0 && scaleReady && (
        <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">Estimasi kebutuhan kabel</div>
            <div className="text-lg font-bold text-indigo-600">
              {formatMeters(grandTotal)}{' '}
              <span className="text-xs font-normal text-slate-500">
                (termasuk toleransi {cable.inputs.tolerancePercent || 0}%)
              </span>
            </div>
            {missingCable && <p className="text-[11px] text-amber-600">Pilih jenis kabel untuk setiap jalur.</p>}
            <p className="text-[11px] text-slate-500">Hasil jalur kabel sebelumnya di ruangan ini akan diganti.</p>
          </div>
          <button
            type="button"
            disabled={missingCable || grandTotal <= 0}
            onClick={onAddToRab}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Simpan ke daftar komponen
          </button>
        </div>
      )}
    </div>
  );
}
