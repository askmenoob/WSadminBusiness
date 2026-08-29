ALTER TABLE users ADD COLUMN IF NOT EXISTS google_subject text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_subject_unique ON users(google_subject) WHERE google_subject IS NOT NULL;

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id,expires_at DESC);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);

DO $$ BEGIN
  CREATE TYPE wsb_billing_checkout_status AS ENUM ('PENDING','ACTION_REQUIRED','ACTIVE','FAILED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE saas_billing_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES saas_plans(code),
  provider text NOT NULL,
  reference text NOT NULL UNIQUE,
  provider_subscription_id text,
  status wsb_billing_checkout_status NOT NULL DEFAULT 'PENDING',
  checkout_url text,
  amount_minor bigint NOT NULL CHECK(amount_minor>0),
  currency char(3) NOT NULL DEFAULT 'MYR',
  customer_email text NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX saas_billing_provider_subscription_unique ON saas_billing_checkouts(provider,provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX saas_billing_open_checkout_unique ON saas_billing_checkouts(tenant_id,provider) WHERE status IN ('PENDING','ACTION_REQUIRED');
CREATE INDEX saas_billing_checkouts_tenant_idx ON saas_billing_checkouts(tenant_id,created_at DESC);

CREATE TABLE saas_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_name text NOT NULL,
  provider_subscription_id text,
  reference text,
  raw_status text,
  payload jsonb NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  checkout_id uuid REFERENCES saas_billing_checkouts(id) ON DELETE SET NULL,
  outcome text NOT NULL DEFAULT 'RECEIVED',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider,event_id)
);
CREATE INDEX saas_billing_events_unprocessed_idx ON saas_billing_events(received_at) WHERE processed_at IS NULL;

CREATE TABLE saas_billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  checkout_id uuid REFERENCES saas_billing_checkouts(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_charge_id text NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor>=0),
  currency char(3) NOT NULL DEFAULT 'MYR',
  status text NOT NULL CHECK(status IN('PAID','FAILED','REFUNDED')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_charge_id)
);
CREATE INDEX saas_billing_invoices_tenant_idx ON saas_billing_invoices(tenant_id,created_at DESC);

COMMENT ON TABLE auth_sessions IS 'Opaque browser sessions. Only SHA-256 token hashes are stored.';
COMMENT ON TABLE saas_billing_checkouts IS 'Tenant-to-System-Owner SaaS billing. Booking/customer payments remain in payments.';
