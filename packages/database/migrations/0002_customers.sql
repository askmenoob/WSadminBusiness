CREATE TYPE wsb_customer_status AS ENUM ('ACTIVE','ARCHIVED');
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text,
  phone text,
  email text,
  locale text NOT NULL DEFAULT 'ms-MY',
  status wsb_customer_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_identity_required CHECK (name IS NOT NULL OR phone IS NOT NULL OR email IS NOT NULL)
);
CREATE UNIQUE INDEX customers_tenant_phone_unique ON customers(tenant_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX customers_tenant_email_unique ON customers(tenant_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX customers_tenant_name_idx ON customers(tenant_id, lower(name)) WHERE name IS NOT NULL;
CREATE INDEX customers_tenant_status_idx ON customers(tenant_id, status);
COMMENT ON TABLE customers IS 'Tenant-scoped WSadmin Business customer directory. All reads/writes must include tenant_id.';
