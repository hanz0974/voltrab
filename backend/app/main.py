"""
Entry point aplikasi FastAPI untuk VoltRAB.
Menyediakan:
- Deteksi komponen SLD dengan YOLOv8
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import CORS_ORIGINS
from app.routers import detection, reports

import os as _os
_DOCS_ON = _os.getenv("ENABLE_API_DOCS", "false").lower() == "true"
app = FastAPI(
    title="VoltRAB API",
    description="Backend API untuk RAB Kelistrikan & Deteksi SLD dengan YOLOv8",
    version="1.0.0",
    docs_url="/docs" if _DOCS_ON else None,
    redoc_url="/redoc" if _DOCS_ON else None,
    openapi_url="/openapi.json" if _DOCS_ON else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detection.router)
app.include_router(reports.router)


@app.on_event("startup")
def preload_detection_model():
    detection.preload_active_model()


@app.get("/")
def root():
    return {"status": "ok", "service": "VoltRAB API", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}
