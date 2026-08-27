# WSadmin Business

Independent WSadmin product for AI-first business booking, CRM and operations. This repository is intentionally isolated from WSadmin MVOC.

## Local stack

`docker compose up -d --build` starts PostgreSQL on 127.0.0.1:55432, Redis on 127.0.0.1:56379, API on 127.0.0.1:15280 and web on 127.0.0.1:15281. Worker uses the private `wsb:` Redis namespace.

## Quality gate

Run `npm run check` and `./scripts/isolation-smoke.sh`. Never copy MVOC secrets or write into `/opt/wsadmin`.

## Branches

`dev` is active development. `main` is the release/baseline branch. Every completed canonical TODO item must have a pushed GitHub SHA recorded in the Google Sheet.
