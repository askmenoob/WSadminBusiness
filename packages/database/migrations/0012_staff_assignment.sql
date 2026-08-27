DO $$ BEGIN
  CREATE TYPE wsb_staff_assignment_mode AS ENUM ('AUTO','REQUESTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE bookings ADD COLUMN assignment_mode wsb_staff_assignment_mode NOT NULL DEFAULT 'AUTO';
CREATE INDEX bookings_tenant_staff_assignment_idx ON bookings(tenant_id,staff_id,assignment_mode,starts_at);
COMMENT ON COLUMN bookings.assignment_mode IS 'AUTO for no-preference allocation; REQUESTED when customer/staff explicitly chose staff.';
