#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
# shellcheck disable=SC1091
. scripts/demo-lib.sh
athena_demo_load_env
athena_demo_require docker
echo "Docker (demo Cloudflare):"
athena_cloudflare_compose ps api postgres quick-tunnel
echo
echo "URL pública do Quick Tunnel:"
tunnel_origin="$(athena_cloudflare_compose logs --no-color --tail=100 quick-tunnel 2>/dev/null | grep -Eo 'https://[[:alnum:].-]+\.trycloudflare\.com' | tail -n 1 || true)"
if [ -n "$tunnel_origin" ]; then
  echo "$tunnel_origin"
else
  echo "Ainda não disponível; consulte: docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml logs quick-tunnel"
fi
