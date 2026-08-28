import { useCallback, useEffect, useMemo, useState } from 'react';
import { systemGet, uatRole, type SystemDashboard } from './api';

const cost = (microusd: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: microusd < 10000 ? 4 : 2 }).format(microusd / 1_000_000);
const number = (value: number) => new Intl.NumberFormat('en-MY').format(value);
const message = (error: unknown) => error instanceof Error ? error.message : 'Unable to load System Owner dashboard';

function health(row: SystemDashboard['tenantHealth'][number]) {
  const issues: string[] = [];
  if (!['ACTIVE', 'TRIAL'].includes(row.subscriptionStatus ?? '')) issues.push('Subscription');
  if (row.whatsappStatus !== 'CONNECTED') issues.push('WhatsApp');
  if (row.openJobs > 20) issues.push('Automation backlog');
  return { healthy: issues.length === 0, issues };
}

export function SystemOwnerWorkspace() {
  const [dashboard, setDashboard] = useState<SystemDashboard | null>(null);
  const [query, setQuery] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setDashboard(await systemGet<SystemDashboard>('/dashboard')); }
    catch (caught) { setError(message(caught)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => (dashboard?.tenantHealth ?? []).filter(row => {
    const matches = `${row.name} ${row.tenantId} ${row.planCode ?? ''}`.toLowerCase().includes(query.trim().toLowerCase());
    return matches && (!attentionOnly || !health(row).healthy);
  }), [attentionOnly, dashboard, query]);
  const healthyCount = dashboard?.tenantHealth.filter(row => health(row).healthy).length ?? 0;
  const activeSubscriptions = (dashboard?.subscriptions.ACTIVE ?? 0) + (dashboard?.subscriptions.TRIAL ?? 0);
  const connectedWhatsApp = dashboard?.whatsapp.CONNECTED ?? 0;
  const openJobs = (dashboard?.automation.QUEUED ?? 0) + (dashboard?.automation.CLAIMED ?? 0) + (dashboard?.automation.DEFERRED ?? 0);

  if (uatRole !== 'SYSTEM_OWNER') return <section className="workspace-card role-blocked"><span>SO</span><h1>System Owner access required</h1><p>This dashboard is hidden unless the UAT session is configured with the SYSTEM_OWNER role.</p></section>;

  return <>
    <header className="page-header"><div><p className="eyebrow">Platform operations</p><h1>System Owner</h1><p className="muted">Cross-tenant health, subscription state, automation backlog and metered AI cost.</p></div><button className="secondary-button" disabled={loading} onClick={() => void load()}>{loading ? 'Refreshing…' : 'Refresh dashboard'}</button></header>
    {error ? <div className="data-banner error"><strong>Dashboard issue</strong><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div> : null}
    <div className="metric-grid owner-metrics"><article className="metric-card"><div><small>Tenants</small><strong>{number(dashboard?.tenants ?? 0)}</strong></div><span className="metric-note">{healthyCount} healthy</span></article><article className="metric-card"><div><small>Active subscriptions</small><strong>{number(activeSubscriptions)}</strong></div><span className="metric-note positive">Active + trial</span></article><article className="metric-card"><div><small>WhatsApp connected</small><strong>{number(connectedWhatsApp)}</strong></div><span className="metric-note">All tenants</span></article><article className="metric-card"><div><small>Open automation jobs</small><strong>{number(openJobs)}</strong></div><span className={openJobs > 20 ? 'metric-note warning' : 'metric-note'}>Queue health</span></article></div>
    <section className="workspace-card owner-ai-card"><div><p className="eyebrow">Metered AI</p><h2>{cost(dashboard?.ai.estimatedCostMicrousd ?? 0)}</h2><small>Estimated provider cost</small></div><dl><div><dt>Requests</dt><dd>{number(dashboard?.ai.requests ?? 0)}</dd></div><div><dt>Input tokens</dt><dd>{number(dashboard?.ai.inputTokens ?? 0)}</dd></div><div><dt>Output tokens</dt><dd>{number(dashboard?.ai.outputTokens ?? 0)}</dd></div><div><dt>Average latency</dt><dd>{number(Math.round(dashboard?.ai.latencyAvgMs ?? 0))} ms</dd></div></dl></section>
    <section className="workspace-card owner-health-card"><div className="owner-toolbar"><div><p className="eyebrow">Tenant health</p><h2>Operational status</h2></div><div><input aria-label="Search tenants" placeholder="Search tenant or plan" value={query} onChange={event => setQuery(event.target.value)} /><label><input type="checkbox" checked={attentionOnly} onChange={event => setAttentionOnly(event.target.checked)} /> Needs attention</label></div></div><div className="owner-health-table"><div className="owner-health-head"><span>Tenant</span><span>Health</span><span>Subscription</span><span>WhatsApp</span><span>Open jobs</span><span>AI requests</span><span>AI cost</span></div>{rows.map(row => { const state = health(row); return <article className="owner-health-row" key={row.tenantId}><div><strong>{row.name}</strong><small>{row.tenantId}</small></div><span className={state.healthy ? 'health-badge healthy' : 'health-badge'}>{state.healthy ? 'Healthy' : state.issues.join(' · ')}</span><div><strong>{row.planCode ?? 'No plan'}</strong><small>{row.subscriptionStatus ?? 'UNASSIGNED'}</small></div><span>{row.whatsappStatus ?? 'NOT PROVISIONED'}</span><span>{number(row.openJobs)}</span><span>{number(row.aiRequests)}</span><strong>{cost(row.aiCostMicrousd)}</strong></article>})}{!loading && !rows.length ? <div className="empty-inline"><strong>No matching tenants</strong><span>Change the search or attention filter.</span></div> : null}</div></section>
  </>;
}
