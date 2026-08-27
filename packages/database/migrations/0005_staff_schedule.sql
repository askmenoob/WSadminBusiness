CREATE TABLE staff_working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute integer NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_minute < end_minute),
  FOREIGN KEY (tenant_id,staff_id) REFERENCES staff_profiles(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX staff_working_hours_lookup_idx ON staff_working_hours(tenant_id,staff_id,weekday,start_minute);
CREATE TABLE staff_shift_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  local_date date NOT NULL,
  start_minute integer,
  end_minute integer,
  is_off boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,staff_id) REFERENCES staff_profiles(tenant_id,id) ON DELETE CASCADE,
  CHECK ((is_off AND start_minute IS NULL AND end_minute IS NULL) OR (NOT is_off AND start_minute >= 0 AND end_minute <= 1440 AND start_minute < end_minute))
);
CREATE INDEX staff_shift_overrides_lookup_idx ON staff_shift_overrides(tenant_id,staff_id,local_date);
CREATE TYPE wsb_staff_time_block_type AS ENUM ('LEAVE','BLOCKED');
CREATE TABLE staff_time_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  type wsb_staff_time_block_type NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  FOREIGN KEY (tenant_id,staff_id) REFERENCES staff_profiles(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX staff_time_blocks_lookup_idx ON staff_time_blocks(tenant_id,staff_id,starts_at,ends_at);
