import type { AiRouter } from './router.js';

export type KnowledgeSourceType = 'FAQ' | 'SERVICE' | 'STAFF' | 'RESOURCE' | 'LOCATION' | 'BOOKING_POLICY';
export type KnowledgeTopic = 'PRICE' | 'SERVICE' | 'LOCATION' | 'STAFF' | 'RESOURCE' | 'HOURS' | 'POLICY';
export type KnowledgeSource = { id: string; type: KnowledgeSourceType; title: string; content: string };
export type KnowledgeQuery = { normalized: string; terms: string[]; topics: KnowledgeTopic[] };
export type FaqEntry = { id: string; tenantId: string; question: string; answer: string; active: boolean; sortOrder: number; createdAt: Date; updatedAt: Date };
export type UnansweredKnowledgeQuestion = {
  id: string;
  tenantId: string;
  question: string;
  normalizedQuestion: string;
  occurrenceCount: number;
  status: 'OPEN' | 'RESOLVED';
  firstAskedAt: Date;
  lastAskedAt: Date;
  resolvedAt: Date | null;
  resolvedByFaqId: string | null;
};

export interface AiKnowledgeRepository {
  search(tenantId: string, query: string, limit?: number): Promise<KnowledgeSource[]>;
  createFaq(tenantId: string, input: { question: string; answer: string; active?: boolean; sortOrder?: number }): Promise<FaqEntry>;
  listFaq(tenantId: string, includeInactive?: boolean): Promise<FaqEntry[]>;
  updateFaq(tenantId: string, id: string, input: Partial<{ question: string; answer: string; active: boolean; sortOrder: number }>): Promise<FaqEntry | null>;
  recordUnanswered(tenantId: string, question: string): Promise<UnansweredKnowledgeQuestion>;
  listUnanswered(tenantId: string, includeResolved?: boolean): Promise<UnansweredKnowledgeQuestion[]>;
  teachUnanswered(tenantId: string, id: string, input: { question?: string; answer: string }): Promise<{ faq: FaqEntry; unanswered: UnansweredKnowledgeQuestion } | null>;
}

export class KnowledgeValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'KnowledgeValidationError'; }
}

const stopWords = new Set([
  'ada', 'adakah', 'apa', 'awak', 'boleh', 'dalam', 'dan', 'di', 'ini', 'itu', 'kah', 'ke', 'mahu', 'nak', 'saya', 'tak', 'tidak', 'tolong', 'untuk', 'yang',
  'a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'have', 'i', 'in', 'is', 'me', 'of', 'please', 'the', 'this', 'to', 'what', 'with', 'you',
  'berapa', 'how', 'much',
]);

const topicTerms: Record<KnowledgeTopic, Set<string>> = {
  PRICE: new Set(['harga', 'price', 'cost', 'fee', 'bayaran', 'rm', 'mahal', 'murah', 'berapa']),
  SERVICE: new Set(['servis', 'service', 'services', 'rawatan', 'treatment', 'treatments', 'pakej', 'package']),
  LOCATION: new Set(['lokasi', 'location', 'cawangan', 'branch', 'alamat', 'address', 'parking', 'parkir']),
  STAFF: new Set(['staff', 'staf', 'therapist', 'terapis', 'doktor', 'doctor', 'pekerja', 'worker']),
  RESOURCE: new Set(['resource', 'bilik', 'room', 'kerusi', 'chair', 'equipment', 'alat', 'vehicle', 'kenderaan']),
  HOURS: new Set(['buka', 'tutup', 'operasi', 'waktu', 'jam', 'hours', 'open', 'close', 'working']),
  POLICY: new Set(['batal', 'cancel', 'cancellation', 'refund', 'deposit', 'tukar', 'reschedule', 'polisi', 'policy', 'lewat', 'late', 'cutoff', 'awal', 'lead', 'booking', 'tempahan']),
};

export function normalizeKnowledgeQuestion(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ').slice(0, 500);
}

export function buildKnowledgeQuery(value: string): KnowledgeQuery {
  const normalized = normalizeKnowledgeQuestion(value);
  const tokens = normalized.split(' ').filter(Boolean);
  const terms = [...new Set(tokens.filter(token => token.length >= 2 && !stopWords.has(token)))].slice(0, 12);
  const topics = (Object.keys(topicTerms) as KnowledgeTopic[]).filter(topic => tokens.some(token => topicTerms[topic].has(token)));
  return { normalized, terms: terms.length ? terms : [...new Set(tokens)].slice(0, 4), topics };
}

const sourceTopics: Record<KnowledgeSourceType, KnowledgeTopic[]> = {
  FAQ: [],
  SERVICE: ['PRICE', 'SERVICE'],
  STAFF: ['STAFF', 'HOURS'],
  RESOURCE: ['RESOURCE'],
  LOCATION: ['LOCATION'],
  BOOKING_POLICY: ['POLICY'],
};

export function rankKnowledgeSources(sources: KnowledgeSource[], query: KnowledgeQuery, limit = 8) {
  const ranked = new Map<string, { source: KnowledgeSource; score: number }>();
  for (const source of sources) {
    const title = normalizeKnowledgeQuestion(source.title);
    const content = normalizeKnowledgeQuestion(source.content);
    let score = sourceTopics[source.type].some(topic => query.topics.includes(topic)) ? 3 : 0;
    for (const term of query.terms) {
      if (title.includes(term)) score += 8;
      if (content.includes(term)) score += 2;
    }
    if (!score) continue;
    const existing = ranked.get(source.id);
    if (!existing || score > existing.score) ranked.set(source.id, { source, score });
  }
  return [...ranked.values()]
    .sort((a, b) => b.score - a.score || a.source.title.localeCompare(b.source.title))
    .slice(0, Math.max(1, Math.min(limit, 20)))
    .map(row => row.source);
}

export class GroundedFaqService {
  constructor(private readonly router: Pick<AiRouter, 'generate'>, private readonly repo: AiKnowledgeRepository) {}

  async answer(tenantId: string, question: string, conversationId?: string | null) {
    const q = question.trim().slice(0, 2000);
    if (!q) throw new KnowledgeValidationError('question required');
    const sources = await this.repo.search(tenantId, q, 8);
    if (!sources.length) {
      await this.repo.recordUnanswered(tenantId, q);
      return null;
    }
    const context = sources.map((source, index) => `[${index + 1}] ${source.type} ${source.title}\n${source.content}`).join('\n\n');
    const result = await this.router.generate({
      tenantId,
      conversationId,
      operation: 'grounded_faq',
      messages: [
        { role: 'system', content: 'Answer only from the supplied tenant-approved context. Do not invent facts. If the context does not answer the question, say human help is needed. Keep the answer concise and use the customer language.' },
        { role: 'user', content: `Question: ${q}\n\nContext:\n${context}` },
      ],
    });
    const answer = result.text.trim();
    if (!answer) {
      await this.repo.recordUnanswered(tenantId, q);
      return null;
    }
    return { answer, sources: sources.map(source => source.id) };
  }
}
