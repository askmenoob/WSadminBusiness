DO $$ BEGIN
  CREATE TYPE wsb_calendar_block_scope AS ENUM ('TENANT','STAFF','RESOURCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE wsb_calendar_recurrence AS ENUM ('NONE','DAILY','WEEKLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE calendar_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope wsb_calendar_block_scope NOT NULL,
  staff_id uuid,
  resource_id uuid,
  type text NOT NULL DEFAULT 'STOP_SALE' CHECK (type IN ('STOP_SALE','BLOCKED')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  recurrence wsb_calendar_recurrence NOT NULL DEFAULT 'NONE',
  recurrence_until timestamptz,
  reason text,
  created_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  CHECK ((scope='TENANT' AND staff_id IS NULL AND resource_id IS NULL) OR (scope='STAFF' AND staff_id IS NOT NULL AND resource_id IS NULL) OR (scope='RESOURCE' AND resource_id IS NOT NULL AND staff_id IS NULL)),
  CHECK (recurrence='NONE' OR recurrence_until IS NULL OR recurrence_until >= starts_at),
  FOREIGN KEY (tenant_id,staff_id) REFERENCES staff_profiles(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,resource_id) REFERENCES resources(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX calendar_blocks_tenant_window_idx ON calendar_blocks(tenant_id,starts_at,ends_at);
CREATE INDEX calendar_blocks_staff_idx ON calendar_blocks(tenant_id,staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX calendar_blocks_resource_idx ON calendar_blocks(tenant_id,resource_id) WHERE resource_id IS NOT NULL;
