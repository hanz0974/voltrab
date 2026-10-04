#!/usr/bin/env bash
# Memperbaiki Content-Security-Policy Nginx di server VoltRAB.
#
# CSP hasil perbaikan keamanan M1 memblokir dua sumber yang dibutuhkan aplikasi:
#   - Cloudflare Turnstile (skrip dan iframe dari challenges.cloudflare.com) pada halaman masuk,
#     daftar, dan lupa password
#   - Google Fonts (stylesheet dari fonts.googleapis.com dan file font dari fonts.gstatic.com)
# Skrip ini hanya menambahkan sumber tersebut; aturan CSP lainnya tetap sama.
#
# Pemakaian (dijalankan dari laptop): bash deploy/perbaiki-csp.sh
set -euo pipefail

SERVER="root@95.111.196.35"

ssh "$SERVER" 'bash -s' << 'REMOTE'
set -euo pipefail
CONF=/etc/nginx/sites-enabled/voltrab
BACKUP="/root/voltrab.nginx.sebelum-csp.$(date +%Y%m%d%H%M%S)"

cp "$CONF" "$BACKUP"
echo "Cadangan config: $BACKUP"

CSP="default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"

JUMLAH=$(grep -c 'add_header Content-Security-Policy' "$CONF" || true)
if [ "$JUMLAH" -lt 1 ]; then
  echo "GAGAL: baris Content-Security-Policy tidak ditemukan di $CONF" >&2
  exit 1
fi

# --follow-symlinks agar file asli yang diubah bila sites-enabled berupa symlink
sed -i --follow-symlinks "s|add_header Content-Security-Policy \".*\" always;|add_header Content-Security-Policy \"$CSP\" always;|" "$CONF"
echo "Baris CSP diperbarui: $JUMLAH"

if nginx -t; then
  systemctl reload nginx
  echo "Nginx dimuat ulang."
else
  echo "Tes config gagal, config lama dikembalikan." >&2
  cp "$BACKUP" "$(readlink -f "$CONF")"
  exit 1
fi

echo "--- Header CSP yang sekarang dikirim:"
curl -sSI https://voltrab.web.id/ | grep -i content-security-policy
REMOTE
