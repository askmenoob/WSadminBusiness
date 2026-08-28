CREATE TABLE ai_unanswered_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  normalized_question text NOT NULL,
  example_question text NOT NULL,
  occurrence_count integer NOT NULL DEFAULT 1 CHECK(occurrence_count > 0),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED')),
  first_asked_at timestamptz NOT NULL DEFAULT now(),
  last_asked_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_faq_id uuid,
  UNIQUE(tenant_id,normalized_question),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,resolved_by_faq_id) REFERENCES ai_faq_entries(tenant_id,id)
);
CREATE INDEX ai_unanswered_questions_training_idx ON ai_unanswered_questions(tenant_id,status,occurrence_count DESC,last_asked_at DESC);
