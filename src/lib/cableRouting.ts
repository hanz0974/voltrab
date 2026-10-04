/**
 * Perhitungan jalur kabel VoltRAB.
 *
 * Titik disimpan dalam persen terhadap lebar dan tinggi gambar, sama seperti bounding box hasil
 * deteksi. Jarak selalu dihitung dalam piksel asli gambar sehingga skala tetap benar pada gambar
 * yang tidak berbentuk persegi.
 *
 * Setiap jalur terdiri atas satu atau beberapa path. Path adalah deretan titik (polyline) yang
 * titiknya dapat digeser, ditambah, atau dihapus oleh pengguna.
 */
import type { DetectionResult } from '../types';

export interface RoutePoint {
  x: number;
  y: number;
  /** Terisi bila titik menempel pada simbol hasil deteksi. */
  detectionId?: string;
}

export type RouteSegment = [RoutePoint, RoutePoint];

export interface CableRoute {
  id: string;
  name: string;
  componentId: string;
  paths: RoutePoint[][];
  auto: boolean;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface CableParams {
  ceilingHeight: number;
  switchHeight: number;
  socketHeight: number;
  tolerancePercent: number;
}

export interface RouteMetrics {
  horizontal: number;
  vertical: number;
  total: number;
}

export type SymbolKind = 'switch' | 'socket' | 'lamp' | 'other';

/** Batas jarak (persen) agar titik yang digeser otomatis sejajar dengan titik tetangganya. */
export const ALIGN_THRESHOLD = 0.8;

export const symbolKind = (label: string): SymbolKind => {
  const normalized = label.toLowerCase();
  if (/saklar|switch/.test(normalized)) return 'switch';
  if (/stop kontak|socket|outlet/.test(normalized)) return 'socket';
  if (/lampu|lamp|light/.test(normalized)) return 'lamp';
  return 'other';
};

export const detectionCenter = (detection: DetectionResult): RoutePoint => ({
  x: detection.bbox.x + detection.bbox.width / 2,
  y: detection.bbox.y + detection.bbox.height / 2,
  detectionId: detection.id,
});

/** Jarak lurus antara dua titik dalam piksel asli gambar. */
export const pixelDistance = (a: RoutePoint, b: RoutePoint, size: ImageSize) =>
  Math.hypot(((b.x - a.x) / 100) * size.width, ((b.y - a.y) / 100) * size.height);

/** Jarak siku-siku (horizontal + vertikal pada denah) dalam piksel asli gambar. */
const manhattanDistance = (a: RoutePoint, b: RoutePoint, size: ImageSize) =>
  Math.abs(((b.x - a.x) / 100) * size.width) + Math.abs(((b.y - a.y) / 100) * size.height);

/** Titik yang jatuh di dalam bounding box simbol (dengan sedikit kelonggaran) ditempelkan ke pusat simbol. */
export const snapToDetection = (
  point: { x: number; y: number },
  detections: DetectionResult[],
  marginPercent = 1,
): RoutePoint => {
  const hit = detections.find(
    (d) =>
      point.x >= d.bbox.x - marginPercent &&
      point.x <= d.bbox.x + d.bbox.width + marginPercent &&
      point.y >= d.bbox.y - marginPercent &&
      point.y <= d.bbox.y + d.bbox.height + marginPercent,
  );
  return hit ? detectionCenter(hit) : { x: point.x, y: point.y };
};

/** Sisipkan titik belok di antara dua titik yang tidak sejajar sehingga path tersusun siku-siku. */
export const orthogonalize = (points: RoutePoint[]): RoutePoint[] => {
  if (points.length < 2) return points.slice();
  const result: RoutePoint[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a.x !== b.x && a.y !== b.y) result.push({ x: b.x, y: a.y });
    result.push(b);
  }
  return result;
};

export const pathSegments = (path: RoutePoint[]): RouteSegment[] =>
  path.slice(1).map((point, i) => [path[i], point] as RouteSegment);

export const routeSegments = (route: CableRoute): RouteSegment[] => route.paths.flatMap(pathSegments);

/**
 * Hubungkan semua titik dengan total jarak siku-siku terpendek (minimum spanning tree, algoritma Prim).
 * Setiap sisi pohon menjadi satu path siku-siku yang dapat diedit.
 */
