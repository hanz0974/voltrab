# VoltRAB Backend — FastAPI

Backend API untuk aplikasi VoltRAB (RAB Kelistrikan & Deteksi SLD).

## Fitur

- **Autentikasi**: Access token dari Supabase Auth
- **Penyimpanan Project**: Simpan/muat/hapus progres RAB per pengguna
- **Deteksi Gambar**: Upload gambar SLD, deteksi komponen dengan YOLOv8

## Struktur

```
backend/
├── app/
│   ├── main.py              # Entry point FastAPI
│   ├── core/
│   │   ├── config.py        # Konfigurasi (env vars, CORS)
│   │   ├── security.py      # Validasi Supabase access token
│   │   └── database.py      # Koneksi Postgres (Supabase)
│   ├── models/
│   │   └── schemas.py       # Pydantic models
│   └── routers/
│       ├── projects.py      # /projects (CRUD)
│       ├── detection.py     # /detect (YOLOv8)
│       └── reports.py       # /reports (administrasi laporan)
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
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Jika memakai nama env lama, backend juga akan membaca SUPABASE_SECRET_KEY
SUPABASE_SECRET_KEY=your-service-role-key
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
| POST   | `/detect`   | Upload gambar SLD, deteksi YOLOv8      |

## Catatan YOLOv8

Backend akan membaca model aktif dari tabel Supabase `yolo_models` dan
mengunduh file ONNX dari Supabase Storage. Jika belum ada model aktif,
endpoint `/detect` akan mengembalikan error agar admin tahu bahwa model
belum dimasukkan.

## Database

Identitas pengguna berasal dari Supabase Auth (`auth.users`). Hak admin disimpan
di `public.admin_users`; progres RAB disimpan di `public.user_projects`.
