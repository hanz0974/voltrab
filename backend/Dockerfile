# Image backend VoltRAB (FastAPI + ONNX Runtime + OpenCV)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# libglib2.0-0 dibutuhkan sebagian build OpenCV headless pada image slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY models ./models

# Jalankan aplikasi sebagai pengguna biasa, bukan root
RUN mkdir -p uploads models \
    && useradd --system --uid 10001 voltrab \
    && chown -R voltrab /app
USER voltrab

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
