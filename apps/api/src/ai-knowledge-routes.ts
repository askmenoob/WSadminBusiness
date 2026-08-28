import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AccessDeniedError, ROLES, authorize, type Actor, type Role } from '@wsadmin-business/auth';
import { KnowledgeValidationError, type AiKnowledgeRepository } from '@wsadmin-business/ai';

function actor(request: FastifyRequest): Actor | null {
  const role = String(request.headers['x-wsadmin-role'] ?? '') as Role;
  if (!ROLES.includes(role)) return null;
  const tenantId = String(request.headers['x-wsadmin-tenant-id'] ?? '');
  return { userId: String(request.headers['x-wsadmin-user-id'] ?? 'u'), role, ...(tenantId ? { tenantId } : {}) };
}

function guard(request: FastifyRequest, reply: FastifyReply, tenantId: string, write = false) {
  const current = actor(request);
  if (!current) { reply.code(401).send({ error: 'authentication_required' }); return false; }
  try { authorize(current, tenantId, write ? 'SETTINGS_WRITE' : 'TENANT_READ'); return true; }
  catch (error) {
    if (error instanceof AccessDeniedError) { reply.code(403).send({ error: 'access_denied' }); return false; }
    throw error;
  }
}

async function knowledgeAction<T>(reply: FastifyReply, action: () => Promise<T>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof KnowledgeValidationError) return reply.code(400).send({ error: 'knowledge_validation', message: error.message });
    throw error;
  }
}

export function registerAiKnowledgeRoutes(app: FastifyInstance, repo: AiKnowledgeRepository) {
  app.get('/api/v1/tenants/:tenantId/ai/knowledge/faqs', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    if (!guard(request, reply, tenantId)) return reply;
    return repo.listFaq(tenantId, (request.query as any)?.includeInactive === 'true');
  });
  app.post('/api/v1/tenants/:tenantId/ai/knowledge/faqs', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    if (!guard(request, reply, tenantId, true)) return reply;
    const row = await knowledgeAction(reply, () => repo.createFaq(tenantId, (request.body ?? {}) as any));
    return reply.sent ? reply : reply.code(201).send(row);
  });
  app.patch('/api/v1/tenants/:tenantId/ai/knowledge/faqs/:id', async (request, reply) => {
    const { tenantId, id } = request.params as { tenantId: string; id: string };
    if (!guard(request, reply, tenantId, true)) return reply;
    const row = await knowledgeAction(reply, () => repo.updateFaq(tenantId, id, (request.body ?? {}) as any));
    if (reply.sent) return reply;
    return row ?? reply.code(404).send({ error: 'faq_not_found' });
  });
  app.get('/api/v1/tenants/:tenantId/ai/knowledge/sources', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    if (!guard(request, reply, tenantId)) return reply;
    const query = String((request.query as any)?.q ?? '').trim().slice(0, 2000);
    if (!query) return reply.code(400).send({ error: 'knowledge_validation', message: 'query required' });
    return { query, sources: await repo.search(tenantId, query, 12) };
  });
  app.get('/api/v1/tenants/:tenantId/ai/knowledge/unanswered', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    if (!guard(request, reply, tenantId)) return reply;
    return repo.listUnanswered(tenantId, (request.query as any)?.includeResolved === 'true');
  });
  app.post('/api/v1/tenants/:tenantId/ai/knowledge/unanswered/:id/teach', async (request, reply) => {
    const { tenantId, id } = request.params as { tenantId: string; id: string };
    if (!guard(request, reply, tenantId, true)) return reply;
    const row = await knowledgeAction(reply, () => repo.teachUnanswered(tenantId, id, (request.body ?? {}) as any));
    if (reply.sent) return reply;
    return row ? reply.code(201).send(row) : reply.code(404).send({ error: 'unanswered_question_not_found' });
  });
}
