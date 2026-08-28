import { useCallback, useEffect, useState } from 'react';
import {
  tenantGet,
  tenantPatch,
  tenantPost,
  type AiFaqEntry,
  type AiKnowledgeSource,
  type AiKnowledgeSourceResponse,
  type AiUnansweredQuestion,
} from './api';

const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
type FaqDraft = { question: string; answer: string };

export function AIKnowledgeWorkspace() {
  const [faqs, setFaqs] = useState<AiFaqEntry[]>([]);
  const [unanswered, setUnanswered] = useState<AiUnansweredQuestion[]>([]);
  const [drafts, setDrafts] = useState<Record<string, FaqDraft>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [newFaq, setNewFaq] = useState<FaqDraft>({ question: '', answer: '' });
  const [testQuestion, setTestQuestion] = useState('');
  const [sources, setSources] = useState<AiKnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [nextFaqs, nextUnanswered] = await Promise.all([
        tenantGet<AiFaqEntry[]>('/ai/knowledge/faqs?includeInactive=true'),
        tenantGet<AiUnansweredQuestion[]>('/ai/knowledge/unanswered'),
      ]);
      setFaqs(nextFaqs);
      setDrafts(Object.fromEntries(nextFaqs.map(row => [row.id, { question: row.question, answer: row.answer }])));
      setUnanswered(nextUnanswered);
    } catch (caught) { setError(message(caught, 'Unable to load AI knowledge')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createFaq() {
    if (!newFaq.question.trim() || !newFaq.answer.trim()) return;
    setBusy('create'); setError(null);
    try {
      await tenantPost('/ai/knowledge/faqs', newFaq);
      setNewFaq({ question: '', answer: '' });
      setNotice('Approved FAQ added to tenant knowledge');
      await load();
    } catch (caught) { setError(message(caught, 'Unable to create FAQ')); }
    finally { setBusy(null); }
  }

  async function saveFaq(row: AiFaqEntry, active = row.active) {
    const draft = drafts[row.id] ?? { question: row.question, answer: row.answer };
    if (!draft.question.trim() || !draft.answer.trim()) return;
    setBusy(row.id); setError(null);
    try {
      await tenantPatch(`/ai/knowledge/faqs/${row.id}`, { ...draft, active });
      setNotice(active === row.active ? 'FAQ updated' : `FAQ ${active ? 'activated' : 'deactivated'}`);
      await load();
    } catch (caught) { setError(message(caught, 'Unable to update FAQ')); }
    finally { setBusy(null); }
  }

  async function inspectSources() {
    const query = testQuestion.trim();
    if (!query) return;
    setBusy('test'); setError(null); setSources([]);
    try {
      const result = await tenantGet<AiKnowledgeSourceResponse>(`/ai/knowledge/sources?q=${encodeURIComponent(query)}`);
      setSources(result.sources);
      setNotice(result.sources.length ? `${result.sources.length} approved source(s) matched` : 'No approved source matched; AI will hand over and log this question');
    } catch (caught) { setError(message(caught, 'Unable to inspect knowledge sources')); }
    finally { setBusy(null); }
  }

  async function teach(row: AiUnansweredQuestion) {
    const answer = answers[row.id]?.trim();
    if (!answer) return;
    setBusy(row.id); setError(null);
    try {
      await tenantPost(`/ai/knowledge/unanswered/${row.id}/teach`, { answer });
      setAnswers(current => ({ ...current, [row.id]: '' }));
      setNotice('Answer approved and added as a tenant FAQ');
      await load();
    } catch (caught) { setError(message(caught, 'Unable to teach this answer')); }
    finally { setBusy(null); }
  }

  const activeFaqs = faqs.filter(row => row.active).length;
  return <section className="workspace-card knowledge-workspace">
    <div className="section-head"><div><p className="eyebrow">Tenant-approved answers</p><h2>AI Knowledge</h2><p className="muted">Train WSadmin with approved FAQs. Services, options, staff, resources, locations, capacity, working hours and booking policy stay synced from Business Setup.</p></div><span className="settings-status configured">{activeFaqs} active FAQs</span></div>
    {error ? <div className="data-banner error" role="alert"><strong>Knowledge issue</strong><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div> : null}
    {notice ? <div className="data-banner success" role="status"><strong>AI Knowledge</strong><span>{notice}</span><button onClick={() => setNotice(null)}>Dismiss</button></div> : null}
    {loading ? <div className="knowledge-loading">Loading tenant knowledge…</div> : <div className="knowledge-layout">
      <div className="knowledge-column">
        <div className="knowledge-section-head"><div><h3>Approved FAQs</h3><p>Only active answers are available to the customer AI.</p></div><span>{faqs.length} total</span></div>
        <div className="knowledge-create-form">
          <label>Customer question<input value={newFaq.question} onChange={event => setNewFaq({ ...newFaq, question: event.target.value })} placeholder="Contoh: Ada parking?" maxLength={500} /></label>
          <label>Approved answer<textarea value={newFaq.answer} onChange={event => setNewFaq({ ...newFaq, answer: event.target.value })} placeholder="Jawapan yang tepat untuk customer" maxLength={4000} /></label>
          <button className="primary-button" disabled={busy === 'create' || !newFaq.question.trim() || !newFaq.answer.trim()} onClick={() => void createFaq()}>{busy === 'create' ? 'Adding…' : 'Add approved FAQ'}</button>
        </div>
        <div className="knowledge-faq-list">{!faqs.length ? <div className="empty-inline"><strong>No approved FAQs yet</strong><span>Add the questions customers ask most often.</span></div> : faqs.map(row => {
          const draft = drafts[row.id] ?? { question: row.question, answer: row.answer };
          return <article key={row.id} className={row.active ? '' : 'inactive'}>
            <div className="knowledge-row-head"><span className={`ops-status ${row.active ? 'ready' : ''}`}>{row.active ? 'ACTIVE' : 'INACTIVE'}</span><small>Updated {new Intl.DateTimeFormat('en-MY', { day: '2-digit', month: 'short' }).format(new Date(row.updatedAt))}</small></div>
            <label>Question<input value={draft.question} onChange={event => setDrafts(current => ({ ...current, [row.id]: { ...(current[row.id] ?? draft), question: event.target.value } }))} /></label>
            <label>Answer<textarea value={draft.answer} onChange={event => setDrafts(current => ({ ...current, [row.id]: { ...(current[row.id] ?? draft), answer: event.target.value } }))} /></label>
            <div className="knowledge-actions"><button className="secondary-button" disabled={busy === row.id} onClick={() => void saveFaq(row)}>{busy === row.id ? 'Saving…' : 'Save'}</button><button className={row.active ? 'danger-button' : 'secondary-button'} disabled={busy === row.id} onClick={() => void saveFaq(row, !row.active)}>{row.active ? 'Deactivate' : 'Activate'}</button></div>
          </article>;
        })}</div>
      </div>
      <div className="knowledge-column">
        <div className="knowledge-section-head"><div><h3>Test knowledge coverage</h3><p>Check the exact tenant sources before the AI composes an answer.</p></div></div>
        <div className="knowledge-test-form"><label>Customer-style question<input value={testQuestion} onChange={event => setTestQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void inspectSources(); }} placeholder="Berapa harga facial premium?" /></label><button className="primary-button" disabled={busy === 'test' || !testQuestion.trim()} onClick={() => void inspectSources()}>{busy === 'test' ? 'Checking…' : 'Check sources'}</button></div>
        <div className="knowledge-source-list">{sources.map(source => <article key={source.id}><div><span>{source.type.replaceAll('_', ' ')}</span><strong>{source.title}</strong></div><p>{source.content}</p><code>{source.id}</code></article>)}</div>
        <div className="knowledge-section-head unanswered-head"><div><h3>Unanswered questions</h3><p>Repeated questions appear first. Approving an answer turns it into a tenant FAQ.</p></div><span>{unanswered.length} open</span></div>
        <div className="knowledge-unanswered-list">{!unanswered.length ? <div className="empty-inline"><strong>No unanswered questions</strong><span>Questions without approved context will appear here instead of being guessed.</span></div> : unanswered.map(row => <article key={row.id}>
          <div className="knowledge-row-head"><strong>{row.question}</strong><span>{row.occurrenceCount}× asked</span></div>
          <small>Last asked {new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.lastAskedAt))}</small>
          <label>Approved answer<textarea value={answers[row.id] ?? ''} onChange={event => setAnswers(current => ({ ...current, [row.id]: event.target.value }))} placeholder="Teach the correct answer" maxLength={4000} /></label>
          <button className="primary-button" disabled={busy === row.id || !answers[row.id]?.trim()} onClick={() => void teach(row)}>{busy === row.id ? 'Teaching…' : 'Approve and teach AI'}</button>
        </article>)}</div>
      </div>
    </div>}
  </section>;
}
