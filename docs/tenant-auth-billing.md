# Tenant login and System Owner billing

WSadmin Business uses Google OAuth only for tenant identity. It requests `openid email profile`, validates OAuth state, uses PKCE, requires a verified Google email, and stores an opaque browser session as a SHA-256 hash. The browser never supplies its own tenant role in Google mode.

## Google OAuth setup

Register this exact authorized redirect URI in the Google OAuth client:

`https://wsadmin-biz.imai.my/api/v1/auth/google/callback`

Set `WSADMIN_AUTH_MODE=GOOGLE`, `GOOGLE_CLIENT_ID`, and either `GOOGLE_CLIENT_SECRET` or `GOOGLE_CLIENT_SECRET_FILE`. A first successful login creates one tenant, business and `TENANT_OWNER` membership transactionally, then opens onboarding.

## Free trial and company setup

The first successful tenant login also creates a `TRIAL` subscription. `WSADMIN_TRIAL_DAYS` controls its duration and defaults to 10; set it to 7 when a seven-day campaign is required. `WSADMIN_TRIAL_PLAN_CODE` defaults to the seeded `TRIAL` plan. Repeated login never extends or resets an existing subscription.

The first wizard step records the tenant's company name, registration number, operational email and phone, website, address, country and timezone. Saving the step updates both the tenant identity and its primary business row in one database transaction.

The complete eight-step wizard is business information, business type, business sub-type, offerings, offering details, customer workflow, payment policy, and WhatsApp/AI configuration. Business type is the tenant workspace engine: it selects industry terminology, valid sub-types, offering fields, supported workflows, dashboard modules and AI grounding. For example, Property tenants manage properties, units, rooms, guests and bookings rather than salon services and staff. Completed wizard data is projected into operational records for locations, services/staff, properties, booking policy and working hours, while the universal offering catalogue preserves industry-specific details.

Industry attributes remain isolated with each tenant offering. Automotive records vehicle questions, parts and workshop-bay needs; F&B records menu variants, add-ons and fulfilment channels; Retail records SKU, stock and variants; Education records subject, level, schedule and registration fee; Professional and Home Services record qualification or service-area rules; Event records package inclusions, add-ons and quotation requirements. These fields are surfaced in the tailored catalogue and included in AI knowledge instead of being forced into salon-oriented columns.

An expired trial cannot call operational tenant APIs. Subscription and billing endpoints remain available for future reactivation. No payment method or checkout is required to start the trial.

## HitPay recurring billing

WSadmin subscriptions use HitPay recurring billing and are separate from booking payments. The HitPay API key belongs to the System Owner merchant account. MyPocket and WSadmin may share that provider account, but they do not share subscription, quota or entitlement records.

Set `HITPAY_MODE=SANDBOX` or `PRODUCTION`, plus the matching API key and per-webhook salt. Register this endpoint in HitPay:

`https://wsadmin-biz.imai.my/api/v1/webhooks/billing/hitpay`

Subscribe it to:

- `charge.created`
- `recurring_billing.method_attached`
- `recurring_billing.method_detached`
- `recurring_billing.subscription_updated`

The handler verifies `Hitpay-Signature` against the exact raw JSON body using HMAC-SHA256. Browser redirects never activate a plan. Only an idempotently processed, verified webhook or an explicit System Owner override can change subscription state.

Before enabling checkout, the System Owner must publish at least one active plan with a positive MYR monthly price through `POST /api/v1/system/plans`. Pricing is intentionally not seeded because no commercial plan or price is approved in the WSadmin Business roadmap yet.

Use sandbox credentials with `https://api.sandbox.hit-pay.com`. Production credentials use `https://api.hit-pay.com`; API keys and salts from the two environments cannot be mixed.
