#!/usr/bin/env sh
# Shared helpers for the Netlify + tunnel demo commands. This file is sourced.
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

athena_demo_validate_production_env() {
  : "${APP_ORIGIN:?Defina APP_ORIGIN em .env.demo}"
  : "${RESEND_API_KEY:?Defina RESEND_API_KEY em .env.demo}"
  : "${RESEND_FROM:?Defina RESEND_FROM em .env.demo}"
  : "${TERMS_URL:?Defina TERMS_URL em .env.demo}"
  : "${PRIVACY_URL:?Defina PRIVACY_URL em .env.demo}"
  : "${TERMS_VERSION:?Defina TERMS_VERSION em .env.demo}"
  : "${PRIVACY_VERSION:?Defina PRIVACY_VERSION em .env.demo}"
  : "${INTEGRATION_ENCRYPTION_KEY:?Gere INTEGRATION_ENCRYPTION_KEY com openssl rand -base64 32}"
  case "$APP_ORIGIN" in https://*) ;; *) echo "APP_ORIGIN deve começar com https://" >&2; exit 1;; esac
  case "$JWT_ACCESS_SECRET" in replace-with-*|athena-local-*) echo "Use um JWT_ACCESS_SECRET aleatório em .env.demo." >&2; exit 1;; esac
  case "$JWT_REFRESH_SECRET" in replace-with-*|athena-local-*) echo "Use um JWT_REFRESH_SECRET aleatório em .env.demo." >&2; exit 1;; esac
  [ "$JWT_ACCESS_SECRET" != "$JWT_REFRESH_SECRET" ] || { echo "Os segredos JWT precisam ser diferentes." >&2; exit 1; }
}

athena_demo_compose() {
  docker compose -f docker-compose.yml -f docker-compose.demo.yml "$@"
}

athena_cloudflare_compose() {
  docker compose -f docker-compose.yml -f docker-compose.cloudflare.yml "$@"
}
