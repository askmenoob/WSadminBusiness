#!/usr/bin/env bash
set -euo pipefail
TARGET=${1:-wsadmin_business_migration_rehearsal}; set -a; source .env; set +a
docker compose exec -T db dropdb -U "$POSTGRES_USER" --if-exists "$TARGET"; docker compose exec -T db createdb -U "$POSTGRES_USER" "$TARGET"
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55432/${TARGET}" npm run db:migrate
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:55432/${TARGET}" npm run typecheck >/dev/null
COUNT=$(docker compose exec -T db psql -U "$POSTGRES_USER" -d "$TARGET" -Atc "select count(*) from wsb_schema_migrations")
echo "MIGRATION_REHEARSAL_PASS=$COUNT"
