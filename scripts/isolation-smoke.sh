#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
expected_head='8d002a7445debf693014f7e3ff6f465f750c2a67'
actual_head="$(git -C /opt/wsadmin rev-parse HEAD)"
[ "$actual_head" = "$expected_head" ] || { echo "MVOC HEAD drift: $actual_head" >&2; exit 10; }
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
git -C /opt/wsadmin status --porcelain | sort > "$tmp"
sort docs/mvoc-baseline-status.txt | diff -u - "$tmp"
curl -fsS http://127.0.0.1:15280/health | grep -q '"status":"ok"'
docker compose exec -T db pg_isready -U "${POSTGRES_USER:-wsadmin_business}" -d "${POSTGRES_DB:-wsadmin_business}" >/dev/null
docker compose exec -T redis redis-cli GET wsb:health:worker | grep -q .
echo 'WSadmin Business isolation smoke: PASS'
