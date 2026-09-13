#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
# shellcheck disable=SC1091
. scripts/demo-lib.sh
athena_demo_load_env
athena_demo_require docker
athena_demo_require tailscale
athena_demo_require curl

case "$NETLIFY_SITE_ORIGIN" in https://*) ;; *) echo "NETLIFY_SITE_ORIGIN deve começar com https://" >&2; exit 1;; esac
if [ "$JWT_ACCESS_SECRET" = "athena-local-access-secret-change-in-production" ] || [ "$JWT_REFRESH_SECRET" = "athena-local-refresh-secret-change-in-production" ]; then
  echo "Use secrets JWT exclusivos no .env.demo; os defaults locais não são aceitos para a demonstração." >&2
  exit 1
fi

echo "Iniciando API de demonstração em 127.0.0.1:${FUNNEL_API_PORT} (PostgreSQL permanece privado)..."
athena_demo_compose up -d --build postgres ollama api
attempt=0
until curl --fail --silent --show-error "http://127.0.0.1:${FUNNEL_API_PORT}/api/health" >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "A API não ficou saudável. Consulte: docker compose -f docker-compose.yml -f docker-compose.demo.yml logs api" >&2
    exit 1
  fi
  sleep 1
done

# Reapplying this port and target updates the same Funnel instead of creating another.
tailscale funnel --bg --yes --https="$FUNNEL_HTTPS_PORT" "http://127.0.0.1:${FUNNEL_API_PORT}"
echo
echo "Demonstração ativa. Configure TAILSCALE_FUNNEL_ORIGIN no Netlify com a URL HTTPS exibida abaixo:"
tailscale funnel status
echo "Frontend esperado: $NETLIFY_SITE_ORIGIN"
