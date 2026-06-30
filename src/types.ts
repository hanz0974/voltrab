export type InputMode = 'manual' | 'detect';

export type PartCategory =
  | 'Pengaman'
  | 'Penerangan'
  | 'Saklar & Stop Kontak'
  | 'Kabel'
  | 'Panel & MDP'
  | 'Lainnya';

export interface ComponentSpec {
  id: string;
  name: string;
  category: PartCategory;
  unit: string;
  price: number;
}

export interface PartItem {
  id: string;
  componentId: string;
  name: string;
  category: PartCategory;
  unit: string;
  quantity: number;
  price: number;
}

export interface Room {
  id: string;
  name: string;
  inputMode: InputMode;
  parts: PartItem[];
  detectionStatus: 'idle' | 'uploading' | 'processing' | 'done' | 'error';
  detectionImage?: string;
  detections?: DetectionResult[];
}

export interface Floor {
  id: string;
  name: string;
  rooms: Room[];
}

export interface ProjectState {
  name: string;
  client: string;
  location: string;
  date: string;
  floors: Floor[];
}

export interface DetectionResult {
  id: string;
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  ocrText?: string;
  matchedComponentId?: string;
}

export type StepId = 'project' | 'floors' | 'parts' | 'summary';
