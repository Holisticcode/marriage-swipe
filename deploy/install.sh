#!/usr/bin/env bash
# Run on a fresh Ubuntu 22.04/24.04 VPS as root:  bash deploy/install.sh
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { curl -fsSL https://get.docker.com | sh; }
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|; s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 48)|; s|^MEDIA_SECRET=.*|MEDIA_SECRET=$(openssl rand -hex 48)|" .env
  echo "Created deploy/.env with fresh secrets. Edit DOMAIN, CONTACT_EMAIL and SMTP_* now, then run this script again."
  exit 0
fi
ufw allow OpenSSH >/dev/null 2>&1 || true; ufw allow 80,443/tcp >/dev/null 2>&1 || true
docker compose up -d --build
echo "Started. Create your admin login with:"
echo "  docker compose -f deploy/docker-compose.yml exec api node src/scripts/create-admin.js you@yourdomain.com 'a-long-password'"
