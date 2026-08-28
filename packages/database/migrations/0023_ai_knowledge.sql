CREATE TABLE ai_faq_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 question text NOT NULL,answer text NOT NULL,active boolean NOT NULL DEFAULT true,sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id)
);
CREATE INDEX ai_faq_entries_tenant_active_idx ON ai_faq_entries(tenant_id,active,sort_order);
