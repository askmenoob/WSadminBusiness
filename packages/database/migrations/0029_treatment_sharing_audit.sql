CREATE TABLE treatment_share_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,treatment_record_id uuid NOT NULL,token_hash char(64) NOT NULL UNIQUE,include_notes boolean NOT NULL DEFAULT false,expires_at timestamptz NOT NULL,revoked_at timestamptz,created_by_user_id text,created_at timestamptz NOT NULL DEFAULT now(),last_accessed_at timestamptz,
 FOREIGN KEY(tenant_id,treatment_record_id) REFERENCES treatment_records(tenant_id,id) ON DELETE CASCADE,UNIQUE(tenant_id,id)
);
CREATE INDEX treatment_share_record_idx ON treatment_share_links(tenant_id,treatment_record_id,created_at DESC);
CREATE TABLE treatment_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,treatment_record_id uuid NOT NULL,share_id uuid,actor_user_id text,event_type text NOT NULL,detail jsonb NOT NULL DEFAULT '{}'::jsonb,occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,treatment_record_id) REFERENCES treatment_records(tenant_id,id) ON DELETE CASCADE,FOREIGN KEY(share_id) REFERENCES treatment_share_links(id) ON DELETE SET NULL
);
CREATE INDEX treatment_audit_record_idx ON treatment_audit_events(tenant_id,treatment_record_id,occurred_at DESC,id DESC);
