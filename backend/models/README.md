# Folder Model ONNX

Letakkan file model ONNX (`.onnx`) Anda di folder ini.

## Cara Pakai

1. Ekspor model YOLOv8 Anda ke format ONNX:
   ```python
   from ultralytics import YOLO
   model = YOLO("yolov8n.pt")
   model.export(format="onnx", imgsz=640)
   ```
   Ini akan menghasilkan file `yolov8n.onnx`.

2. Salin file `.onnx` ke folder ini (`backend/models/`).

3. (Opsional) Sertakan file class names agar label terbaca dengan benar.
   Letakkan salah satu file berikut di folder ini:
   - `<nama_model>.json` — format: `{"names": {"0": "MCB", "1": "MCCB", ...}}`
   - `<nama_model>.txt` — satu label per baris
   - `classes.txt` — satu label per baris (berlaku untuk semua model)
   - `metadata.json` — format: `{"names": {"0": "MCB", "1": "MCCB", ...}}`

   Jika tidak ada file class names, deteksi akan tetap berjalan tetapi label
   akan tampil sebagai `class_0`, `class_1`, dst.

4. Jalankan backend FastAPI. Model ONNX akan otomatis dimuat saat pertama kali
   endpoint `/detect` dipanggil.

## Catatan

- Model harus menggunakan input size 640x640 (standar YOLOv8).
- Output harus dalam format YOLOv8: `(1, 84, 8400)` atau `(1, 8400, 84)`.
- Jika model ONNX tidak ditemukan atau `onnxruntime` tidak terinstall,
   backend akan otomatis fallback ke mock detections untuk demo.
- OCR menggunakan EasyOCR dan bersifat opsional (jika tidak terinstall,
   field `ocr_text` akan `null`).
