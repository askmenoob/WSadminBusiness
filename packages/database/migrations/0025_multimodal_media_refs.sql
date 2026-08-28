ALTER TABLE whatsapp_messages ADD COLUMN media_kind text CHECK(media_kind IS NULL OR media_kind IN('AUDIO','IMAGE','VIDEO','DOCUMENT'));
ALTER TABLE whatsapp_messages ADD COLUMN media_mime_type text;
ALTER TABLE whatsapp_messages ADD COLUMN media_size_bytes bigint CHECK(media_size_bytes IS NULL OR media_size_bytes>=0);
CREATE INDEX whatsapp_messages_media_idx ON whatsapp_messages(tenant_id,conversation_id,occurred_at DESC) WHERE media_kind IS NOT NULL;
