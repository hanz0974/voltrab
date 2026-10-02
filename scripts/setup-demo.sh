#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLOUDFLARED_BIN="$PROJECT_DIR/.tools/cloudflared"
MAMBA_ENV="${MAMBA_ENV:-voltrab}"

cd "$PROJECT_DIR"

if [[ ! -x "$CLOUDFLARED_BIN" ]]; then
  mkdir -p "$PROJECT_DIR/.tools"
  curl --fail --location --retry 2 \
    --output "$CLOUDFLARED_BIN" \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod 0755 "$CLOUDFLARED_BIN"
fi

if ! command -v mamba >/dev/null 2>&1; then
  echo "Mamba tidak ditemukan di PATH."
  exit 1
fi

mamba run -n "$MAMBA_ENV" python -m pip install --requirement backend/requirements.txt
npm install

echo
echo "Setup selesai. Jalankan: ./scripts/share-demo.sh"
