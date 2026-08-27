DO $$ BEGIN
  CREATE TYPE wsb_option_selection_mode AS ENUM ('SINGLE','MULTIPLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE service_option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  service_id uuid NOT NULL,
  name text NOT NULL,
  selection_mode wsb_option_selection_mode NOT NULL DEFAULT 'SINGLE',
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,service_id) REFERENCES services(tenant_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX service_option_groups_name_unique ON service_option_groups(tenant_id,service_id,lower(name));
CREATE TABLE service_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  group_id uuid NOT NULL,
  name text NOT NULL,
  duration_delta_minutes integer NOT NULL DEFAULT 0 CHECK(duration_delta_minutes BETWEEN 0 AND 1440),
  price_delta_minor bigint NOT NULL DEFAULT 0 CHECK(price_delta_minor>=0),
  required_resource_type wsb_resource_type,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,group_id) REFERENCES service_option_groups(tenant_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX service_options_name_unique ON service_options(tenant_id,group_id,lower(name));
ALTER TABLE resource_services ADD COLUMN allocation_priority integer NOT NULL DEFAULT 100 CHECK(allocation_priority BETWEEN 0 AND 100000);
ALTER TABLE bookings ADD COLUMN duration_minutes integer NOT NULL DEFAULT 0 CHECK(duration_minutes>=0);
ALTER TABLE bookings ADD COLUMN base_price_minor bigint NOT NULL DEFAULT 0 CHECK(base_price_minor>=0);
ALTER TABLE bookings ADD COLUMN option_price_minor bigint NOT NULL DEFAULT 0 CHECK(option_price_minor>=0);
ALTER TABLE bookings ADD COLUMN price_minor bigint NOT NULL DEFAULT 0 CHECK(price_minor>=0);
ALTER TABLE bookings ADD COLUMN currency char(3) NOT NULL DEFAULT 'MYR';
CREATE TABLE booking_service_options (
  tenant_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  option_id uuid NOT NULL,
  PRIMARY KEY(tenant_id,booking_id,option_id),
  FOREIGN KEY(tenant_id,booking_id) REFERENCES bookings(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,option_id) REFERENCES service_options(tenant_id,id)
);
CREATE INDEX resource_services_priority_idx ON resource_services(tenant_id,service_id,allocation_priority,resource_id);
