ALTER TABLE whatsapp_conversations ADD COLUMN ai_intent text;
ALTER TABLE whatsapp_conversations ADD COLUMN ai_confidence numeric(5,4) CHECK(ai_confidence IS NULL OR (ai_confidence>=0 AND ai_confidence<=1));
ALTER TABLE whatsapp_conversations ADD COLUMN ai_action text CHECK(ai_action IS NULL OR ai_action IN('EXECUTE','CLARIFY','HANDOFF'));
ALTER TABLE whatsapp_conversations ADD COLUMN ai_reason text;
ALTER TABLE whatsapp_conversations ADD COLUMN ai_attention_state text NOT NULL DEFAULT 'NONE' CHECK(ai_attention_state IN('NONE','CLARIFICATION','HUMAN'));
ALTER TABLE whatsapp_conversations ADD COLUMN ai_updated_at timestamptz;
CREATE INDEX whatsapp_conversations_ai_attention_idx ON whatsapp_conversations(tenant_id,ai_attention_state,last_message_at DESC NULLS LAST);
