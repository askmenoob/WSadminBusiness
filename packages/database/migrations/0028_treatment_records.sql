DO $$ BEGIN CREATE TYPE wsb_treatment_status AS ENUM ('DRAFT','FINAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE wsb_treatment_media_kind AS ENUM ('PHOTO','VIDEO','SKETCH','DOCUMENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE treatment_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,customer_id uuid NOT NULL,booking_id uuid,staff_id uuid,service_id uuid,
 occurred_at timestamptz NOT NULL DEFAULT now(),summary text NOT NULL,notes text,status wsb_treatment_status NOT NULL DEFAULT 'FINAL',created_by_user_id text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id) ON DELETE CASCADE,FOREIGN KEY(tenant_id,booking_id) REFERENCES bookings(tenant_id,id) ON DELETE SET NULL,
 FOREIGN KEY(tenant_id,staff_id) REFERENCES staff_profiles(tenant_id,id) ON DELETE SET NULL,FOREIGN KEY(tenant_id,service_id) REFERENCES services(tenant_id,id) ON DELETE SET NULL
);
CREATE INDEX treatment_records_customer_time_idx ON treatment_records(tenant_id,customer_id,occurred_at DESC,id DESC);
CREATE TABLE treatment_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,treatment_record_id uuid NOT NULL,media_kind wsb_treatment_media_kind NOT NULL,storage_ref text NOT NULL,caption text,customer_visible boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,treatment_record_id) REFERENCES treatment_records(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX treatment_media_record_idx ON treatment_media(tenant_id,treatment_record_id,created_at,id);
