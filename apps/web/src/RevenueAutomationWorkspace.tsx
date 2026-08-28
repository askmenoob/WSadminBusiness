import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  tenantGet,
  tenantPatch,
  tenantPost,
  tenantPut,
  type AutomationAudit,
  type AutomationRule,
  type AutomationTrigger,
  type Booking,
  type CustomerSurvey,
  type CustomerTag,
  type LifecycleSettings,
  type MarketingCampaign,
  type MessageTemplate,
  type MessagingPolicy,
  type PaymentRecord,
} from './api';

export type RevenueTab = 'Payments' | 'Automation' | 'Marketing';

const automationTriggers: AutomationTrigger[] = [
  'BOOKING_CONFIRMED',
  'BOOKING_REMINDER',
  'BOOKING_COMPLETED',
  'BIRTHDAY',
  'WINBACK',
  'REVIEW_REQUEST',
  'MANUAL_CAMPAIGN',
  'SURVEY_INVITE',
];

const money = (amountMinor: number, currency = 'MYR') =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(amountMinor / 100);
const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-MY', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(value))
    : '—';
const shortId = (value: string | null) => (value ? value.slice(0, 8).toUpperCase() : '—');
const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

function Feedback({
  error,
  notice,
  clearError,
  clearNotice,
}: {
  error: string | null;
  notice: string | null;
  clearError: () => void;
  clearNotice: () => void;
}) {
  return (
    <>
      {error ? (
        <div className="data-banner error">
          <strong>Action needed</strong><span>{error}</span><button onClick={clearError}>Dismiss</button>
        </div>
      ) : null}
      {notice ? (
        <div className="data-banner success">
          <strong>Saved</strong><span>{notice}</span><button onClick={clearNotice}>Dismiss</button>
        </div>
      ) : null}
    </>
  );
}

