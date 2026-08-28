#!/usr/bin/env bash
set -euo pipefail
DUMP=${1:?dump file required}; TARGET=${2:-wsadmin_business_restore_test}
set -a; source .env; set +a
docker compose exec -T db dropdb -U "$POSTGRES_USER" --if-exists "$TARGET"
docker compose exec -T db createdb -U "$POSTGRES_USER" "$TARGET"
cat "$DUMP" | docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$TARGET" --no-owner --no-privileges
COUNT=$(docker compose exec -T db psql -U "$POSTGRES_USER" -d "$TARGET" -Atc "select count(*) from wsb_schema_migrations")
echo "RESTORE_MIGRATIONS=$COUNT"
