DO $$ BEGIN CREATE TYPE wsb_conversation_status AS ENUM ('OPEN','HUMAN','BOT_PAUSED','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE wsb_message_direction AS ENUM ('INBOUND','OUTBOUND'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE whatsapp_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 instance_id uuid NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,customer_id uuid,channel text NOT NULL DEFAULT 'WHATSAPP' CHECK(channel='WHATSAPP'),
 remote_jid text NOT NULL,contact_e164 text,display_name text,status wsb_conversation_status NOT NULL DEFAULT 'OPEN',unread_count integer NOT NULL DEFAULT 0 CHECK(unread_count>=0),
 last_message_at timestamptz,last_message_preview text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,instance_id,remote_jid),FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id) ON DELETE SET NULL
);
CREATE INDEX whatsapp_conversations_tenant_last_idx ON whatsapp_conversations(tenant_id,last_message_at DESC NULLS LAST);
ALTER TABLE whatsapp_conversations ADD CONSTRAINT whatsapp_conversations_tenant_id_id_unique UNIQUE(tenant_id,id);
CREATE TABLE whatsapp_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL,provider_event_id uuid NOT NULL REFERENCES whatsapp_provider_events(id) ON DELETE CASCADE,provider_message_id text,
 direction wsb_message_direction NOT NULL,sender_jid text,message_type text,text_content text,occurred_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'RECEIVED',
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,provider_event_id),FOREIGN KEY(tenant_id,conversation_id) REFERENCES whatsapp_conversations(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX whatsapp_messages_conversation_time_idx ON whatsapp_messages(tenant_id,conversation_id,occurred_at DESC,id DESC);
