ALTER TABLE businesses ADD CONSTRAINT businesses_tenant_id_id_unique UNIQUE(tenant_id,id);
CREATE TABLE locations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 business_id uuid NOT NULL,
 name text NOT NULL,
 code text NOT NULL,
 timezone text,
 address text,
 active boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,code),
 FOREIGN KEY(tenant_id,business_id) REFERENCES businesses(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE staff_locations (
 tenant_id uuid NOT NULL,staff_id uuid NOT NULL,location_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,staff_id,location_id),
 FOREIGN KEY(tenant_id,staff_id) REFERENCES staff_profiles(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,location_id) REFERENCES locations(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE service_locations (
 tenant_id uuid NOT NULL,service_id uuid NOT NULL,location_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,service_id,location_id),
 FOREIGN KEY(tenant_id,service_id) REFERENCES services(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,location_id) REFERENCES locations(tenant_id,id) ON DELETE CASCADE
);
ALTER TABLE resources ADD COLUMN location_id uuid;
ALTER TABLE resources ADD CONSTRAINT resources_location_fk FOREIGN KEY(tenant_id,location_id) REFERENCES locations(tenant_id,id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN location_id uuid;
ALTER TABLE bookings ADD CONSTRAINT bookings_location_fk FOREIGN KEY(tenant_id,location_id) REFERENCES locations(tenant_id,id) ON DELETE SET NULL;
CREATE INDEX staff_locations_location_idx ON staff_locations(tenant_id,location_id,staff_id);
CREATE INDEX service_locations_location_idx ON service_locations(tenant_id,location_id,service_id);
CREATE INDEX resources_tenant_location_idx ON resources(tenant_id,location_id,active,sort_order);
CREATE INDEX bookings_tenant_location_start_idx ON bookings(tenant_id,location_id,starts_at);
