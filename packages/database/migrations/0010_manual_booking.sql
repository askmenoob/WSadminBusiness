DO $$ BEGIN
  CREATE TYPE wsb_booking_source AS ENUM ('ADMIN','PHONE','WALK_IN','WHATSAPP','WEB','IMPORT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE bookings ADD COLUMN source wsb_booking_source NOT NULL DEFAULT 'ADMIN';
ALTER TABLE bookings ADD COLUMN notes text;
CREATE INDEX bookings_tenant_source_starts_idx ON bookings(tenant_id,source,starts_at);
COMMENT ON COLUMN bookings.source IS 'Origin channel for operational/manual booking and later WhatsApp/web adapters.';
