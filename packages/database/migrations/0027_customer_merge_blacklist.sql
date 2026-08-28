ALTER TABLE customers ADD COLUMN blacklisted boolean NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN blacklist_reason text;
ALTER TABLE customers ADD COLUMN blacklisted_at timestamptz;
ALTER TABLE customers ADD COLUMN merged_into_customer_id uuid;
ALTER TABLE customers ADD COLUMN merged_at timestamptz;
CREATE INDEX customers_tenant_blacklisted_idx ON customers(tenant_id,blacklisted) WHERE blacklisted=true;
CREATE TABLE customer_merge_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 source_customer_id uuid NOT NULL,target_customer_id uuid NOT NULL,actor_user_id text,detail jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,source_customer_id) REFERENCES customers(tenant_id,id),FOREIGN KEY(tenant_id,target_customer_id) REFERENCES customers(tenant_id,id)
);
CREATE INDEX customer_merge_history_target_idx ON customer_merge_history(tenant_id,target_customer_id,created_at DESC);
