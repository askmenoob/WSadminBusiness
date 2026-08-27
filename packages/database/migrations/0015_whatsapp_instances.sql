DO $$ BEGIN
 CREATE TYPE wsb_whatsapp_status AS ENUM ('DISCONNECTED','PAIRING','CONNECTED','ERROR','DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE whatsapp_instances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 provider text NOT NULL DEFAULT 'EVOLUTION' CHECK(provider IN ('EVOLUTION','META_CLOUD')),
 provider_instance_name text NOT NULL,
 display_name text NOT NULL DEFAULT 'WSadmin',
 phone_e164 text,
 status wsb_whatsapp_status NOT NULL DEFAULT 'DISCONNECTED',
 qr_expires_at timestamptz,
 last_connected_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id),
 UNIQUE(provider,provider_instance_name)
);
CREATE TABLE whatsapp_instance_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 instance_id uuid NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,event_type text NOT NULL,status wsb_whatsapp_status,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_instance_events_instance_idx ON whatsapp_instance_events(tenant_id,instance_id,created_at DESC);
