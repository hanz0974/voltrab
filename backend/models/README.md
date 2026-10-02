# Folder Model ONNX

Model ONNX aktif dikelola melalui menu admin dan disimpan di Supabase Storage.

## Cara Pakai

1. Ekspor model YOLOv8 Anda ke format ONNX:
   ```python
   from ultralytics import YOLO
   model = YOLO("yolov8n.pt")
   model.export(format="onnx", imgsz=640)
   ```
   Ini akan menghasilkan file `yolov8n.onnx`.

2. Unggah file `.onnx` melalui menu admin. Backend otomatis memuat model aktif
   dari Supabase saat aplikasi dimulai.

3. Nama kelas dibaca dari metadata model ONNX. Jika metadata tidak tersedia,
   backend menggunakan daftar label fallback di modul deteksi.

## Catatan

- Model harus menggunakan input size 640x640 (standar YOLOv8).
- Output harus dalam format YOLOv8: `(1, 84, 8400)` atau `(1, 8400, 84)`.
- Jika belum ada model aktif di Supabase, backend akan mengembalikan error
   agar admin tahu model belum diunggah.
- Output deteksi hanya berisi label, confidence, bounding box, dan ID
   komponen yang cocok.
