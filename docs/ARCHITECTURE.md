# Architecture Baseline

Customer channels (WhatsApp / Web) -> Message & Request Gateway -> AI Interpreter when needed -> deterministic Business Services -> PostgreSQL.

Core services: Tenant/RBAC, Customer CRM, Service Catalog, Staff/Shift, Resource, Availability, Booking, Payment, Automation, Messaging, Reporting.

Redis is isolated with WSadmin Business-owned keys and is used for queues, idempotency, transient locks and worker coordination. PostgreSQL is the source of truth for durable business state.

The UI is a light-theme operational dashboard with AI Inbox, Calendar, Bookings, Customers, Staff, Services, Resources, Payments, Marketing, Reports and Settings. Calendar is an operational board, not only analytics.
