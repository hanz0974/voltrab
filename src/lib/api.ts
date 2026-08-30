/**
 * API client untuk komunikasi dengan backend FastAPI.
 * Digunakan hanya untuk endpoint deteksi YOLOv8.
 * Autentikasi & penyimpanan project menggunakan Supabase langsung dari frontend.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface ApiDetectionItem {
  label: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  matched_component_id?: string | null;
}

export interface ApiDetectionResponse {
  detections: ApiDetectionItem[];
  image_url: string | null;
}

export async function apiDetectImage(file: File, token: string): Promise<ApiDetectionResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_URL}/detect`, {
    method: 'POST',
    body: formData,
    headers: {
      Authorization: `Bearer ${token}`,
    },
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

export async function apiDeleteDetectionFeedbackReport(reportId: string, token: string): Promise<void> {
  const res = await fetch(`${API_URL}/reports/${reportId}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    let message = `Gagal menghapus report (${res.status})`;
    try {
      const body = await res.json();
      message = body.detail || message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
}
