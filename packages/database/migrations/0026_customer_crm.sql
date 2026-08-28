CREATE TABLE customer_tags (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX customer_tags_tenant_name_unique ON customer_tags(tenant_id,lower(name));
CREATE TABLE customer_tag_links (
 tenant_id uuid NOT NULL,customer_id uuid NOT NULL,tag_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,customer_id,tag_id),FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,tag_id) REFERENCES customer_tags(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE customer_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,customer_id uuid NOT NULL,actor_user_id text,note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX customer_notes_customer_idx ON customer_notes(tenant_id,customer_id,created_at DESC);
CREATE TABLE customer_custom_field_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 key text NOT NULL,label text NOT NULL,field_type text NOT NULL DEFAULT 'TEXT' CHECK(field_type IN('TEXT','NUMBER','BOOLEAN','DATE','JSON')),
 active boolean NOT NULL DEFAULT true,sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),UNIQUE(tenant_id,key)
);
CREATE TABLE customer_custom_field_values (
 tenant_id uuid NOT NULL,customer_id uuid NOT NULL,definition_id uuid NOT NULL,value jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,customer_id,definition_id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,definition_id) REFERENCES customer_custom_field_definitions(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE customer_activity_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,customer_id uuid NOT NULL,
 event_type text NOT NULL,source_type text NOT NULL DEFAULT 'SYSTEM',source_id text,title text NOT NULL,detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX customer_activity_events_customer_time_idx ON customer_activity_events(tenant_id,customer_id,occurred_at DESC,id DESC);
