DO $$ BEGIN
  CREATE TYPE wsb_booking_status AS ENUM ('PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE customers ADD CONSTRAINT customers_tenant_id_id_unique UNIQUE (tenant_id,id);
CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid,
  service_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  resource_id uuid,
  status wsb_booking_status NOT NULL DEFAULT 'CONFIRMED',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  effective_starts_at timestamptz NOT NULL,
  effective_ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  CHECK (effective_starts_at <= starts_at AND effective_ends_at >= ends_at AND effective_starts_at < effective_ends_at),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES customers(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id,service_id) REFERENCES services(tenant_id,id),
  FOREIGN KEY (tenant_id,staff_id) REFERENCES staff_profiles(tenant_id,id),
  FOREIGN KEY (tenant_id,resource_id) REFERENCES resources(tenant_id,id)
);
CREATE INDEX bookings_staff_overlap_idx ON bookings(tenant_id,staff_id,effective_starts_at,effective_ends_at) WHERE status IN ('PENDING','CONFIRMED');
CREATE INDEX bookings_resource_overlap_idx ON bookings(tenant_id,resource_id,effective_starts_at,effective_ends_at) WHERE resource_id IS NOT NULL AND status IN ('PENDING','CONFIRMED');
CREATE INDEX bookings_customer_time_idx ON bookings(tenant_id,customer_id,starts_at DESC);
COMMENT ON TABLE bookings IS 'Availability foundation. Booking creation/lifecycle/concurrency is completed in P1-08/P1-09.';
