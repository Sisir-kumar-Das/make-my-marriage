#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
logs=$(mktemp -d)
pids=()
cleanup() {
  local status=$?
  if (( ${#pids[@]} )); then
    kill -TERM "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
  if (( status != 0 )); then
    cat "$logs/api" "$logs/web" >&2
  fi
  rm -f -- "$logs/api" "$logs/web"
  rmdir -- "$logs"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

origin=http://127.0.0.1:3184
api=http://127.0.0.1:4184/api/v1
node=$(command -v node)
cd "$root"
env -i PATH="$PATH" NODE_ENV=production PORT=4184 WEB_ORIGIN="$origin" \
  AUTH_JWT_SECRET=isolated-build-check-secret-xxxxxxxxxxxxxxxxxxxxxxxx \
  "$node" apps/api/src/server.js > "$logs/api" 2>&1 &
pids+=("$!")
cd apps/web
env -i PATH="$PATH" NODE_ENV=production API_BASE_URL="$api" \
  "$node" "$root/node_modules/next/dist/bin/next" start --hostname 127.0.0.1 --port 3184 > "$logs/web" 2>&1 &
pids+=("$!")
cd "$root"

for attempt in {1..24}; do
  if curl -fsS --max-time 2 "$origin/api/v1/health" >/dev/null 2>&1; then break; fi
  for pid in "${pids[@]}"; do kill -0 "$pid"; done
  test "$attempt" -lt 24
  sleep 1
done
SMOKE_WEB_URL="$origin" SMOKE_API_BASE_URL="$api" npm run smoke
