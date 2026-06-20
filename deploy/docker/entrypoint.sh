#!/usr/bin/env bash
set -euo pipefail
# Select what this container runs via ROLE (api | web | worker | all).
cd /app
case "${ROLE:-all}" in
  api)    exec pnpm --filter @dct/api start ;;
  web)    exec pnpm --filter @dct/web start ;;
  worker) exec pnpm --filter @dct/api reconcile ;;  # placeholder until the worker app lands
  all)
    pnpm --filter @dct/api start &
    DCT_API_URL="http://localhost:${PORT:-4400}" pnpm --filter @dct/web start &
    wait -n ;;
  *) echo "unknown ROLE: ${ROLE}"; exit 2 ;;
esac
