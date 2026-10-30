"""
Router deteksi simbol pada gambar denah menggunakan model ONNX (OpenCV).
Menerima upload gambar, menjalankan inferensi, dan mengembalikan hasil deteksi.
"""
import os
import uuid
import base64
import ast
import threading
import tempfile
import cv2
import numpy as np
from PIL import Image as _PILImage
import onnxruntime as ort
import requests
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from app.core.security import verify_supabase_access_token
from app.core.config import UPLOAD_DIR
from app.core.database import execute_query
from app.models.schemas import DetectionResponse, DetectionResultItem

router = APIRouter(prefix="/detect", tags=["detection"])

# --- DAFTAR KELAS ---
# Nama kelas utama dibaca dari metadata ONNX (_read_onnx_class_names).
# Daftar ini hanya cadangan bila metadata tidak tersedia, dengan urutan sesuai model 4 kelas penelitian.
CLASSES = ['saklar ganda', 'saklar tunggal', 'stop kontak', 'titik lampu']

# Pemasangan objek dengan komponen katalog dilakukan pengguna pada tahap koreksi di frontend,
# karena id katalog berbeda pada setiap pengguna. Karena itu tidak ada pemetaan id baku per kelas.
LABEL_TO_COMPONENT: dict[str, str] = {}

from app.core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

MODEL_BUCKET = "yolo-models"
MODEL_CACHE_DIR = os.path.join(tempfile.gettempdir(), "voltrab_models")
os.makedirs(MODEL_CACHE_DIR, exist_ok=True)

CONF_THRESHOLD = 0.50
IOU_THRESHOLD = 0.40
DEFAULT_INPUT_SIZE = (640, 640)  # (tinggi, lebar) bila ukuran input tidak terbaca dari ONNX

# Lazy-load model OpenCV
_yolo_net = None
_model_lock = threading.Lock()
_cached_model_id = None
_cached_model_updated_at = None
_cached_model_path = None
_cached_model_classes = None
_cached_input_size = DEFAULT_INPUT_SIZE


def _read_onnx_input_size(model_path: str) -> tuple[int, int]:
    """Baca ukuran input (tinggi, lebar) model dari ONNX, mis. [1, 3, 640, 640] atau [1, 3, 1024, 1024]."""
    try:
        shape = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"]).get_inputs()[0].shape
        h, w = int(shape[2]), int(shape[3])
        if h > 0 and w > 0:
            return h, w
    except (ValueError, TypeError, IndexError, RuntimeError):
        pass
    return DEFAULT_INPUT_SIZE


def _letterbox(frame: np.ndarray, size: tuple[int, int]) -> tuple[np.ndarray, float, int, int]:
    """Perkecil gambar dengan menjaga perbandingan sisi lalu isi sisa kanvas dengan abu-abu 114,
    sama seperti LetterBox Ultralytics saat pelatihan dan pengujian model.
    Mengembalikan kanvas, skala, dan geser kiri/atas untuk memetakan kotak kembali ke gambar asli."""
    in_h, in_w = size
    h_img, w_img = frame.shape[:2]
    scale = min(in_w / w_img, in_h / h_img)
    new_w, new_h = int(round(w_img * scale)), int(round(h_img * scale))
    pad_w, pad_h = (in_w - new_w) / 2, (in_h - new_h) / 2
    left, top = int(round(pad_w - 0.1)), int(round(pad_h - 0.1))
    resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR) if (new_w, new_h) != (w_img, h_img) else frame
    canvas = np.full((in_h, in_w, 3), 114, dtype=np.uint8)
    canvas[top:top + new_h, left:left + new_w] = resized
    return canvas, scale, left, top


def _read_onnx_class_names(model_path: str) -> list[str] | None:
    """Baca urutan class yang ditanam Ultralytics pada metadata ONNX."""
    try:
        metadata = ort.InferenceSession(
            model_path,
            providers=["CPUExecutionProvider"],
        ).get_modelmeta().custom_metadata_map
        raw_names = metadata.get("names")
        if not raw_names:
            return None
        parsed = ast.literal_eval(raw_names)
        if isinstance(parsed, dict):
            ordered = [str(parsed[key]) for key in sorted(parsed, key=lambda value: int(value))]
            return ordered or None
        if isinstance(parsed, list):
            return [str(value) for value in parsed] or None
    except (ValueError, SyntaxError, TypeError, RuntimeError):
        return None
    return None

