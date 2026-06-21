#!/usr/bin/env bash
set -euo pipefail
# Select what this container runs via ROLE (api | web | worker | all).
# In `all` mode the API runs on :4400 (internal) and the web UI binds $PORT
# (the public port; Railway/k8s inject it), proxying server-side to the API.
cd /app
case "${ROLE:-all}" in
  api)    exec pnpm --filter @dct/api start ;;
  web)    exec pnpm --filter @dct/web start ;;
  worker) exec pnpm --filter @dct/api reconcile ;;  # placeholder until the worker app lands
  all)
    PORT=4400 pnpm --filter @dct/api start &
    DCT_API_URL="http://localhost:4400" pnpm --filter @dct/web start &
    wait -n ;;
  *) echo "unknown ROLE: ${ROLE}"; exit 2 ;;
esac
