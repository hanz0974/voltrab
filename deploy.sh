#!/usr/bin/env bash
# Kirim perubahan VoltRAB ke server produksi.
# Pemakaian: ./deploy.sh [frontend|backend|all]   (bawaan: all)
set -euo pipefail

SERVER="root@95.111.196.35"
TARGET="${1:-all}"
cd "$(dirname "$0")"

deploy_frontend() {
  echo "==> Build frontend"
  npm run build
  if grep -rq 'localhost:8000' dist; then
    echo "GAGAL: hasil build masih berisi localhost:8000. Periksa .env.production." >&2
    exit 1
  fi
  echo "==> Kirim frontend ke server"
  rsync -az --delete dist/ "$SERVER:/var/www/voltrab/"
}

deploy_backend() {
  echo "==> Kirim backend ke server"
  # .env dan uploads di server tidak ikut ditimpa atau dihapus
  rsync -az --delete \
    --exclude 'venv' --exclude '.venv' --exclude '__pycache__' \
    --exclude 'uploads/*' --exclude '.env' \
    backend/ "$SERVER:/opt/voltrab/backend/"
  echo "==> Bangun ulang dan jalankan container"
  ssh "$SERVER" "cd /opt/voltrab/backend && docker compose up -d --build && docker image prune -f >/dev/null"
}

case "$TARGET" in
  frontend) deploy_frontend ;;
  backend)  deploy_backend ;;
  all)      deploy_frontend; deploy_backend ;;
  *) echo "Pemakaian: ./deploy.sh [frontend|backend|all]" >&2; exit 1 ;;
esac

echo "==> Selesai. Cek https://voltrab.web.id"