def _get_active_model_row() -> dict | None:
    """Ambil metadata model aktif dari tabel yolo_models."""
    try:
        return execute_query(
            """SELECT id, file_path, updated_at, is_active
               FROM yolo_models
               ORDER BY is_active DESC, updated_at DESC NULLS LAST, created_at DESC
               LIMIT 1""",
            fetch="one",
        )
    except Exception as e:
        print(f"[MODEL ERROR] Gagal query model aktif: {e}")
        return None


def _download_model_from_storage(file_path: str, model_id: str) -> str:
    """Unduh file ONNX private dari Supabase Storage menggunakan service role key."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi")

    object_path = file_path.lstrip("/")
    download_url = f"{SUPABASE_URL}/storage/v1/object/{MODEL_BUCKET}/{object_path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
    }

    res = requests.get(download_url, headers=headers, timeout=60)
    if res.status_code != 200:
        raise RuntimeError(f"Gagal download model dari storage ({res.status_code})")

    local_path = os.path.join(MODEL_CACHE_DIR, f"{model_id}.onnx")
    with open(local_path, "wb") as f:
        f.write(res.content)
    return local_path


def get_onnx_model(force_reload: bool = False):
    """Load model ONNX aktif dari Supabase Storage berdasarkan database."""
    global _yolo_net, _cached_model_id, _cached_model_updated_at, _cached_model_path, _cached_model_classes, _cached_input_size

    with _model_lock:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Konfigurasi Supabase belum tersedia. Model hanya bisa diambil dari Supabase.",
            )

        row = _get_active_model_row()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Belum ada model di Supabase. Silakan upload model ONNX terlebih dahulu.",
            )

        if not row.get("file_path"):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Model di Supabase belum punya file_path yang valid.",
            )

        if not row.get("is_active"):
            print("[MODEL WARNING] Tidak ada model aktif; memakai model terbaru yang tersedia di Supabase.")

        model_id = str(row["id"])
        updated_at = row.get("updated_at")
        updated_at_key = updated_at.isoformat() if updated_at else None
        should_reload = (
            force_reload
            or _yolo_net is None
            or _cached_model_id != model_id
            or _cached_model_updated_at != updated_at_key
        )

        if not should_reload:
            return _yolo_net

        try:
            local_model_path = _download_model_from_storage(row["file_path"], model_id)
            print(f"[INFO] Memuat model ONNX aktif dari Supabase: {row['file_path']}")
            new_net = cv2.dnn.readNetFromONNX(local_model_path)
            model_classes = _read_onnx_class_names(local_model_path)
            input_size = _read_onnx_input_size(local_model_path)
            print(f"[INFO] Ukuran input model: {input_size[1]}x{input_size[0]}")

            old_path = _cached_model_path
            _yolo_net = new_net
            _cached_model_id = model_id
            _cached_model_updated_at = updated_at_key
            _cached_model_path = local_model_path
            _cached_model_classes = model_classes
            _cached_input_size = input_size

            if old_path and old_path != local_model_path and os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except OSError:
                    pass
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Gagal memuat model aktif dari Supabase: {e}",
            )

        return _yolo_net


def preload_active_model():
    """Dipanggil saat startup agar request pertama tidak memuat model dari nol."""
    try:
        get_onnx_model(force_reload=True)
    except HTTPException as exc:
        print(f"[MODEL WARNING] Preload model dilewati: {exc.detail}")


def run_onnx_detection(image_path: str) -> list[dict]:
    """Jalankan inferensi YOLOv8 OpenCV dan format bbox ke persentase (0-100)."""
    net = get_onnx_model()

    frame = cv2.imread(image_path)
    if frame is None:
        return []

    h_img, w_img, _ = frame.shape
    in_h, in_w = _cached_input_size

    # Pre-processing: letterbox seperti saat pelatihan, bukan menarik gambar menjadi persegi
    canvas, scale, pad_left, pad_top = _letterbox(frame, (in_h, in_w))
    blob = cv2.dnn.blobFromImage(canvas, 1/255.0, (in_w, in_h), swapRB=True, crop=False)
    net.setInput(blob)
    outputs = net.forward()

    # Post-processing
    predictions = np.squeeze(outputs).T
    class_ids, confidences, boxes = [], [], []

    for row in predictions:
        scores = row[4:]
        class_id = np.argmax(scores)
        confidence = scores[class_id]

        if confidence >= CONF_THRESHOLD:
            cx, cy, w, h = row[0], row[1], row[2], row[3]

            # Koordinat kanvas letterbox dikembalikan ke piksel gambar asli
            left = int((cx - w / 2.0 - pad_left) / scale)
            top = int((cy - h / 2.0 - pad_top) / scale)
            width = int(w / scale)
            height = int(h / scale)

            left = max(0, left)
            top = max(0, top)
            width = max(0, min(w_img - left, width))
            height = max(0, min(h_img - top, height))

            boxes.append([left, top, width, height])
            confidences.append(float(confidence))
            class_ids.append(class_id)

    # NMS per-kelas (sinkron audit_validasi_saklar.py, bukan agnostik)
    # Backend lama agnostik sehingga ST/SG berdempetan saling suppress;
    # audit lokal loop per kelas dengan IoU 0.40.
    keep_indices: list[int] = []
    if boxes:
        for cls in set(class_ids):
            cls_idx = [i for i, c in enumerate(class_ids) if c == cls]
            cls_boxes = [boxes[i] for i in cls_idx]
            cls_confs = [confidences[i] for i in cls_idx]
            nms = cv2.dnn.NMSBoxes(cls_boxes, cls_confs, CONF_THRESHOLD, IOU_THRESHOLD)
            if len(nms) > 0:
                for k in nms.flatten():
                    keep_indices.append(cls_idx[int(k)])
        keep_indices.sort(key=lambda i: confidences[i], reverse=True)
    detections = []

    if len(keep_indices) > 0:
        for index in keep_indices:
            c_id = class_ids[index]
            model_classes = _cached_model_classes or CLASSES
            label = model_classes[c_id] if c_id < len(model_classes) else f"Unknown-{c_id}"

            box = boxes[index]
            left, top, width, height = box[0], box[1], box[2], box[3]
            
            # --- KONVERSI PIXEL KE PERSENTASE (0 - 100%) ---
            # Dibutuhkan agar Frontend React bisa membaca kordinat dengan benar
            percent_x = max(0, (left / w_img) * 100)
            percent_y = max(0, (top / h_img) * 100)
            percent_w = min(100 - percent_x, (width / w_img) * 100)
            percent_h = min(100 - percent_y, (height / h_img) * 100)

            detections.append({
                "label": label,
                "confidence": round(confidences[index], 3),
                "bbox": {
                    "x": percent_x,
                    "y": percent_y,
                    "width": percent_w,
                    "height": percent_h
                }
            })

    return detections


@router.post("", response_model=DetectionResponse)
async def detect_components(
    file: UploadFile = File(...),
    payload: dict = Depends(verify_supabase_access_token),
):
    """
    Upload gambar denah dan jalankan deteksi YOLO (OpenCV).
    """
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File harus berupa gambar")

    file_ext = os.path.splitext(file.filename or "upload.jpg")[1] or ".jpg"
    file_name = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, file_name)

    content = await file.read()
    # M6: validasi isi file benar-benar gambar (bukan sekadar content_type dari client).
    # Tolak SVG (bisa sisipkan script) dan format berbahaya lain.
    try:
        import io as _io
        _img = _PILImage.open(_io.BytesIO(content))
        _img.verify()  # pastikan file gambar valid
        _img = _PILImage.open(_io.BytesIO(content))  # buka ulang setelah verify
        if _img.format not in ("JPEG", "PNG", "WEBP", "BMP"):
            raise ValueError(f"format {_img.format} tidak diizinkan")
        # Re-encode ke format aman (buang metadata/script tersembunyi)
        _buf = _io.BytesIO()
        _save_fmt = "PNG" if _img.format == "PNG" else "JPEG"
        if _save_fmt == "JPEG" and _img.mode in ("RGBA", "LA", "PA"):
            _img = _img.convert("RGB")
        _img.save(_buf, format=_save_fmt)
        content = _buf.getvalue()
        _safe_mime = "image/png" if _save_fmt == "PNG" else "image/jpeg"
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File bukan gambar yang valid",
        )
    with open(file_path, "wb") as f:
        f.write(content)

    # 1. Jalankan Deteksi ONNX
    onnx_results = run_onnx_detection(file_path)

    # 2. Iterasi Hasil Deteksi untuk Pencocokan ID Komponen
    for det in onnx_results:
        det["matched_component_id"] = LABEL_TO_COMPONENT.get(det["label"])

    # 3. Konversi Gambar Asli ke Base64 (Untuk Response)
    image_b64 = None
    try:
        with open(file_path, "rb") as f:
            image_b64 = f"data:{_safe_mime};base64,{base64.b64encode(f.read()).decode()}"
    except Exception:
        pass

    # 4. Hapus File Sementara
    try:
        os.remove(file_path)
    except OSError:
        pass

    return DetectionResponse(
        detections=[DetectionResultItem(**d) for d in onnx_results],
        image_url=image_b64,
    )