function PaymentsWorkspace() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<PaymentRecord | null>(null);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState('Customer refund');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayments(await tenantGet<PaymentRecord[]>('/payments'));
    } catch (caught) {
      setError(message(caught, 'Unable to load payment history'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const totals = useMemo(() => payments.reduce((out, row) => {
    if (['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(row.status)) out.collected += row.amountMinor;
    out.refunded += row.refundedMinor;
    if (row.status === 'PENDING' || row.status === 'REQUIRES_ACTION') out.pending += row.amountMinor;
    return out;
  }, { collected: 0, refunded: 0, pending: 0 }), [payments]);

  function openRefund(row: PaymentRecord) {
    setRefundTarget(row);
    setRefundAmount((row.amountMinor - row.refundedMinor) / 100);
    setRefundReason('Customer refund');
  }

  async function refund() {
    if (!refundTarget) return;
    const amountMinor = Math.round(refundAmount * 100);
    if (amountMinor < 1 || amountMinor > refundTarget.amountMinor - refundTarget.refundedMinor) {
      setError('Refund amount must be within the remaining paid amount.');
      return;
    }
    try {
      await tenantPost(`/payments/${refundTarget.id}/refund`, { amountMinor, reason: refundReason.trim() || undefined });
      setRefundTarget(null);
      setNotice(`Refund of ${money(amountMinor, refundTarget.currency)} requested`);
      await load();
    } catch (caught) {
      setError(message(caught, 'Unable to issue refund'));
    }
  }

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Revenue operations</p><h1>Payments</h1><p className="muted">Tenant payment and refund history from the configured gateway.</p></div>
        <button className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>
      <Feedback error={error} notice={notice} clearError={() => setError(null)} clearNotice={() => setNotice(null)} />
      <section className="metric-grid metric-grid-three">
        <article className="metric-card"><div><small>Gross paid</small><strong>{money(totals.collected)}</strong></div><span className="metric-note">Before refunds</span></article>
        <article className="metric-card"><div><small>Refunded</small><strong>{money(totals.refunded)}</strong></div><span className="metric-note warning">Recorded amount</span></article>
        <article className="metric-card"><div><small>Pending</small><strong>{money(totals.pending)}</strong></div><span className="metric-note">Awaiting gateway</span></article>
      </section>
      <section className="workspace-card ops-card">
        <div className="section-head"><div><p className="eyebrow">Gateway ledger</p><h2>Payment history</h2></div><span className="demo-chip">Live API · {payments.length}</span></div>
        {loading && !payments.length ? <div className="empty-inline">Loading payments…</div> : !payments.length ? <div className="empty-inline"><strong>No payments yet</strong><span>Payments created for tenant bookings will appear here.</span></div> : (
          <div className="ops-table">
            <div className="ops-table-head payment-grid"><span>Created</span><span>Booking</span><span>Provider</span><span>Amount</span><span>Refunded</span><span>Status</span><span>Action</span></div>
            {payments.map(row => {
              const refundable = ['PAID', 'PARTIALLY_REFUNDED'].includes(row.status) && row.refundedMinor < row.amountMinor;
              return <div className="ops-table-row payment-grid" key={row.id}>
                <span><strong>{dateTime(row.createdAt)}</strong><small>{row.purpose}</small></span>
                <span><strong>{shortId(row.bookingId)}</strong><small>{shortId(row.customerId)} customer</small></span>
                <span><strong>{row.provider}</strong><small>{shortId(row.providerPaymentId)}</small></span>
                <span><strong>{money(row.amountMinor, row.currency)}</strong><small>{row.currency}</small></span>
                <span><strong>{money(row.refundedMinor, row.currency)}</strong><small>{row.refundedMinor ? 'Refund recorded' : 'None'}</small></span>
                <span><i className={`ops-status ${row.status.toLowerCase()}`}>{row.status.replaceAll('_', ' ')}</i></span>
                <span><button className="table-action" disabled={!refundable} onClick={() => openRefund(row)}>Refund</button></span>
              </div>;
            })}
          </div>
        )}
      </section>
      {refundTarget ? <div className="modal-scrim" onClick={() => setRefundTarget(null)}><section className="modal-card" onClick={event => event.stopPropagation()}>
        <div className="modal-head"><div><p className="eyebrow">Payment refund</p><h2>{shortId(refundTarget.id)}</h2></div><button onClick={() => setRefundTarget(null)}>×</button></div>
        <p className="muted compact">Remaining refundable amount: {money(refundTarget.amountMinor - refundTarget.refundedMinor, refundTarget.currency)}</p>
        <label>Refund amount ({refundTarget.currency})<input type="number" min="0.01" step="0.01" value={refundAmount} onChange={event => setRefundAmount(Number(event.target.value))} /></label>
        <label>Reason<input value={refundReason} onChange={event => setRefundReason(event.target.value)} /></label>
        <div className="modal-actions"><button className="secondary-button" onClick={() => setRefundTarget(null)}>Cancel</button><button className="danger-button" onClick={() => void refund()}>Confirm refund</button></div>
      </section></div> : null}
    </>
  );
}

function AutomationWorkspace() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [audit, setAudit] = useState<AutomationAudit[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [lifecycle, setLifecycle] = useState<LifecycleSettings | null>(null);
  const [policy, setPolicy] = useState<MessagingPolicy | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<MessageTemplate['templateKey']>('BOOKING_CONFIRMATION');
  const [ruleName, setRuleName] = useState('');
  const [ruleTrigger, setRuleTrigger] = useState<AutomationTrigger>('BOOKING_REMINDER');
  const [ruleOffset, setRuleOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextRules, nextAudit, nextTemplates, nextLifecycle, nextPolicy] = await Promise.all([
        tenantGet<AutomationRule[]>('/automation/rules'),
        tenantGet<AutomationAudit[]>('/automation/audit'),
        tenantGet<MessageTemplate[]>('/automation/templates'),
        tenantGet<LifecycleSettings>('/automation/lifecycle-settings'),
        tenantGet<MessagingPolicy>('/messaging-policy'),
      ]);
      setRules(nextRules); setAudit(nextAudit); setTemplates(nextTemplates); setLifecycle(nextLifecycle); setPolicy(nextPolicy);
      setSelectedTemplateKey(current => nextTemplates.some(row => row.templateKey === current) ? current : (nextTemplates[0]?.templateKey ?? current));
    } catch (caught) {
      setError(message(caught, 'Unable to load automation configuration'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const selectedTemplate = templates.find(row => row.templateKey === selectedTemplateKey) ?? null;

  async function createRule() {
    if (!ruleName.trim()) return;
    try {
      await tenantPost('/automation/rules', { name: ruleName, trigger: ruleTrigger, offsetMinutes: ruleOffset, active: true, config: {} });
      setRuleName(''); setNotice('Automation rule created'); await load();
    } catch (caught) { setError(message(caught, 'Unable to create automation rule')); }
  }

  async function toggleRule(row: AutomationRule) {
    try {
      await tenantPatch(`/automation/rules/${row.id}`, { active: !row.active });
      setNotice(`${row.name} ${row.active ? 'paused' : 'enabled'}`); await load();
    } catch (caught) { setError(message(caught, 'Unable to update automation rule')); }
  }

  function updateTemplate(patch: Partial<MessageTemplate>) {
    setTemplates(current => current.map(row => row.templateKey === selectedTemplateKey ? { ...row, ...patch } : row));
  }

  async function saveTemplate() {
    if (!selectedTemplate) return;
    try {
      await tenantPut(`/automation/templates/${selectedTemplate.templateKey}`, { name: selectedTemplate.name, body: selectedTemplate.body, active: selectedTemplate.active });
      setNotice(`${selectedTemplate.name} template updated`); await load();
    } catch (caught) { setError(message(caught, 'Unable to save template')); }
  }

  async function saveLifecycle() {
    if (!lifecycle) return;
    try {
      const saved = await tenantPut<LifecycleSettings>('/automation/lifecycle-settings', {
        confirmationEnabled: lifecycle.confirmationEnabled,
        reminderMinutes: lifecycle.reminderMinutes,
        thankYouDelayMinutes: lifecycle.thankYouDelayMinutes,
        reviewDelayMinutes: lifecycle.reviewDelayMinutes,
        birthdayEnabled: lifecycle.birthdayEnabled,
        winbackDays: lifecycle.winbackDays,
      });
      setLifecycle(saved); setNotice('Lifecycle policy updated');
    } catch (caught) { setError(message(caught, 'Unable to save lifecycle policy')); }
  }

  async function savePolicy() {
    if (!policy) return;
    try {
      const saved = await tenantPut<MessagingPolicy>('/messaging-policy', {
        timezone: policy.timezone,
        quietStartMinute: policy.quietStartMinute,
        quietEndMinute: policy.quietEndMinute,
        allowedWeekdays: policy.allowedWeekdays,
        marketingEnabled: policy.marketingEnabled,
        transactionalEnabled: policy.transactionalEnabled,
        maxMessagesPerMinute: policy.maxMessagesPerMinute,
      });
      setPolicy(saved); setNotice('Messaging policy updated');
    } catch (caught) { setError(message(caught, 'Unable to save messaging policy')); }
  }

  return <>
    <header className="page-header"><div><p className="eyebrow">Lifecycle operations</p><h1>Automation</h1><p className="muted">Manage rules, message templates, delivery policies and execution history.</p></div><button className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></header>
    <Feedback error={error} notice={notice} clearError={() => setError(null)} clearNotice={() => setNotice(null)} />
    <div className="ops-two-columns">
      <section className="workspace-card ops-card">
        <div className="section-head"><div><p className="eyebrow">Trigger rules</p><h2>Automation rules</h2></div><span className="demo-chip">Live API · {rules.length}</span></div>
        <div className="ops-form ops-rule-form"><input value={ruleName} onChange={event => setRuleName(event.target.value)} placeholder="Rule name" /><select value={ruleTrigger} onChange={event => setRuleTrigger(event.target.value as AutomationTrigger)}>{automationTriggers.map(trigger => <option key={trigger}>{trigger}</option>)}</select><input type="number" value={ruleOffset} onChange={event => setRuleOffset(Number(event.target.value))} aria-label="Offset minutes" /><button className="primary-button" disabled={!ruleName.trim()} onClick={() => void createRule()}>Add rule</button></div>
        <div className="ops-list">{rules.map(row => <article key={row.id}><div><strong>{row.name}</strong><small>{row.trigger} · offset {row.offsetMinutes} min</small></div><button className={row.active ? 'ops-toggle on' : 'ops-toggle'} onClick={() => void toggleRule(row)}>{row.active ? 'Enabled' : 'Paused'}</button></article>)}{!loading && !rules.length ? <div className="empty-inline">No automation rules configured.</div> : null}</div>
      </section>
      <section className="workspace-card ops-card">
        <div className="section-head"><div><p className="eyebrow">Execution trail</p><h2>Automation history</h2></div><span className="demo-chip">{audit.length} events</span></div>
        <div className="ops-list audit-list">{audit.slice(0, 30).map(row => <article key={row.id}><span className="timeline-dot"/><div><strong>{row.eventType.replaceAll('_', ' ')}</strong><small>{dateTime(row.createdAt)} · job {shortId(row.jobId)}</small></div></article>)}{!loading && !audit.length ? <div className="empty-inline">No automation activity yet.</div> : null}</div>
      </section>
    </div>
    <div className="ops-two-columns">
      <section className="workspace-card ops-card">
        <div className="section-head"><div><p className="eyebrow">Message content</p><h2>Lifecycle templates</h2></div></div>
        {selectedTemplate ? <div className="ops-settings-form"><label>Template<select value={selectedTemplateKey} onChange={event => setSelectedTemplateKey(event.target.value as MessageTemplate['templateKey'])}>{templates.map(row => <option value={row.templateKey} key={row.templateKey}>{row.templateKey.replaceAll('_', ' ')}</option>)}</select></label><label>Name<input value={selectedTemplate.name} onChange={event => updateTemplate({ name: event.target.value })} /></label><label>Message body<textarea value={selectedTemplate.body} onChange={event => updateTemplate({ body: event.target.value })} /></label><label className="check-line"><input type="checkbox" checked={selectedTemplate.active} onChange={event => updateTemplate({ active: event.target.checked })} /> Active template</label><button className="primary-button" disabled={!selectedTemplate.name.trim() || !selectedTemplate.body.trim()} onClick={() => void saveTemplate()}>Save template</button></div> : <div className="empty-inline">Loading templates…</div>}
      </section>
      <section className="workspace-card ops-card">
        <div className="section-head"><div><p className="eyebrow">Delivery safeguards</p><h2>Messaging policy</h2></div></div>
        {policy ? <div className="ops-settings-form"><label>Timezone<input value={policy.timezone} onChange={event => setPolicy({ ...policy, timezone: event.target.value })} /></label><div className="form-grid"><label>Quiet start (minute)<input type="number" min="0" max="1439" value={policy.quietStartMinute} onChange={event => setPolicy({ ...policy, quietStartMinute: Number(event.target.value) })} /></label><label>Quiet end (minute)<input type="number" min="0" max="1439" value={policy.quietEndMinute} onChange={event => setPolicy({ ...policy, quietEndMinute: Number(event.target.value) })} /></label></div><label>Rate limit / minute<input type="number" min="1" max="1000" value={policy.maxMessagesPerMinute} onChange={event => setPolicy({ ...policy, maxMessagesPerMinute: Number(event.target.value) })} /></label><div className="check-pair"><label className="check-line"><input type="checkbox" checked={policy.transactionalEnabled} onChange={event => setPolicy({ ...policy, transactionalEnabled: event.target.checked })} /> Transactional</label><label className="check-line"><input type="checkbox" checked={policy.marketingEnabled} onChange={event => setPolicy({ ...policy, marketingEnabled: event.target.checked })} /> Marketing</label></div><button className="primary-button" onClick={() => void savePolicy()}>Save messaging policy</button></div> : <div className="empty-inline">Loading messaging policy…</div>}
      </section>
    </div>
    <section className="workspace-card ops-card">
      <div className="section-head"><div><p className="eyebrow">Lifecycle schedule</p><h2>Confirmation, reminders and retention</h2></div></div>
      {lifecycle ? <div className="ops-lifecycle-grid"><label className="check-line"><input type="checkbox" checked={lifecycle.confirmationEnabled} onChange={event => setLifecycle({ ...lifecycle, confirmationEnabled: event.target.checked })} /> Booking confirmation</label><label>Reminder minutes<input value={lifecycle.reminderMinutes.join(', ')} onChange={event => setLifecycle({ ...lifecycle, reminderMinutes: event.target.value.split(',').map(value => Number(value.trim())).filter(Number.isFinite) })} /></label><label>Thank-you delay<input type="number" min="0" value={lifecycle.thankYouDelayMinutes} onChange={event => setLifecycle({ ...lifecycle, thankYouDelayMinutes: Number(event.target.value) })} /></label><label>Review delay<input type="number" min="0" value={lifecycle.reviewDelayMinutes} onChange={event => setLifecycle({ ...lifecycle, reviewDelayMinutes: Number(event.target.value) })} /></label><label className="check-line"><input type="checkbox" checked={lifecycle.birthdayEnabled} onChange={event => setLifecycle({ ...lifecycle, birthdayEnabled: event.target.checked })} /> Birthday automation</label><label>Win-back days<input type="number" min="1" value={lifecycle.winbackDays} onChange={event => setLifecycle({ ...lifecycle, winbackDays: Number(event.target.value) })} /></label><button className="primary-button" onClick={() => void saveLifecycle()}>Save lifecycle policy</button></div> : <div className="empty-inline">Loading lifecycle settings…</div>}
    </section>
  </>;
}

function MarketingWorkspace() {
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [surveys, setSurveys] = useState<CustomerSurvey[]>([]);
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [name, setName] = useState('');
  const [body, setBody] = useState('Hi {{customer_name}},');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [lastVisitAfter, setLastVisitAfter] = useState('');
  const [lastVisitBefore, setLastVisitBefore] = useState('');
  const [minCompletedBookings, setMinCompletedBookings] = useState(0);
  const [scheduledAt, setScheduledAt] = useState('');
  const [surveyBookingId, setSurveyBookingId] = useState('');
  const [surveyExpiresDays, setSurveyExpiresDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const from = new Date(Date.now() - 365 * 86400000).toISOString();
      const to = new Date(Date.now() + 31 * 86400000).toISOString();
      const [nextCampaigns, nextSurveys, nextTags, nextBookings] = await Promise.all([
        tenantGet<MarketingCampaign[]>('/campaigns'),
        tenantGet<CustomerSurvey[]>('/surveys'),
        tenantGet<CustomerTag[]>('/customer-tags'),
        tenantGet<Booking[]>(`/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`),
      ]);
      setCampaigns(nextCampaigns); setSurveys(nextSurveys); setTags(nextTags); setBookings(nextBookings);
      setSurveyBookingId(current => current && nextBookings.some(row => row.id === current) ? current : (nextBookings.find(row => row.customerId)?.id ?? ''));
    } catch (caught) {
      setError(message(caught, 'Unable to load marketing workspace'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function toggleTag(id: string) {
    setTagIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  async function createCampaign() {
    if (!name.trim() || !body.trim()) return;
    try {
      await tenantPost('/campaigns', {
        name,
        body,
        segment: {
          tagIds,
          minCompletedBookings,
          ...(lastVisitAfter ? { lastVisitAfter } : {}),
          ...(lastVisitBefore ? { lastVisitBefore } : {}),
        },
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      setName(''); setBody('Hi {{customer_name}},'); setTagIds([]); setNotice('Campaign draft created'); await load();
    } catch (caught) { setError(message(caught, 'Unable to create campaign')); }
  }

  async function planCampaign(row: MarketingCampaign) {
    try {
      const result = await tenantPost<{ candidateCount: number; queued: number }>(`/campaigns/${row.id}/plan`);
      setNotice(`${result.queued} of ${result.candidateCount} matching customers queued`); await load();
    } catch (caught) { setError(message(caught, 'Unable to plan campaign')); }
  }

  async function createSurvey() {
    if (!surveyBookingId) return;
    try {
      const result = await tenantPost<{ survey: CustomerSurvey; scheduled: boolean }>(`/bookings/${surveyBookingId}/survey`, { expiresDays: surveyExpiresDays });
      setNotice(result.scheduled ? 'Survey invite created and queued' : 'Survey exists; duplicate invite was skipped'); await load();
    } catch (caught) { setError(message(caught, 'Unable to create survey invite')); }
  }

  return <>
    <header className="page-header"><div><p className="eyebrow">Growth operations</p><h1>Marketing</h1><p className="muted">Build consent-aware customer segments, schedule campaigns and manage post-visit surveys.</p></div><button className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></header>
    <Feedback error={error} notice={notice} clearError={() => setError(null)} clearNotice={() => setNotice(null)} />
    <div className="ops-two-columns">
      <section className="workspace-card ops-card">
        <div className="section-head"><div><p className="eyebrow">Campaign builder</p><h2>Audience and message</h2></div></div>
        <div className="ops-settings-form"><label>Campaign name<input value={name} onChange={event => setName(event.target.value)} placeholder="VIP return offer" /></label><label>WhatsApp message<textarea value={body} onChange={event => setBody(event.target.value)} /></label><div><small className="ops-label">Customer tags</small><div className="tag-cloud">{tags.map(tag => <button type="button" className={tagIds.includes(tag.id) ? 'selected' : ''} key={tag.id} onClick={() => toggleTag(tag.id)}>{tag.name}</button>)}{!tags.length ? <small>No customer tags configured.</small> : null}</div></div><div className="form-grid"><label>Last visit after<input type="date" value={lastVisitAfter} onChange={event => setLastVisitAfter(event.target.value)} /></label><label>Last visit before<input type="date" value={lastVisitBefore} onChange={event => setLastVisitBefore(event.target.value)} /></label></div><div className="form-grid"><label>Minimum completed visits<input type="number" min="0" value={minCompletedBookings} onChange={event => setMinCompletedBookings(Number(event.target.value))} /></label><label>Schedule (optional)<input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} /></label></div><button className="primary-button" disabled={!name.trim() || !body.trim()} onClick={() => void createCampaign()}>Create campaign</button></div>
      </section>
      <section className="workspace-card ops-card">
        <div className="section-head"><div><p className="eyebrow">Campaign history</p><h2>Campaigns</h2></div><span className="demo-chip">Live API · {campaigns.length}</span></div>
        <div className="ops-list campaign-list">{campaigns.map(row => <article key={row.id}><div><strong>{row.name}</strong><small>{row.status} · {row.segment.tagIds?.length ?? 0} tags · min {row.segment.minCompletedBookings ?? 0} visits</small><p>{row.body}</p></div><button className="table-action" disabled={row.status === 'SENT' || row.status === 'CANCELLED'} onClick={() => void planCampaign(row)}>Plan</button></article>)}{!loading && !campaigns.length ? <div className="empty-inline">No campaigns created yet.</div> : null}</div>
      </section>
    </div>
    <section className="workspace-card ops-card">
      <div className="section-head"><div><p className="eyebrow">Post-visit feedback</p><h2>Surveys</h2></div><span className="demo-chip">{surveys.length} issued</span></div>
      <div className="survey-compose"><label>Customer booking<select value={surveyBookingId} onChange={event => setSurveyBookingId(event.target.value)}><option value="">Select a linked booking</option>{bookings.filter(row => row.customerId).map(row => <option value={row.id} key={row.id}>{dateTime(row.startsAt)} · {shortId(row.id)} · {row.status}</option>)}</select></label><label>Expires after days<input type="number" min="1" max="90" value={surveyExpiresDays} onChange={event => setSurveyExpiresDays(Number(event.target.value))} /></label><button className="primary-button" disabled={!surveyBookingId} onClick={() => void createSurvey()}>Create & queue survey</button></div>
      <div className="ops-table survey-table"><div className="ops-table-head survey-grid"><span>Created</span><span>Booking</span><span>Customer</span><span>Expires</span><span>Status</span></div>{surveys.map(row => <div className="ops-table-row survey-grid" key={row.id}><span><strong>{dateTime(row.createdAt)}</strong><small>{shortId(row.id)}</small></span><span><strong>{shortId(row.bookingId)}</strong></span><span><strong>{shortId(row.customerId)}</strong></span><span><strong>{dateTime(row.expiresAt)}</strong></span><span><i className={`ops-status ${row.status.toLowerCase()}`}>{row.status}</i></span></div>)}</div>
      {!loading && !surveys.length ? <div className="empty-inline">No surveys issued yet.</div> : null}
    </section>
  </>;
}

export function RevenueAutomationWorkspace({ module }: { module: RevenueTab }) {
  if (module === 'Payments') return <PaymentsWorkspace />;
  if (module === 'Automation') return <AutomationWorkspace />;
  return <MarketingWorkspace />;
}
