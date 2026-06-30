"""
Router deteksi komponen SLD menggunakan model ONNX (OpenCV) + OCR.
Menerima upload gambar, menjalankan inferensi, dan mengembalikan hasil deteksi.
"""
import os
import uuid
import base64
import glob
import cv2
import numpy as np
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from app.core.security import decode_access_token
from app.core.config import UPLOAD_DIR
from app.models.schemas import DetectionResponse, DetectionResultItem

router = APIRouter(prefix="/detect", tags=["detection"])

# --- DAFTAR KELAS & MAPPING BARU ---
# Sesuai dengan yang ada di script lokal kamu
CLASSES = [
    'RMDL PL-C 13W', 'exit lamp', 'local switch 1 way 1 gang', 'local switch 2 way 1 gang', 'reflector and louvre m5', 'stage lamp gms light 1xtl5 14W'
]

# Sesuaikan value (komponen id) ini dengan yang ada di database katalogmu
LABEL_TO_COMPONENT = {
    "exit lamp": "c-exit-lamp",
    "local switch 1 way 1 gang": "c-switch-1w1g",
    "local switch 2 way 1 gang": "c-switch-2w1g",
    "reflector and louvre m5": "c-reflector-m5",
    "RMDL PL-C 13W": "c-rmdl-plc",
    "stage lamp gms light 1xtl5 14W": "c-stage-lamp"
}

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models")
CONF_THRESHOLD = 0.50
IOU_THRESHOLD = 0.40

# Lazy-load model OpenCV dan OCR engine
_yolo_net = None
_ocr_reader = None

def find_onnx_model() -> str | None:
    """Cari file model .onnx di folder models/."""
    if not os.path.isdir(MODELS_DIR):
        return None
    onnx_files = glob.glob(os.path.join(MODELS_DIR, "*.onnx"))
    return onnx_files[0] if onnx_files else None

def get_onnx_model():
    """Load model ONNX menggunakan OpenCV dnn."""
    global _yolo_net
    if _yolo_net is not None:
        return _yolo_net

    model_path = find_onnx_model()
    if model_path:
        print(f"[INFO] Memuat model ONNX dari: {model_path}")
        _yolo_net = cv2.dnn.readNetFromONNX(model_path)
    return _yolo_net

def get_ocr_reader():
    """Load OCR reader jika easyocr terinstall."""
    global _ocr_reader
    if _ocr_reader is not None:
        return _ocr_reader
    try:
        import easyocr
        _ocr_reader = easyocr.Reader(["en"], gpu=False)
    except Exception:
        _ocr_reader = None
    return _ocr_reader

def run_onnx_detection(image_path: str) -> list[dict]:
    """Jalankan inferensi YOLOv8 OpenCV dan format bbox ke persentase (0-100)."""
    net = get_onnx_model()
    if net is None:
        print("[ERROR] Model ONNX tidak ditemukan atau gagal dimuat.")
        return []

    frame = cv2.imread(image_path)
    if frame is None:
        return []

    h_img, w_img, _ = frame.shape

    # Pre-processing OpenCV
    blob = cv2.dnn.blobFromImage(frame, 1/255.0, (640, 640), swapRB=True, crop=False)
    net.setInput(blob)
    outputs = net.forward()

    # Post-processing
    predictions = np.squeeze(outputs).T
    class_ids, confidences, boxes = [], [], []

    x_factor = w_img / 640.0
    y_factor = h_img / 640.0

    for row in predictions:
        scores = row[4:]
        class_id = np.argmax(scores)
        confidence = scores[class_id]

        if confidence >= CONF_THRESHOLD:
            cx, cy, w, h = row[0], row[1], row[2], row[3]
            left = int((cx - w / 2) * x_factor)
            top = int((cy - h / 2) * y_factor)
            width = int(w * x_factor)
            height = int(h * y_factor)

            boxes.append([left, top, width, height])
            confidences.append(float(confidence))
            class_ids.append(class_id)

    # NMS
    indices = cv2.dnn.NMSBoxes(boxes, confidences, CONF_THRESHOLD, IOU_THRESHOLD)
    detections = []

    if len(indices) > 0:
        for index in indices.flatten():
            c_id = class_ids[index]
            label = CLASSES[c_id] if c_id < len(CLASSES) else f"Unknown-{c_id}"

            box = boxes[index]
            left, top, width, height = box[0], box[1], box[2], box[3]
            
            # --- KONVERSI PIXEL KE PERSENTASE (0 - 100%) ---
            # Dibutuhkan agar OCR dan Frontend React bisa membaca kordinat dengan benar
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

def run_ocr_on_region(image_path: str, bbox: dict) -> str | None:
    """Jalankan OCR pada region gambar yang di-crop berdasarkan bbox (persentase)."""
    reader = get_ocr_reader()
    if reader is None:
        return None

    try:
        img = cv2.imread(image_path)
        if img is None:
            return None
        h, w = img.shape[:2]
        
        # Bbox dikalikan w dan h karena formatnya persentase (0-100)
        x1 = int((bbox["x"] / 100) * w)
        y1 = int((bbox["y"] / 100) * h)
        x2 = int(((bbox["x"] + bbox["width"]) / 100) * w)
        y2 = int(((bbox["y"] + bbox["height"]) / 100) * h)
        
        crop = img[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
        if crop.size == 0:
            return None
            
        results = reader.readtext(crop)
        texts = [text for (_, text, _) in results]
        return " ".join(texts) if texts else None
    except Exception as e:
        print(f"[OCR ERROR] {e}")
        return None

@router.post("", response_model=DetectionResponse)
async def detect_components(
    file: UploadFile = File(...),
    payload: dict = Depends(decode_access_token),
):
    """
    Upload gambar SLD dan jalankan deteksi YOLO (OpenCV) + OCR.
    """
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File harus berupa gambar")

    file_ext = os.path.splitext(file.filename or "upload.jpg")[1] or ".jpg"
    file_name = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, file_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # 1. Jalankan Deteksi ONNX
    onnx_results = run_onnx_detection(file_path)

    # 2. Iterasi Hasil Deteksi untuk OCR & Pencocokan ID Komponen
    for det in onnx_results:
        ocr_text = run_ocr_on_region(file_path, det["bbox"])
        det["ocr_text"] = ocr_text
        det["matched_component_id"] = LABEL_TO_COMPONENT.get(det["label"])

    # 3. Konversi Gambar Asli ke Base64 (Untuk Response)
    image_b64 = None
    try:
        with open(file_path, "rb") as f:
            image_b64 = f"data:{file.content_type};base64,{base64.b64encode(f.read()).decode()}"
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