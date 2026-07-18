"""
Entry point aplikasi FastAPI untuk VoltRAB.
Menyediakan:
- Autentikasi (register, login, verify)
- Penyimpanan progres RAB per pengguna
- Deteksi komponen SLD dengan YOLOv8 + OCR
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import CORS_ORIGINS
from app.routers import auth, projects, detection

app = FastAPI(
    title="VoltRAB API",
    description="Backend API untuk RAB Kelistrikan & Deteksi SLD dengan YOLOv8 + OCR",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(detection.router)


@app.on_event("startup")
def preload_detection_model():
    detection.preload_active_model()


@app.get("/")
def root():
    return {"status": "ok", "service": "VoltRAB API", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}
