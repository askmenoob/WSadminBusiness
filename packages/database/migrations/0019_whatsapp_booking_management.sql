DO $$ BEGIN CREATE TYPE wsb_whatsapp_manage_state AS ENUM ('AWAIT_BOOKING','AWAIT_ACTION','AWAIT_RESCHEDULE_DATE','AWAIT_RESCHEDULE_SLOT','AWAIT_CANCEL_CONFIRM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE whatsapp_booking_management_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,state wsb_whatsapp_manage_state NOT NULL,requested_action text CHECK(requested_action IN ('RESCHEDULE','CANCEL')),
  booking_options jsonb NOT NULL DEFAULT '[]'::jsonb,booking_id uuid,local_date date,slot_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,conversation_id),FOREIGN KEY(tenant_id,conversation_id) REFERENCES whatsapp_conversations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,booking_id) REFERENCES bookings(tenant_id,id) ON DELETE SET NULL
);
