import type { Pool, PoolClient } from 'pg';
import {
  KnowledgeValidationError,
  buildKnowledgeQuery,
  normalizeKnowledgeQuestion,
  rankKnowledgeSources,
  type AiKnowledgeRepository,
  type FaqEntry,
  type KnowledgeSource,
  type UnansweredKnowledgeQuestion,
} from '@wsadmin-business/ai';

const faq = (row: any): FaqEntry => ({ id: row.id, tenantId: row.tenant_id, question: row.question, answer: row.answer, active: row.active, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at });
const unanswered = (row: any): UnansweredKnowledgeQuestion => ({ id: row.id, tenantId: row.tenant_id, question: row.example_question, normalizedQuestion: row.normalized_question, occurrenceCount: row.occurrence_count, status: row.status, firstAskedAt: row.first_asked_at, lastAskedAt: row.last_asked_at, resolvedAt: row.resolved_at, resolvedByFaqId: row.resolved_by_faq_id });
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function money(value: number, currency: string) { return currency === 'MYR' ? `RM${(value / 100).toFixed(2)}` : `${currency} ${(value / 100).toFixed(2)}`; }
function time(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
function cleanFaqInput(input: { question?: string; answer?: string }) {
  const question = input.question?.trim().slice(0, 500) ?? '';
  const answer = input.answer?.trim().slice(0, 4000) ?? '';
  if (!question || !answer) throw new KnowledgeValidationError('faq question and answer are required');
  return { question, answer };
}
async function insertFaq(client: Pool | PoolClient, tenantId: string, input: { question: string; answer: string; active?: boolean; sortOrder?: number }) {
  const clean = cleanFaqInput(input);
  const row = await client.query(`INSERT INTO ai_faq_entries(tenant_id,question,answer,active,sort_order) VALUES($1,$2,$3,$4,$5) RETURNING *`, [tenantId, clean.question, clean.answer, input.active ?? true, input.sortOrder ?? 0]);
  return faq(row.rows[0]);
}

export function createAiKnowledgeRepository(pool: Pool): AiKnowledgeRepository {
  return {
    async search(tenantId, question, limit = 8) {
      const query = buildKnowledgeQuery(question);
      if (!query.normalized) return [];
      const terms = query.terms;
      const take = Math.max(1, Math.min(limit, 20));
      const candidateLimit = Math.max(20, take * 4);
      const sources: KnowledgeSource[] = [];

      const faqRows = await pool.query(`
        SELECT * FROM ai_faq_entries f
        WHERE f.tenant_id=$1 AND f.active=true
          AND EXISTS(SELECT 1 FROM unnest($2::text[]) AS term(value) WHERE lower(f.question||' '||f.answer) LIKE '%'||term.value||'%')
        ORDER BY f.sort_order,f.question LIMIT $3`, [tenantId, terms, candidateLimit]);
      for (const row of faqRows.rows) sources.push({ id: `faq:${row.id}`, type: 'FAQ', title: row.question, content: row.answer });

      const broadServices = query.topics.includes('PRICE') || query.topics.includes('SERVICE');
      const serviceRows = await pool.query(`
        SELECT s.*,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('groupName',g.name,'selectionMode',g.selection_mode,'required',g.required,'name',o.name,'priceDeltaMinor',o.price_delta_minor,'durationDeltaMinutes',o.duration_delta_minutes,'requiredResourceType',o.required_resource_type) ORDER BY g.sort_order,o.sort_order,o.name)
            FROM service_option_groups g JOIN service_options o ON o.tenant_id=g.tenant_id AND o.group_id=g.id
            WHERE g.tenant_id=s.tenant_id AND g.service_id=s.id AND g.active=true AND o.active=true),'[]'::jsonb) options
        FROM services s
        WHERE s.tenant_id=$1 AND s.active=true AND ($3::boolean
          OR EXISTS(SELECT 1 FROM unnest($2::text[]) AS term(value) WHERE lower(s.name||' '||coalesce(s.description,'')) LIKE '%'||term.value||'%')
          OR EXISTS(SELECT 1 FROM service_option_groups g JOIN service_options o ON o.tenant_id=g.tenant_id AND o.group_id=g.id, unnest($2::text[]) AS term(value) WHERE g.tenant_id=s.tenant_id AND g.service_id=s.id AND g.active=true AND o.active=true AND lower(g.name||' '||o.name) LIKE '%'||term.value||'%'))
        ORDER BY s.sort_order,s.name LIMIT $4`, [tenantId, terms, broadServices, candidateLimit]);
      for (const row of serviceRows.rows) {
        const options = (row.options as any[]).map(option => `${option.groupName}: ${option.name}${Number(option.priceDeltaMinor) ? ` (+${money(Number(option.priceDeltaMinor), row.currency)})` : ''}${Number(option.durationDeltaMinutes) ? ` (+${option.durationDeltaMinutes} minutes)` : ''}${option.requiredResourceType ? `; requires ${option.requiredResourceType}` : ''}${option.required ? '; required' : ''}`).join('; ');
        sources.push({ id: `service:${row.id}`, type: 'SERVICE', title: row.name, content: `Service ${row.name}. Price ${money(Number(row.price_minor), row.currency)}. Duration ${row.duration_minutes} minutes.${row.description ? ` ${row.description}` : ''}${options ? ` Options: ${options}.` : ''}` });
      }

      const broadStaff = query.topics.includes('STAFF') || query.topics.includes('HOURS');
      const staffRows = await pool.query(`
        SELECT sp.*,
          COALESCE((SELECT jsonb_agg(s.name ORDER BY s.sort_order,s.name) FROM staff_services ss JOIN services s ON s.tenant_id=ss.tenant_id AND s.id=ss.service_id WHERE ss.tenant_id=sp.tenant_id AND ss.staff_id=sp.id AND s.active=true),'[]'::jsonb) services,
          COALESCE((SELECT jsonb_agg(sk.name ORDER BY sk.name) FROM staff_skills ss JOIN skills sk ON sk.tenant_id=ss.tenant_id AND sk.id=ss.skill_id WHERE ss.tenant_id=sp.tenant_id AND ss.staff_id=sp.id),'[]'::jsonb) skills,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('weekday',h.weekday,'startMinute',h.start_minute,'endMinute',h.end_minute) ORDER BY h.weekday,h.start_minute) FROM staff_working_hours h WHERE h.tenant_id=sp.tenant_id AND h.staff_id=sp.id),'[]'::jsonb) hours
        FROM staff_profiles sp
        WHERE sp.tenant_id=$1 AND sp.active=true AND ($3::boolean
          OR EXISTS(SELECT 1 FROM unnest($2::text[]) AS term(value) WHERE lower(sp.display_name) LIKE '%'||term.value||'%')
          OR EXISTS(SELECT 1 FROM staff_services ss JOIN services s ON s.tenant_id=ss.tenant_id AND s.id=ss.service_id, unnest($2::text[]) AS term(value) WHERE ss.tenant_id=sp.tenant_id AND ss.staff_id=sp.id AND s.active=true AND lower(s.name) LIKE '%'||term.value||'%')
          OR EXISTS(SELECT 1 FROM staff_skills ss JOIN skills sk ON sk.tenant_id=ss.tenant_id AND sk.id=ss.skill_id, unnest($2::text[]) AS term(value) WHERE ss.tenant_id=sp.tenant_id AND ss.staff_id=sp.id AND lower(sk.name) LIKE '%'||term.value||'%'))
        ORDER BY sp.sort_order,sp.display_name LIMIT $4`, [tenantId, terms, broadStaff, candidateLimit]);
      for (const row of staffRows.rows) {
        const hours = (row.hours as any[]).map(item => `${weekdays[item.weekday]} ${time(item.startMinute)}-${time(item.endMinute)}`).join(', ');
        sources.push({ id: `staff:${row.id}`, type: 'STAFF', title: row.display_name, content: `Staff ${row.display_name}. Booking capacity ${row.booking_capacity}.${row.services.length ? ` Services: ${row.services.join(', ')}.` : ''}${row.skills.length ? ` Skills: ${row.skills.join(', ')}.` : ''}${hours ? ` Working hours: ${hours}.` : ' Working hours are not configured.'}` });
      }

      const broadResources = query.topics.includes('RESOURCE');
      const resourceRows = await pool.query(`
        SELECT r.*,l.name location_name,
          COALESCE((SELECT jsonb_agg(s.name ORDER BY rs.allocation_priority,s.name) FROM resource_services rs JOIN services s ON s.tenant_id=rs.tenant_id AND s.id=rs.service_id WHERE rs.tenant_id=r.tenant_id AND rs.resource_id=r.id AND s.active=true),'[]'::jsonb) services
        FROM resources r LEFT JOIN locations l ON l.tenant_id=r.tenant_id AND l.id=r.location_id
        WHERE r.tenant_id=$1 AND r.active=true AND ($3::boolean
          OR EXISTS(SELECT 1 FROM unnest($2::text[]) AS term(value) WHERE lower(r.name||' '||r.type::text||' '||coalesce(r.description,'')||' '||coalesce(l.name,'')) LIKE '%'||term.value||'%'))
        ORDER BY r.sort_order,r.name LIMIT $4`, [tenantId, terms, broadResources, candidateLimit]);
      for (const row of resourceRows.rows) sources.push({ id: `resource:${row.id}`, type: 'RESOURCE', title: row.name, content: `Resource ${row.name}. Type ${row.type}. Capacity ${row.capacity}.${row.location_name ? ` Location ${row.location_name}.` : ''}${row.description ? ` ${row.description}` : ''}${row.services.length ? ` Services: ${row.services.join(', ')}.` : ''}` });

      const broadLocations = query.topics.includes('LOCATION');
      const locationRows = await pool.query(`
        SELECT l.*,b.name business_name,
          COALESCE((SELECT jsonb_agg(s.name ORDER BY s.sort_order,s.name) FROM service_locations sl JOIN services s ON s.tenant_id=sl.tenant_id AND s.id=sl.service_id WHERE sl.tenant_id=l.tenant_id AND sl.location_id=l.id AND s.active=true),'[]'::jsonb) services
        FROM locations l JOIN businesses b ON b.tenant_id=l.tenant_id AND b.id=l.business_id
        WHERE l.tenant_id=$1 AND l.active=true AND ($3::boolean
          OR EXISTS(SELECT 1 FROM unnest($2::text[]) AS term(value) WHERE lower(l.name||' '||l.code||' '||coalesce(l.address,'')||' '||b.name) LIKE '%'||term.value||'%'))
        ORDER BY l.sort_order,l.name LIMIT $4`, [tenantId, terms, broadLocations, candidateLimit]);
      for (const row of locationRows.rows) sources.push({ id: `location:${row.id}`, type: 'LOCATION', title: row.name, content: `Location ${row.name} for ${row.business_name}.${row.address ? ` Address ${row.address}.` : ''}${row.timezone ? ` Timezone ${row.timezone}.` : ''}${row.services.length ? ` Services: ${row.services.join(', ')}.` : ''}` });

      if (query.topics.includes('POLICY')) {
        const policyRows = await pool.query('SELECT * FROM booking_policies WHERE tenant_id=$1', [tenantId]);
        if (policyRows.rowCount) {
          const row = policyRows.rows[0];
          sources.push({ id: `policy:${tenantId}`, type: 'BOOKING_POLICY', title: 'Booking policy', content: `Booking horizon ${row.booking_horizon_days} days. Minimum lead ${row.minimum_lead_minutes} minutes. Slot interval ${row.slot_interval_minutes} minutes. Cancellation deadline ${row.cancellation_deadline_minutes} minutes before appointment.${row.same_day_cutoff_minute === null ? '' : ` Same-day cutoff ${time(row.same_day_cutoff_minute)}.`}` });
        }
      }

      return rankKnowledgeSources(sources, query, take);
    },

    async createFaq(tenantId, input) { return insertFaq(pool, tenantId, input); },
    async listFaq(tenantId, includeInactive = false) {
      const rows = await pool.query('SELECT * FROM ai_faq_entries WHERE tenant_id=$1 AND ($2::boolean OR active=true) ORDER BY sort_order,question', [tenantId, includeInactive]);
      return rows.rows.map(faq);
    },
    async updateFaq(tenantId, id, input) {
      const current = await pool.query('SELECT * FROM ai_faq_entries WHERE tenant_id=$1 AND id=$2', [tenantId, id]);
      if (!current.rowCount) return null;
      const row = current.rows[0];
      const question = 'question' in input ? input.question?.trim().slice(0, 500) ?? '' : row.question;
      const answer = 'answer' in input ? input.answer?.trim().slice(0, 4000) ?? '' : row.answer;
      if (!question || !answer) throw new KnowledgeValidationError('faq question and answer are required');
      const updated = await pool.query(`UPDATE ai_faq_entries SET question=$3,answer=$4,active=$5,sort_order=$6,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, id, question, answer, 'active' in input ? input.active : row.active, 'sortOrder' in input ? input.sortOrder : row.sort_order]);
      return faq(updated.rows[0]);
    },
    async recordUnanswered(tenantId, question) {
      const example = question.trim().slice(0, 500);
      const normalized = normalizeKnowledgeQuestion(example);
      if (!normalized) throw new KnowledgeValidationError('question required');
      const row = await pool.query(`
        INSERT INTO ai_unanswered_questions(tenant_id,normalized_question,example_question)
        VALUES($1,$2,$3)
        ON CONFLICT(tenant_id,normalized_question) DO UPDATE SET
          example_question=excluded.example_question,
          occurrence_count=ai_unanswered_questions.occurrence_count+1,
          status='OPEN',last_asked_at=now(),resolved_at=NULL,resolved_by_faq_id=NULL
        RETURNING *`, [tenantId, normalized, example]);
      return unanswered(row.rows[0]);
    },
    async listUnanswered(tenantId, includeResolved = false) {
      const rows = await pool.query(`SELECT * FROM ai_unanswered_questions WHERE tenant_id=$1 AND ($2::boolean OR status='OPEN') ORDER BY (status='OPEN') DESC,occurrence_count DESC,last_asked_at DESC LIMIT 200`, [tenantId, includeResolved]);
      return rows.rows.map(unanswered);
    },
    async teachUnanswered(tenantId, id, input) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(`SELECT * FROM ai_unanswered_questions WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId, id]);
        if (!found.rowCount) { await client.query('ROLLBACK'); return null; }
        const question = input.question?.trim().slice(0, 500) || found.rows[0].example_question;
        const learnedFaq = await insertFaq(client, tenantId, { question, answer: input.answer, active: true });
        const resolved = await client.query(`UPDATE ai_unanswered_questions SET status='RESOLVED',resolved_at=now(),resolved_by_faq_id=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, id, learnedFaq.id]);
        await client.query('COMMIT');
        return { faq: learnedFaq, unanswered: unanswered(resolved.rows[0]) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
  };
}
