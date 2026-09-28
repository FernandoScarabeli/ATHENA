#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
# shellcheck disable=SC1091
. scripts/demo-lib.sh
athena_demo_load_env
athena_demo_require docker
athena_cloudflare_compose stop quick-tunnel api postgres
echo "Quick Tunnel e API parados. Containers e volumes foram preservados."
