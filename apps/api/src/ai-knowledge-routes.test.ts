import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAiKnowledgeRoutes } from './ai-knowledge-routes.js';

class Repo {
  rows: any[] = [];
  unanswered = [{ id: 'u1', tenantId: 't1', question: 'Ada parking?', normalizedQuestion: 'ada parking', occurrenceCount: 2, status: 'OPEN', firstAskedAt: new Date(), lastAskedAt: new Date(), resolvedAt: null, resolvedByFaqId: null }];
  async search(tenantId: string, query: string) { return [{ id: `service:${tenantId}:s1`, type: 'SERVICE', title: 'Facial', content: `Matched ${query}` }]; }
  async createFaq(tenantId: string, input: any) { const row = { id: 'f1', tenantId, question: input.question, answer: input.answer, active: input.active ?? true, sortOrder: input.sortOrder ?? 0, createdAt: new Date(), updatedAt: new Date() }; this.rows.push(row); return row; }
  async listFaq(tenantId: string) { return this.rows.filter(row => row.tenantId === tenantId); }
  async updateFaq() { return null; }
  async recordUnanswered() { return this.unanswered[0]; }
  async listUnanswered(tenantId: string) { return this.unanswered.filter(row => row.tenantId === tenantId); }
  async teachUnanswered(tenantId: string, id: string, input: any) {
    const row = this.unanswered.find(item => item.tenantId === tenantId && item.id === id);
    if (!row) return null;
    const faq = await this.createFaq(tenantId, { question: input.question ?? row.question, answer: input.answer });
    return { faq, unanswered: { ...row, status: 'RESOLVED', resolvedAt: new Date(), resolvedByFaqId: faq.id } };
  }
}

const ownerHeaders = { 'x-wsadmin-role': 'TENANT_OWNER', 'x-wsadmin-tenant-id': 't1' };

test('tenant FAQ knowledge is writable only inside tenant', async () => {
  const app = Fastify();
  registerAiKnowledgeRoutes(app, new Repo() as any);
  let response = await app.inject({ method: 'POST', url: '/api/v1/tenants/t1/ai/knowledge/faqs', headers: ownerHeaders, payload: { question: 'Parking?', answer: 'Level B2' } });
  assert.equal(response.statusCode, 201);
  response = await app.inject({ method: 'POST', url: '/api/v1/tenants/t2/ai/knowledge/faqs', headers: ownerHeaders, payload: { question: 'x', answer: 'y' } });
  assert.equal(response.statusCode, 403);
  await app.close();
});

test('owner can inspect grounded sources without calling the model', async () => {
  const app = Fastify();
  registerAiKnowledgeRoutes(app, new Repo() as any);
  const response = await app.inject({ method: 'GET', url: '/api/v1/tenants/t1/ai/knowledge/sources?q=berapa%20harga%20facial', headers: ownerHeaders });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().sources[0].title, 'Facial');
  assert.equal(response.json().query, 'berapa harga facial');
  await app.close();
});

test('owner can turn an unanswered question into an approved FAQ', async () => {
  const app = Fastify();
  registerAiKnowledgeRoutes(app, new Repo() as any);
  const list = await app.inject({ method: 'GET', url: '/api/v1/tenants/t1/ai/knowledge/unanswered', headers: ownerHeaders });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json()[0].occurrenceCount, 2);
  const taught = await app.inject({ method: 'POST', url: '/api/v1/tenants/t1/ai/knowledge/unanswered/u1/teach', headers: ownerHeaders, payload: { answer: 'Parking tersedia di aras B2.' } });
  assert.equal(taught.statusCode, 201);
  assert.equal(taught.json().faq.answer, 'Parking tersedia di aras B2.');
  assert.equal(taught.json().unanswered.status, 'RESOLVED');
  await app.close();
});
