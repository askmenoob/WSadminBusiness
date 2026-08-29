import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GroundedFaqService,
  buildKnowledgeQuery,
  rankKnowledgeSources,
  type AiKnowledgeRepository,
  type FaqEntry,
  type KnowledgeSource,
  type UnansweredKnowledgeQuestion,
} from './knowledge.js';

const now = new Date('2026-08-29T00:00:00.000Z');

class Repo implements AiKnowledgeRepository {
  sources: KnowledgeSource[] = [{
    id: 'service:tenant-a:s1',
    type: 'SERVICE',
    title: 'Facial',
    content: 'Price RM120.00, duration 60 minutes.',
  }];
  unanswered: string[] = [];

  async search() { return this.sources; }
  async createFaq(tenantId: string, input: { question: string; answer: string }): Promise<FaqEntry> {
    return { id: 'f', tenantId, question: input.question, answer: input.answer, active: true, sortOrder: 0, createdAt: now, updatedAt: now };
  }
  async listFaq() { return []; }
  async updateFaq() { return null; }
  async recordUnanswered(tenantId: string, question: string): Promise<UnansweredKnowledgeQuestion> {
    this.unanswered.push(`${tenantId}:${question}`);
    return { id: 'u1', tenantId, question, normalizedQuestion: question.toLowerCase(), occurrenceCount: 1, status: 'OPEN', firstAskedAt: now, lastAskedAt: now, resolvedAt: null, resolvedByFaqId: null };
  }
  async listUnanswered() { return []; }
  async teachUnanswered() { return null; }
}

test('natural customer wording produces useful search terms and topics', () => {
  const query = buildKnowledgeQuery('Berapa harga untuk facial premium?');
  assert.equal(query.normalized, 'berapa harga untuk facial premium');
  assert.deepEqual(query.terms, ['harga', 'facial', 'premium']);
  assert.deepEqual(query.topics, ['PRICE']);
});

test('source ranking prefers the named service over broad price candidates', () => {
  const plan = buildKnowledgeQuery('Berapa harga facial?');
  const rows: KnowledgeSource[] = [
    { id: 'service:massage', type: 'SERVICE', title: 'Massage', content: 'Price RM90.00.' },
    { id: 'service:facial', type: 'SERVICE', title: 'Facial', content: 'Price RM120.00.' },
  ];
  assert.equal(rankKnowledgeSources(rows, plan, 2)[0]?.id, 'service:facial');
});

test('tenant business context is always included to prevent cross-industry answers',()=>{const plan=buildKnowledgeQuery('soalan umum');const rows:KnowledgeSource[]=[{id:'business:b1',type:'BUSINESS_CONTEXT',title:'Villa Mawar business context',content:'Homestay booking assistant. Never use salon terminology.'},{id:'service:s1',type:'SERVICE',title:'Facial',content:'Price RM120.'}];assert.deepEqual(rankKnowledgeSources(rows,plan,8).map(row=>row.id),['business:b1']);});

test('grounded FAQ returns answer with source traceability', async () => {
  const router = { async generate(input: any) { assert.match(input.messages[1].content, /RM120/); return { text: 'Harga Facial ialah RM120.00.' }; } };
  const out = await new GroundedFaqService(router as any, new Repo()).answer('tenant-a', 'berapa harga facial?');
  assert.equal(out?.answer, 'Harga Facial ialah RM120.00.');
  assert.deepEqual(out?.sources, ['service:tenant-a:s1']);
});

test('ungrounded questions are recorded once for owner training and handed off', async () => {
  const repo = new Repo();
  repo.sources = [];
  const router = { async generate() { throw new Error('must not call the model without approved context'); } };
  const out = await new GroundedFaqService(router as any, repo).answer('tenant-a', 'Ada servis untuk arnab?');
  assert.equal(out, null);
  assert.deepEqual(repo.unanswered, ['tenant-a:Ada servis untuk arnab?']);
});
