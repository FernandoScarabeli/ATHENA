#!/usr/bin/env sh
# Shared helpers for the Netlify + Funnel demo commands. This file is sourced.
set -eu

athena_demo_load_env() {
  ATHENA_DEMO_ENV_FILE="${ATHENA_DEMO_ENV_FILE:-.env.demo}"
  if [ ! -f "$ATHENA_DEMO_ENV_FILE" ]; then
    echo "Arquivo $ATHENA_DEMO_ENV_FILE não encontrado. Copie .env.demo.example para .env.demo e preencha os valores." >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  case "$ATHENA_DEMO_ENV_FILE" in
    /*) ;;
    *) ATHENA_DEMO_ENV_FILE="./$ATHENA_DEMO_ENV_FILE" ;;
  esac
  . "$ATHENA_DEMO_ENV_FILE"
  set +a
  : "${NETLIFY_SITE_ORIGIN:?Defina NETLIFY_SITE_ORIGIN em .env.demo}"
  : "${JWT_ACCESS_SECRET:?Defina JWT_ACCESS_SECRET em .env.demo}"
  : "${JWT_REFRESH_SECRET:?Defina JWT_REFRESH_SECRET em .env.demo}"
  FUNNEL_API_PORT="${FUNNEL_API_PORT:-3000}"
  FUNNEL_HTTPS_PORT="${FUNNEL_HTTPS_PORT:-443}"
  export NETLIFY_SITE_ORIGIN JWT_ACCESS_SECRET JWT_REFRESH_SECRET FUNNEL_API_PORT FUNNEL_HTTPS_PORT
}

athena_demo_require() {
  command -v "$1" >/dev/null 2>&1 || { echo "Dependência ausente: $1" >&2; exit 1; }
}

athena_demo_compose() {
  docker compose -f docker-compose.yml -f docker-compose.demo.yml "$@"
}
