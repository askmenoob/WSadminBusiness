CREATE TABLE whatsapp_outbound_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 instance_id uuid NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,conversation_id uuid,
 provider text NOT NULL CHECK(provider IN('EVOLUTION','META_CLOUD')),provider_instance_name text NOT NULL,to_e164 text NOT NULL,text_content text NOT NULL,idempotency_key text NOT NULL,
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN('QUEUED','SENDING','RETRY','RATE_LIMITED','SENT','FAILED')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),max_attempts integer NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 10),next_attempt_at timestamptz NOT NULL DEFAULT now(),
 provider_message_id text,last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key),FOREIGN KEY(tenant_id,conversation_id) REFERENCES whatsapp_conversations(tenant_id,id) ON DELETE SET NULL
);
CREATE INDEX whatsapp_outbound_delivery_due_idx ON whatsapp_outbound_deliveries(status,next_attempt_at) WHERE status IN('QUEUED','RETRY','RATE_LIMITED');
