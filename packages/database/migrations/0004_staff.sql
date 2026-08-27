CREATE TABLE staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  phone text,
  email text,
  photo_url text,
  active boolean NOT NULL DEFAULT true,
  booking_capacity integer NOT NULL DEFAULT 1 CHECK (booking_capacity BETWEEN 1 AND 20),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE INDEX staff_profiles_tenant_active_idx ON staff_profiles(tenant_id, active, sort_order);
CREATE TABLE skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX skills_tenant_name_unique ON skills(tenant_id, lower(name));
CREATE TABLE staff_skills (
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, staff_id, skill_id),
  FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, skill_id) REFERENCES skills(tenant_id, id) ON DELETE CASCADE
);
CREATE TABLE staff_services (
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  service_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, staff_id, service_id),
  FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX staff_services_service_idx ON staff_services(tenant_id, service_id, staff_id);
COMMENT ON TABLE staff_services IS 'Explicit tenant-safe eligibility map used by availability and booking services.';
