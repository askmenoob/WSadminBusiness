DO $$ BEGIN CREATE TYPE wsb_whatsapp_booking_state AS ENUM ('AWAIT_LOCATION','AWAIT_SERVICE','AWAIT_DATE','AWAIT_SLOT','AWAIT_CONFIRM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE wsb_outbound_status AS ENUM ('PENDING','SENDING','SENT','DELIVERED','READ','FAILED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE whatsapp_booking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,location_id uuid,service_id uuid,state wsb_whatsapp_booking_state NOT NULL,
  local_date date,slot_options jsonb NOT NULL DEFAULT '[]'::jsonb,selected_starts_at timestamptz,expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,conversation_id),
  FOREIGN KEY(tenant_id,conversation_id) REFERENCES whatsapp_conversations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,location_id) REFERENCES locations(tenant_id,id) ON DELETE SET NULL,
  FOREIGN KEY(tenant_id,service_id) REFERENCES services(tenant_id,id) ON DELETE SET NULL
);
CREATE TABLE whatsapp_outbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,conversation_id uuid NOT NULL,to_jid text NOT NULL,text_content text NOT NULL,
  idempotency_key text NOT NULL,status wsb_outbound_status NOT NULL DEFAULT 'PENDING',attempt_count integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,
  UNIQUE(tenant_id,idempotency_key),FOREIGN KEY(tenant_id,conversation_id) REFERENCES whatsapp_conversations(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX whatsapp_outbound_pending_idx ON whatsapp_outbound_messages(status,next_attempt_at) WHERE status IN ('PENDING','FAILED');
