#!/usr/bin/env bash
set -euo pipefail
OUT=${1:-/tmp/wsadmin_business_$(date +%Y%m%d_%H%M%S).dump}
set -a; source .env; set +a
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$OUT"
test -s "$OUT"
echo "$OUT"
