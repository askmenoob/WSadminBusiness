import { useCallback, useEffect, useState } from 'react';
import {
  tenantGet,
  tenantPatch,
  tenantPost,
  tenantPut,
  type AiSettings,
  type BookingPolicy,
  type IntegrationStatus,
  type MessagingPolicy,
  type PrivacyPolicy,
  type WhatsAppPairingResponse,
} from './api';

type SettingsTab = 'Connections' | 'AI' | 'Policies' | 'Privacy';
const tabs: SettingsTab[] = ['Connections', 'AI', 'Policies', 'Privacy'];
const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const minutesToTime = (minutes: number | null) => minutes === null ? '' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const timeToMinutes = (value: string) => value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : null;
const caughtMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function StatusBadge({ configured, label }: { configured: boolean; label?: string }) {
  return <span className={configured ? 'settings-status configured' : 'settings-status'}>{label ?? (configured ? 'Configured' : 'Not configured')}</span>;
}

export function SettingsWorkspace() {
  const [active, setActive] = useState<SettingsTab>('Connections');
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [messaging, setMessaging] = useState<MessagingPolicy | null>(null);
  const [privacy, setPrivacy] = useState<PrivacyPolicy | null>(null);
  const [booking, setBooking] = useState<BookingPolicy | null>(null);
  const [pairing, setPairing] = useState<WhatsAppPairingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [nextIntegrations, nextAi, nextMessaging, nextPrivacy, nextBooking] = await Promise.all([
        tenantGet<IntegrationStatus>('/settings/integrations'),
        tenantGet<AiSettings>('/ai/settings'),
        tenantGet<MessagingPolicy>('/messaging-policy'),
        tenantGet<PrivacyPolicy>('/privacy'),
        tenantGet<BookingPolicy>('/booking-policy'),
      ]);
      setIntegrations(nextIntegrations); setAi(nextAi); setMessaging(nextMessaging); setPrivacy(nextPrivacy); setBooking(nextBooking);
    } catch (caught) {
      setError(caughtMessage(caught, 'Unable to load tenant settings'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function whatsappAction(action: 'provision' | 'pair' | 'refresh' | 'disconnect') {
    try {
      if (action === 'provision') await tenantPost('/whatsapp/instance');
      if (action === 'pair') setPairing(await tenantPost<WhatsAppPairingResponse>('/whatsapp/instance/pair'));
      if (action === 'refresh') await tenantGet('/whatsapp/instance/status');
      if (action === 'disconnect') { await tenantPost('/whatsapp/instance/disconnect'); setPairing(null); }
      setNotice(`WhatsApp ${action} completed`); await load();
    } catch (caught) { setError(caughtMessage(caught, `Unable to ${action} WhatsApp`)); }
  }

  async function saveAi() {
    if (!ai) return;
    try { setAi(await tenantPatch<AiSettings>('/ai/settings', ai)); setNotice('AI settings updated'); }
    catch (caught) { setError(caughtMessage(caught, 'Unable to save AI settings')); }
  }

  async function saveMessaging() {
    if (!messaging) return;
    try {
      setMessaging(await tenantPut<MessagingPolicy>('/messaging-policy', {
        timezone: messaging.timezone,
        quietStartMinute: messaging.quietStartMinute,
        quietEndMinute: messaging.quietEndMinute,
        allowedWeekdays: messaging.allowedWeekdays,
        marketingEnabled: messaging.marketingEnabled,
        transactionalEnabled: messaging.transactionalEnabled,
        maxMessagesPerMinute: messaging.maxMessagesPerMinute,
      }));
      setNotice('Messaging policy updated');
    } catch (caught) { setError(caughtMessage(caught, 'Unable to save messaging policy')); }
  }

  async function saveBooking() {
    if (!booking) return;
    try { setBooking(await tenantPatch<BookingPolicy>('/booking-policy', booking)); setNotice('Booking policy updated'); }
    catch (caught) { setError(caughtMessage(caught, 'Unable to save booking policy')); }
  }

  async function savePrivacy() {
    if (!privacy) return;
    try {
      setPrivacy(await tenantPut<PrivacyPolicy>('/privacy', { retentionDays: privacy.retentionDays, messageRetentionDays: privacy.messageRetentionDays, auditRetentionDays: privacy.auditRetentionDays }));
      setNotice('Privacy retention policy updated');
    } catch (caught) { setError(caughtMessage(caught, 'Unable to save privacy policy')); }
  }

  function toggleWeekday(day: number) {
    if (!messaging) return;
    const allowedWeekdays = messaging.allowedWeekdays.includes(day) ? messaging.allowedWeekdays.filter(value => value !== day) : [...messaging.allowedWeekdays, day].sort();
    setMessaging({ ...messaging, allowedWeekdays });
  }

  return <>
    <header className="page-header"><div><p className="eyebrow">Platform configuration</p><h1>Settings</h1><p className="muted">Tenant connections, operational policies and privacy controls. Provider credentials remain server-side.</p></div><button className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh status'}</button></header>
    {error ? <div className="data-banner error"><strong>Settings issue</strong><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div> : null}
    {notice ? <div className="data-banner success"><strong>Saved</strong><span>{notice}</span><button onClick={() => setNotice(null)}>Dismiss</button></div> : null}
    <div className="settings-tabs">{tabs.map(tab => <button className={active === tab ? 'selected' : ''} key={tab} onClick={() => setActive(tab)}>{tab}</button>)}</div>
    {loading && !integrations ? <section className="workspace-card settings-loading">Loading configuration status…</section> : null}
    {active === 'Connections' && integrations ? <>
      <section className="settings-connection-grid">
        <article className="workspace-card settings-connection-card"><div className="settings-card-head"><span className="settings-provider-icon">WA</span><div><h2>WhatsApp</h2><small>{integrations.whatsapp.provider}</small></div><StatusBadge configured={integrations.whatsapp.configured && integrations.whatsapp.status === 'CONNECTED'} label={integrations.whatsapp.status.replaceAll('_', ' ')} /></div><dl><div><dt>Server configuration</dt><dd>{integrations.whatsapp.configured ? 'Available' : 'Missing'}</dd></div><div><dt>Tenant instance</dt><dd>{integrations.whatsapp.provisioned ? 'Provisioned' : 'Not provisioned'}</dd></div><div><dt>Phone</dt><dd>{integrations.whatsapp.phoneE164 ?? '—'}</dd></div></dl><div className="settings-actions">{!integrations.whatsapp.provisioned ? <button className="primary-button" onClick={() => void whatsappAction('provision')}>Provision instance</button> : <><button className="secondary-button" onClick={() => void whatsappAction('refresh')}>Refresh</button>{integrations.whatsapp.status !== 'CONNECTED' ? <button className="primary-button" onClick={() => void whatsappAction('pair')}>Pair</button> : <button className="danger-button" onClick={() => void whatsappAction('disconnect')}>Disconnect</button>}</>}</div></article>
        <article className="workspace-card settings-connection-card"><div className="settings-card-head"><span className="settings-provider-icon">AI</span><div><h2>AI providers</h2><small>Inference and transcription</small></div><StatusBadge configured={integrations.ai.providers.some(row => row.configured)} /></div><dl>{integrations.ai.providers.map(row => <div key={row.provider}><dt>{row.provider}</dt><dd>{row.configured ? 'Server key available' : 'Not configured'}</dd></div>)}</dl><button className="secondary-button" onClick={() => setActive('AI')}>Open AI settings</button></article>
        <article className="workspace-card settings-connection-card"><div className="settings-card-head"><span className="settings-provider-icon">PY</span><div><h2>Payments</h2><small>{integrations.payment.provider ?? 'No gateway'}</small></div><StatusBadge configured={integrations.payment.configured} label={integrations.payment.mode} /></div><p>Gateway selection and credentials are controlled by the server deployment. No secret fields are sent to this browser.</p></article>
        <article className="workspace-card settings-connection-card"><div className="settings-card-head"><span className="settings-provider-icon">GC</span><div><h2>Calendar integration</h2><small>{integrations.calendar.provider.replaceAll('_', ' ')}</small></div><StatusBadge configured={integrations.calendar.configured} /></div><p>External calendar credentials are server-managed. Booking data remains tenant-scoped.</p></article>
      </section>
      <section className="workspace-card secret-policy-card"><div><span>🔒</span><div><p className="eyebrow">Secret policy</p><h2>Server-only credentials</h2><p>API keys, access tokens and secret file paths are intentionally absent from frontend responses, UI fields and logs.</p></div></div><StatusBadge configured={integrations.secretPolicy === 'SERVER_ONLY'} label="Enforced" /></section>
      {pairing ? <section className="workspace-card pairing-card"><div className="section-head"><div><p className="eyebrow">WhatsApp pairing</p><h2>Scan or enter the pairing code</h2></div>{pairing.expiresAt ? <span className="demo-chip">Expires {new Date(pairing.expiresAt).toLocaleTimeString('en-MY')}</span> : null}</div>{pairing.qrCode ? pairing.qrCode.startsWith('data:image') ? <img src={pairing.qrCode} alt="WhatsApp pairing QR" /> : <code>{pairing.qrCode}</code> : null}{pairing.pairingCode ? <strong className="pairing-code">{pairing.pairingCode}</strong> : null}</section> : null}
    </> : null}
    {active === 'AI' && ai ? <section className="workspace-card settings-panel"><div className="section-head"><div><p className="eyebrow">AI routing</p><h2>Provider settings</h2></div><StatusBadge configured={ai.enabled} label={ai.enabled ? 'Enabled' : 'Disabled'} /></div><div className="settings-form-grid"><label className="check-line"><input type="checkbox" checked={ai.enabled} onChange={event => setAi({ ...ai, enabled: event.target.checked })} /> Enable tenant AI</label><span/><label>Primary provider<select value={ai.primaryProvider} onChange={event => setAi({ ...ai, primaryProvider: event.target.value as AiSettings['primaryProvider'] })}><option>GROQ</option><option>OPENAI</option></select></label><label>Primary model<input value={ai.primaryModel} onChange={event => setAi({ ...ai, primaryModel: event.target.value })} /></label><label>Fallback provider<select value={ai.fallbackProvider ?? ''} onChange={event => setAi({ ...ai, fallbackProvider: event.target.value ? event.target.value as AiSettings['primaryProvider'] : null })}><option value="">None</option><option>GROQ</option><option>OPENAI</option></select></label><label>Fallback model<input value={ai.fallbackModel ?? ''} onChange={event => setAi({ ...ai, fallbackModel: event.target.value || null })} /></label><label>Timeout (ms)<input type="number" min="1000" max="120000" value={ai.timeoutMs} onChange={event => setAi({ ...ai, timeoutMs: Number(event.target.value) })} /></label></div><p className="settings-safe-note">Provider keys are detected server-side and are never returned by this endpoint.</p><button className="primary-button" disabled={!ai.primaryModel.trim()} onClick={() => void saveAi()}>Save AI settings</button></section> : null}
    {active === 'Policies' ? <div className="settings-policy-grid">
      {booking ? <section className="workspace-card settings-panel"><div className="section-head"><div><p className="eyebrow">Booking controls</p><h2>Booking policy</h2></div></div><div className="settings-form-grid"><label>Booking horizon (days)<input type="number" min="1" max="730" value={booking.bookingHorizonDays} onChange={event => setBooking({ ...booking, bookingHorizonDays: Number(event.target.value) })} /></label><label>Slot interval (minutes)<input type="number" min="5" step="5" value={booking.slotIntervalMinutes} onChange={event => setBooking({ ...booking, slotIntervalMinutes: Number(event.target.value) })} /></label><label>Minimum lead (minutes)<input type="number" min="0" value={booking.minimumLeadMinutes} onChange={event => setBooking({ ...booking, minimumLeadMinutes: Number(event.target.value) })} /></label><label>Cancellation deadline (minutes)<input type="number" min="0" value={booking.cancellationDeadlineMinutes} onChange={event => setBooking({ ...booking, cancellationDeadlineMinutes: Number(event.target.value) })} /></label><label>Same-day cutoff<input type="time" value={minutesToTime(booking.sameDayCutoffMinute)} onChange={event => setBooking({ ...booking, sameDayCutoffMinute: timeToMinutes(event.target.value) })} /><small>Leave blank to disable cutoff.</small></label></div><button className="primary-button" onClick={() => void saveBooking()}>Save booking policy</button></section> : null}
      {messaging ? <section className="workspace-card settings-panel"><div className="section-head"><div><p className="eyebrow">Delivery controls</p><h2>Messaging policy</h2></div></div><div className="settings-form-grid"><label>Timezone<input value={messaging.timezone} onChange={event => setMessaging({ ...messaging, timezone: event.target.value })} /></label><label>Rate limit / minute<input type="number" min="1" max="1000" value={messaging.maxMessagesPerMinute} onChange={event => setMessaging({ ...messaging, maxMessagesPerMinute: Number(event.target.value) })} /></label><label>Quiet start<input type="time" value={minutesToTime(messaging.quietStartMinute)} onChange={event => setMessaging({ ...messaging, quietStartMinute: timeToMinutes(event.target.value) ?? 0 })} /></label><label>Quiet end<input type="time" value={minutesToTime(messaging.quietEndMinute)} onChange={event => setMessaging({ ...messaging, quietEndMinute: timeToMinutes(event.target.value) ?? 0 })} /></label></div><div className="weekday-picker">{weekdayNames.map((name, day) => <button className={messaging.allowedWeekdays.includes(day) ? 'selected' : ''} key={name} onClick={() => toggleWeekday(day)}>{name}</button>)}</div><div className="check-pair"><label className="check-line"><input type="checkbox" checked={messaging.transactionalEnabled} onChange={event => setMessaging({ ...messaging, transactionalEnabled: event.target.checked })} /> Transactional messages</label><label className="check-line"><input type="checkbox" checked={messaging.marketingEnabled} onChange={event => setMessaging({ ...messaging, marketingEnabled: event.target.checked })} /> Marketing messages</label></div><button className="primary-button" onClick={() => void saveMessaging()}>Save messaging policy</button></section> : null}
    </div> : null}
    {active === 'Privacy' && privacy ? <section className="workspace-card settings-panel"><div className="section-head"><div><p className="eyebrow">Data governance</p><h2>Retention policy</h2></div><StatusBadge configured /></div><p className="muted">Set how long tenant records are retained. Applying retention or requesting deletion remains a separate deliberate server action.</p><div className="settings-form-grid"><label>Business data (days)<input type="number" min="7" max="3650" value={privacy.retentionDays} onChange={event => setPrivacy({ ...privacy, retentionDays: Number(event.target.value) })} /></label><label>Message data (days)<input type="number" min="7" max="3650" value={privacy.messageRetentionDays} onChange={event => setPrivacy({ ...privacy, messageRetentionDays: Number(event.target.value) })} /></label><label>Audit data (days)<input type="number" min="7" max="3650" value={privacy.auditRetentionDays} onChange={event => setPrivacy({ ...privacy, auditRetentionDays: Number(event.target.value) })} /></label></div><button className="primary-button" onClick={() => void savePrivacy()}>Save privacy policy</button></section> : null}
  </>;
}
