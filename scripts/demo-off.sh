#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
# shellcheck disable=SC1091
. scripts/demo-lib.sh
athena_demo_load_env
athena_demo_require docker
athena_demo_require tailscale

# Disable only ATHENA's selected HTTPS Funnel port; do not reset all Funnel config.
tailscale funnel --https="$FUNNEL_HTTPS_PORT" off || true
athena_demo_compose stop api postgres
echo "Demonstração parada. Containers e volumes foram preservados."
