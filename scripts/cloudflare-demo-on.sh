#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
# shellcheck disable=SC1091
. scripts/demo-lib.sh
athena_demo_load_env
athena_demo_require docker
athena_demo_validate_production_env

case "$NETLIFY_SITE_ORIGIN" in https://*) ;; *) echo "NETLIFY_SITE_ORIGIN deve começar com https://" >&2; exit 1;; esac

echo "Iniciando API e Cloudflare Quick Tunnel. O PostgreSQL continua privado..."
athena_cloudflare_compose up -d --build postgres api quick-tunnel

attempt=0
tunnel_origin=""
while [ "$attempt" -lt 30 ]; do
  tunnel_origin="$(athena_cloudflare_compose logs --no-color --tail=100 quick-tunnel 2>/dev/null | grep -Eo 'https://[[:alnum:].-]+\.trycloudflare\.com' | tail -n 1 || true)"
  [ -n "$tunnel_origin" ] && break
  attempt=$((attempt + 1))
  sleep 2
done

if [ -z "$tunnel_origin" ]; then
  echo "A API iniciou, mas o Cloudflare ainda não publicou a URL. Consulte os logs:"
  echo "  docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml logs -f quick-tunnel"
  exit 1
fi

echo "Quick Tunnel ativo: $tunnel_origin"
echo "No Netlify (${NETLIFY_SITE_ORIGIN}), configure API_TUNNEL_ORIGIN com essa origem HTTPS."
echo "Disponibilize a variável para Edge Functions e faça um novo deploy."
