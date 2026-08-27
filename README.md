# WSadmin Business

AI-powered WhatsApp Business Operating System.

## Isolation contract
- Separate from `/opt/wsadmin` (WSadmin MVOC).
- Separate database, Redis, Docker resources and WhatsApp instance.
- No runtime dependency on MVOC.
- AI interprets intent; deterministic business services perform writes.

## Current phase
Phase 0 — Isolation and foundation.
