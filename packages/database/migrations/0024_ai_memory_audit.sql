CREATE TABLE ai_conversation_memory (
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,conversation_id uuid NOT NULL,
 summary text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,conversation_id),
 FOREIGN KEY(tenant_id,conversation_id) REFERENCES whatsapp_conversations(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE ai_action_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,conversation_id uuid NOT NULL,
 event_key text,intent text NOT NULL,confidence numeric(5,4) NOT NULL CHECK(confidence>=0 AND confidence<=1),action text NOT NULL CHECK(action IN('EXECUTE','CLARIFY','HANDOFF')),
 reason text NOT NULL,tool_result jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,conversation_id) REFERENCES whatsapp_conversations(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX ai_action_audit_conversation_idx ON ai_action_audit(tenant_id,conversation_id,created_at DESC);
