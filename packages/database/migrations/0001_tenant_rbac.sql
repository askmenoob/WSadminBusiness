CREATE TYPE wsb_tenant_status AS ENUM ('ACTIVE','SUSPENDED','ARCHIVED');
CREATE TYPE wsb_business_status AS ENUM ('ACTIVE','SUSPENDED','ARCHIVED');
CREATE TYPE wsb_platform_role AS ENUM ('USER','SYSTEM_OWNER');
CREATE TYPE wsb_tenant_role AS ENUM ('TENANT_OWNER','ADMIN','MANAGER','STAFF','VIEWER');

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status wsb_tenant_status NOT NULL DEFAULT 'ACTIVE',
  default_timezone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  default_currency char(3) NOT NULL DEFAULT 'MYR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL, vertical text NOT NULL DEFAULT 'OTHER', status wsb_business_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text,
  platform_role wsb_platform_role NOT NULL DEFAULT 'USER',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role wsb_tenant_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX businesses_tenant_id_idx ON businesses(tenant_id);
CREATE INDEX tenant_memberships_tenant_id_idx ON tenant_memberships(tenant_id);
CREATE INDEX tenant_memberships_user_id_idx ON tenant_memberships(user_id);
COMMENT ON TABLE tenants IS 'WSadmin Business tenant root. Business domain rows must reference a tenant directly or through a tenant-owned parent.';
COMMENT ON TABLE tenant_memberships IS 'Tenant-scoped RBAC. SYSTEM_OWNER is represented only by users.platform_role.';
