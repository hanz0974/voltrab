#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLOUDFLARED_BIN="$PROJECT_DIR/.tools/cloudflared"
PID_DIR="$PROJECT_DIR/.demo-pids"
MAMBA_ENV="${MAMBA_ENV:-voltrab}"

if ! command -v mamba >/dev/null 2>&1; then
  echo "Mamba tidak ditemukan di PATH."
  exit 1
fi

if ! mamba run -n "$MAMBA_ENV" python -c "import fastapi, uvicorn, onnxruntime" >/dev/null 2>&1; then
  echo "Environment Mamba '$MAMBA_ENV' belum siap. Jalankan: ./scripts/setup-demo.sh"
  exit 1
fi

if [[ ! -x "$CLOUDFLARED_BIN" ]]; then
  echo "cloudflared belum terpasang. Jalankan: ./scripts/setup-demo.sh"
  exit 1
fi

mkdir -p "$PID_DIR"

cleanup() {
  local pid
  for pid_file in "$PID_DIR"/*.pid; do
    [[ -f "$pid_file" ]] || continue
    pid="$(<"$pid_file")"
    kill "$pid" 2>/dev/null || true
  done
  rm -rf "$PID_DIR"
}
trap cleanup EXIT INT TERM

cd "$PROJECT_DIR"

mamba run -n "$MAMBA_ENV" python -m uvicorn app.main:app \
  --app-dir backend --host 127.0.0.1 --port 8000 &
echo $! > "$PID_DIR/backend.pid"

npm run dev -- --host 127.0.0.1 --port 5173 &
echo $! > "$PID_DIR/frontend.pid"

echo "Menunggu frontend dan backend siap..."
for _ in {1..60}; do
  if curl --silent --fail http://127.0.0.1:8000/health >/dev/null \
    && curl --silent --fail http://127.0.0.1:5173 >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl --silent --fail http://127.0.0.1:8000/health >/dev/null; then
  echo "Backend gagal aktif di port 8000. Cek log di atas."
  exit 1
fi

if ! curl --silent --fail http://127.0.0.1:5173 >/dev/null; then
  echo "Frontend gagal aktif di port 5173. Cek log di atas."
  exit 1
fi

echo
echo "Website siap. Tunggu URL https://*.trycloudflare.com di bawah ini."
echo "Biarkan terminal ini tetap terbuka selama website dibagikan."
echo

"$CLOUDFLARED_BIN" tunnel \
  --url http://127.0.0.1:5173 \
  --no-autoupdate
