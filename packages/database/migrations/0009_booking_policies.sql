CREATE TABLE booking_policies (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  booking_horizon_days integer NOT NULL DEFAULT 90 CHECK (booking_horizon_days BETWEEN 1 AND 730),
  slot_interval_minutes integer NOT NULL DEFAULT 15 CHECK (slot_interval_minutes BETWEEN 5 AND 720 AND slot_interval_minutes % 5 = 0),
  minimum_lead_minutes integer NOT NULL DEFAULT 60 CHECK (minimum_lead_minutes BETWEEN 0 AND 10080),
  same_day_cutoff_minute integer CHECK (same_day_cutoff_minute BETWEEN 0 AND 1439),
  cancellation_deadline_minutes integer NOT NULL DEFAULT 120 CHECK (cancellation_deadline_minutes BETWEEN 0 AND 43200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE booking_policies IS 'Tenant booking window, slot, lead-time, same-day cutoff and cancellation rules.';
