CREATE TABLE booking_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  actor_user_id text,
  event_type text NOT NULL,
  from_status wsb_booking_status,
  to_status wsb_booking_status,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,booking_id) REFERENCES bookings(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX booking_audit_events_lookup_idx ON booking_audit_events(tenant_id,booking_id,created_at,id);
COMMENT ON TABLE booking_audit_events IS 'Immutable business audit trail for booking create, reschedule and lifecycle transitions.';