export const minimumSpanningPaths = (nodes: RoutePoint[], size: ImageSize): RoutePoint[][] => {
  if (nodes.length < 2) return [];
  const inTree = new Array<boolean>(nodes.length).fill(false);
  const best = new Array<number>(nodes.length).fill(Number.POSITIVE_INFINITY);
  const parent = new Array<number>(nodes.length).fill(-1);
  best[0] = 0;
  const edges: [number, number][] = [];

  for (let step = 0; step < nodes.length; step += 1) {
    let u = -1;
    for (let i = 0; i < nodes.length; i += 1) {
      if (!inTree[i] && (u === -1 || best[i] < best[u])) u = i;
    }
    inTree[u] = true;
    if (parent[u] >= 0) edges.push([parent[u], u]);
    for (let v = 0; v < nodes.length; v += 1) {
      if (inTree[v]) continue;
      const distance = manhattanDistance(nodes[u], nodes[v], size);
      if (distance < best[v]) {
        best[v] = distance;
        parent[v] = u;
      }
    }
  }

  return edges.map(([a, b]) => orthogonalize([nodes[a], nodes[b]]));
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

/**
 * Geser satu titik path. Titik dilepas dari simbol selama digeser dan otomatis disejajarkan
 * dengan titik tetangga bila jaraknya di bawah ALIGN_THRESHOLD.
 */
export const moveVertex = (path: RoutePoint[], index: number, point: { x: number; y: number }): RoutePoint[] => {
  let x = clampPercent(point.x);
  let y = clampPercent(point.y);
  for (const neighbor of [path[index - 1], path[index + 1]]) {
    if (!neighbor) continue;
    if (Math.abs(x - neighbor.x) < ALIGN_THRESHOLD) x = neighbor.x;
    if (Math.abs(y - neighbor.y) < ALIGN_THRESHOLD) y = neighbor.y;
  }
  return path.map((p, i) => (i === index ? { x, y } : p));
};

/** Setelah digeser, titik ditempelkan ke simbol bila dilepas di atasnya, atau dibiarkan bebas. */
export const dropVertex = (path: RoutePoint[], index: number, detections: DetectionResult[]): RoutePoint[] =>
  path.map((p, i) => (i === index ? snapToDetection(p, detections) : p));

export const insertVertex = (path: RoutePoint[], index: number, point: { x: number; y: number }): RoutePoint[] => [
  ...path.slice(0, index),
  { x: clampPercent(point.x), y: clampPercent(point.y) },
  ...path.slice(index),
];

/** Hapus satu titik. Path minimal tetap memiliki dua titik. */
export const removeVertex = (path: RoutePoint[], index: number): RoutePoint[] =>
  path.length > 2 ? path.filter((_, i) => i !== index) : path;

/** Panjang tarikan kabel turun dari plafon ke satu simbol. */
export const verticalDrop = (kind: SymbolKind, params: CableParams) => {
  if (kind === 'switch') return Math.max(0, params.ceilingHeight - params.switchHeight);
  if (kind === 'socket') return Math.max(0, params.ceilingHeight - params.socketHeight);
  return 0;
};

/**
 * Panjang kabel satu jalur dalam meter.
 * Tarikan vertikal dihitung setiap kali ujung segmen tersambung ke saklar atau stop kontak,
 * karena setiap kabel yang masuk ke kotak simbol turun dari plafon dan naik kembali.
 */
export const routeMetrics = (
  route: CableRoute,
  detectionsById: Map<string, DetectionResult>,
  size: ImageSize,
  metersPerPixel: number,
  params: CableParams,
): RouteMetrics => {
  let pixels = 0;
  let vertical = 0;
  for (const [a, b] of routeSegments(route)) {
    pixels += pixelDistance(a, b, size);
    for (const end of [a, b]) {
      const detection = end.detectionId ? detectionsById.get(end.detectionId) : undefined;
      if (detection) vertical += verticalDrop(symbolKind(detection.label), params);
    }
  }
  const horizontal = pixels * metersPerPixel;
  const total = (horizontal + vertical) * (1 + params.tolerancePercent / 100);
  return { horizontal, vertical, total };
};
