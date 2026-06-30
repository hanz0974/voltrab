/**
 * API client untuk komunikasi dengan backend FastAPI.
 * Digunakan hanya untuk endpoint deteksi YOLOv8 + OCR.
 * Autentikasi & penyimpanan project menggunakan Supabase langsung dari frontend.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface ApiDetectionItem {
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  ocr_text?: string | null;
  matched_component_id?: string | null;
}

export interface ApiDetectionResponse {
  detections: ApiDetectionItem[];
  image_url: string | null;
}

export async function apiDetectImage(file: File, token: string): Promise<ApiDetectionResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_URL}/detect?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    let message = `Deteksi gagal (${res.status})`;
    try {
      const body = await res.json();
      message = body.detail || message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }

  return res.json() as Promise<ApiDetectionResponse>;
}
