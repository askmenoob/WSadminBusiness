CREATE TYPE wsb_resource_type AS ENUM ('ROOM','PROPERTY','EQUIPMENT','CHAIR','BAY','VEHICLE','OTHER');
CREATE TABLE resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  type wsb_resource_type NOT NULL,
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 1000),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id)
);
CREATE UNIQUE INDEX resources_tenant_name_unique ON resources(tenant_id,lower(name));
CREATE INDEX resources_tenant_active_type_idx ON resources(tenant_id,active,type,sort_order);
CREATE TABLE resource_services (
  tenant_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  service_id uuid NOT NULL,
  PRIMARY KEY (tenant_id,resource_id,service_id),
  FOREIGN KEY (tenant_id,resource_id) REFERENCES resources(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,service_id) REFERENCES services(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX resource_services_service_idx ON resource_services(tenant_id,service_id,resource_id);
COMMENT ON TABLE resource_services IS 'Tenant-safe compatibility map; allocation priority/options are layered in later advanced booking work.';
