# VoltRAB Backend — FastAPI

Backend API untuk aplikasi VoltRAB (RAB Kelistrikan & Deteksi SLD).

## Fitur

- **Autentikasi**: Register & Login dengan JWT (password hashing bcrypt)
- **Penyimpanan Project**: Simpan/muat/hapus progres RAB per pengguna
- **Deteksi Gambar**: Upload gambar SLD, deteksi komponen dengan YOLOv8 + OCR

## Struktur

```
backend/
├── app/
│   ├── main.py              # Entry point FastAPI
│   ├── core/
│   │   ├── config.py        # Konfigurasi (env vars, CORS)
│   │   ├── security.py      # JWT & password hashing
│   │   └── database.py      # Koneksi Postgres (Supabase)
│   ├── models/
│   │   └── schemas.py       # Pydantic models
│   └── routers/
│       ├── auth.py          # /auth/register, /auth/login, /auth/me
│       ├── projects.py      # /projects (CRUD)
│       └── detection.py     # /detect (YOLOv8 + OCR)
├── uploads/                 # Folder upload gambar (sementara)
├── requirements.txt
└── .env
```

## Setup (Ubuntu/Linux)

### 1. Install Python & Virtual Environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Konfigurasi Environment

Edit file `.env` di folder `backend/`:

```env
SUPABASE_DB_URL=postgresql://postgres:postgres@db.xxxxx.supabase.co:5432/postgres
JWT_SECRET=your-secret-key
```

> `SUPABASE_DB_URL` bisa didapat dari Supabase Dashboard > Settings > Database > Connection string

### 4. Jalankan Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Server akan berjalan di `http://localhost:8000`

### 5. Akses API Documentation

Buka browser: `http://localhost:8000/docs` (Swagger UI)

## API Endpoints

### Auth

| Method | Endpoint          | Deskripsi                    |
|--------|-------------------|------------------------------|
| POST   | `/auth/register`  | Daftar akun baru             |
| POST   | `/auth/login`     | Login                        |
| GET    | `/auth/me`        | Verifikasi token & info user |

### Projects

| Method | Endpoint            | Deskripsi                    |
|--------|---------------------|------------------------------|
| GET    | `/projects`         | List semua project user      |
| POST   | `/projects`         | Buat project baru            |
| PUT    | `/projects/{id}`    | Update project               |
| DELETE | `/projects/{id}`    | Hapus project                |

### Detection

| Method | Endpoint    | Deskripsi                              |
|--------|-------------|----------------------------------------|
| POST   | `/detect`   | Upload gambar SLD, deteksi YOLOv8+OCR  |

## Catatan YOLOv8 + OCR

Backend akan otomatis mencoba load model YOLOv8. Jika model atau library
`ultralytics`/`easyocr` tidak tersedia, endpoint `/detect` akan fallback ke
**mock detections** untuk demo. Untuk deteksi sungguhan:

1. Pastikan `ultralytics` dan `easyocr` terinstall: `pip install ultralytics easyocr`
2. Letakkan model YOLOv8 terlatih di `backend/models/yolov8_sld.pt`
3. Jika tidak ada model custom, akan menggunakan `yolov8n.pt` (pre-trained COCO)

## Database

Backend menggunakan Supabase Postgres dengan 2 tabel:
- `users` — akun pengguna (password hash)
- `user_projects` — progres RAB per pengguna
