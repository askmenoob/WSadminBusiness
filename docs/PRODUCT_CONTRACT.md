# WSadmin Business Product Contract

WSadmin Business is a new multi-tenant business operating system under the WSadmin brand. It is not a module inside WSadmin MVOC and must not share MVOC runtime state, database schema, Redis keys, WhatsApp sessions, secrets, migrations, or deployment lifecycle.

## Product promise

Repitte-class booking, staff/resource scheduling, CRM, messaging automation, payments and advanced integrations are combined with a WSadmin-native AI receptionist and AI Inbox.

## Non-negotiable architecture

1. AI interprets natural language; deterministic domain services validate and execute business actions.
2. AI never writes PostgreSQL directly and cannot bypass service authorization or tenant boundaries.
3. All business-owned records are tenant-scoped; location scoping is added where operationally relevant.
4. WhatsApp is accessed through a provider adapter. Evolution is first implementation, not a permanent coupling.
5. Dashboard, WhatsApp, web booking and AI use the same Booking Service and availability rules.
6. Human takeover is always available for uncertain or sensitive conversations.
7. Every completed TODO checkpoint is committed and pushed to the user-designated GitHub repository `askmenoob/WSadminBusiness`; no secrets or local `.env` files may be committed.

## Product name

Brand: WSadmin. Product: WSadmin Business. Existing WSadmin MVOC remains a separate protected system.
