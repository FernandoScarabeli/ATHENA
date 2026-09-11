#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
# shellcheck disable=SC1091
. scripts/demo-lib.sh
athena_demo_load_env
athena_demo_require docker
athena_demo_require tailscale
echo "Docker (demo):"
athena_demo_compose ps api postgres
echo
echo "Tailscale Funnel:"
tailscale funnel status
