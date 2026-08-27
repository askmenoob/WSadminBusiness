CREATE TABLE whatsapp_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK(provider IN ('EVOLUTION','META_CLOUD')),
  provider_instance_name text NOT NULL,
  provider_event_key text NOT NULL,
  event_name text NOT NULL,
  occurred_at timestamptz,
  normalized_payload jsonb NOT NULL,
  raw_payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider,provider_instance_name,provider_event_key)
);
CREATE INDEX whatsapp_provider_events_tenant_received_idx ON whatsapp_provider_events(tenant_id,received_at DESC);
CREATE INDEX whatsapp_provider_events_instance_received_idx ON whatsapp_provider_events(instance_id,received_at DESC);
