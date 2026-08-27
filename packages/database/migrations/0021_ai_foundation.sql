CREATE TABLE ai_tenant_settings (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT true,
 primary_provider text NOT NULL DEFAULT 'GROQ' CHECK(primary_provider IN ('OPENAI','GROQ')),
 primary_model text NOT NULL DEFAULT 'llama-3.3-70b-versatile',
 fallback_provider text CHECK(fallback_provider IS NULL OR fallback_provider IN ('OPENAI','GROQ')),
 fallback_model text,
 timeout_ms integer NOT NULL DEFAULT 12000 CHECK(timeout_ms BETWEEN 1000 AND 120000),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_usage_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 conversation_id uuid, provider text NOT NULL, model text NOT NULL, operation text NOT NULL,
 input_tokens integer NOT NULL DEFAULT 0, output_tokens integer NOT NULL DEFAULT 0, latency_ms integer NOT NULL DEFAULT 0,
 success boolean NOT NULL, error_code text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_logs_tenant_time_idx ON ai_usage_logs(tenant_id,created_at DESC);
