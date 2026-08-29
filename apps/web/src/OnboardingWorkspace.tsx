import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  authenticationMode,
  platformGet,
  tenantGet,
  tenantPost,
  tenantPut,
  type BillingCheckout,
  type BillingOverview,
  type CatalogService,
  type IntegrationStatus,
  type OnboardingState,
  type OnboardingStep,
  type SaaSPlan,
  type StaffProfile,
  type TenantPlanOverview,
  type WeeklyHours,
} from './api';

type WizardStep = Exclude<OnboardingStep, 'COMPLETE'>;
type OperationalReadiness = { services: number; staff: number; hours: number };

const steps: { key: WizardStep; label: string; detail: string }[] = [
  { key: 'BUSINESS_PROFILE', label: 'Business profile', detail: 'Name and operating timezone' },
  { key: 'VERTICAL', label: 'Business type', detail: 'Choose the closest operating model' },
  { key: 'WHATSAPP', label: 'WhatsApp', detail: 'Confirm the tenant connection' },
  { key: 'SERVICES', label: 'Services', detail: 'Create at least one bookable service' },
  { key: 'STAFF', label: 'Staff', detail: 'Create at least one active staff member' },
  { key: 'HOURS', label: 'Working hours', detail: 'Add weekly availability' },
];

const money = (minor: number, currency = 'MYR') => new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(minor / 100);
const label = (key: string) => key.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function OnboardingWorkspace({ onNavigate }: { onNavigate: (module: string) => void }) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [overview, setOverview] = useState<TenantPlanOverview | null>(null);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [readiness, setReadiness] = useState<OperationalReadiness>({ services: 0, staff: 0, hours: 0 });
  const [activeStep, setActiveStep] = useState<OnboardingStep>('BUSINESS_PROFILE');
  const [businessName, setBusinessName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kuala_Lumpur');
  const [vertical, setVertical] = useState('APPOINTMENT');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [nextState, nextOverview, nextBilling, nextPlans, nextIntegrations, services, staff] = await Promise.all([
        tenantGet<OnboardingState>('/onboarding'),
        tenantGet<TenantPlanOverview>('/subscription'),
        tenantGet<BillingOverview>('/billing'),
        platformGet<SaaSPlan[]>('/plans'),
        tenantGet<IntegrationStatus>('/settings/integrations'),
        tenantGet<CatalogService[]>('/services?active=true&limit=100'),
        tenantGet<StaffProfile[]>('/staff'),
      ]);
      const hourRows = await Promise.all(staff.filter(row => row.active).map(row => tenantGet<{ intervals: WeeklyHours[] }>(`/staff/${row.id}/working-hours`)));
      const data = nextState.data;
      const profile = data.BUSINESS_PROFILE ?? {};
      const savedVertical = data.VERTICAL ?? {};
      setBusinessName(typeof profile.businessName === 'string' ? profile.businessName : '');
      setTimezone(typeof profile.timezone === 'string' ? profile.timezone : 'Asia/Kuala_Lumpur');
      setVertical(typeof savedVertical.vertical === 'string' ? savedVertical.vertical : 'APPOINTMENT');
      setState(nextState); setOverview(nextOverview); setBilling(nextBilling); setPlans(nextPlans); setIntegrations(nextIntegrations);
      setReadiness({ services: services.filter(row => row.active).length, staff: staff.filter(row => row.active).length, hours: hourRows.filter(row => row.intervals.length > 0).length });
      const nextMissing = steps.find(step => !(step.key in data));
      setActiveStep(nextState.completed ? 'COMPLETE' : nextMissing?.key ?? 'COMPLETE');
    } catch (caught) {
      setError(message(caught, 'Unable to load onboarding status'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const savedCount = useMemo(() => steps.filter(step => state?.data && step.key in state.data).length, [state]);
  const progress = state?.completed ? 100 : Math.round((savedCount / steps.length) * 100);
  const whatsappReady = integrations?.whatsapp.status === 'CONNECTED';

  function payloadFor(step: WizardStep): Record<string, unknown> {
    if (step === 'BUSINESS_PROFILE') return { businessName: businessName.trim(), timezone };
    if (step === 'VERTICAL') return { vertical };
    if (step === 'WHATSAPP') return { provider: integrations?.whatsapp.provider, status: integrations?.whatsapp.status, phoneE164: integrations?.whatsapp.phoneE164 ?? null };
    if (step === 'SERVICES') return { activeServiceCount: readiness.services };
    if (step === 'STAFF') return { activeStaffCount: readiness.staff };
    return { configuredStaffCount: readiness.hours };
  }

  function canSave(step: WizardStep) {
    if (step === 'BUSINESS_PROFILE') return Boolean(businessName.trim() && timezone.trim());
    if (step === 'VERTICAL') return Boolean(vertical);
    if (step === 'WHATSAPP') return whatsappReady;
    if (step === 'SERVICES') return readiness.services > 0;
    if (step === 'STAFF') return readiness.staff > 0;
    return readiness.hours > 0;
  }

  async function saveStep(step: WizardStep) {
    if (!canSave(step)) return;
    setSaving(true); setError(null);
    try {
      const next = await tenantPut<OnboardingState>(`/onboarding/${step}`, payloadFor(step));
      setState(next); setNotice(`${steps.find(row => row.key === step)?.label} checkpoint saved`);
      const index = steps.findIndex(row => row.key === step);
      setActiveStep(steps[index + 1]?.key ?? 'COMPLETE');
    } catch (caught) {
      setError(message(caught, 'Unable to save onboarding checkpoint'));
    } finally {
      setSaving(false);
    }
  }

  async function complete() {
    setSaving(true); setError(null);
    try {
      const next = await tenantPut<OnboardingState>('/onboarding/COMPLETE', {});
      setState(next); setActiveStep('COMPLETE'); setNotice('Tenant onboarding completed');
    } catch (caught) {
      setError(message(caught, 'Unable to complete onboarding'));
    } finally {
      setSaving(false);
    }
  }

  async function startCheckout(planCode:string){
    setCheckoutPlan(planCode);setError(null);
    try{const checkout=await tenantPost<BillingCheckout>('/billing/checkout',{planCode});setBilling(current=>({checkout,invoices:current?.invoices??[]}));if(!checkout.checkoutUrl)throw new Error('HitPay did not return a checkout URL');window.location.assign(checkout.checkoutUrl);}
    catch(caught){setError(message(caught,'Unable to start HitPay checkout'));setCheckoutPlan(null);}
  }

  const currentPlan = overview?.plan;
  const completionReady = savedCount === steps.length;

  return <>
    <header className="page-header"><div><p className="eyebrow">Tenant activation</p><h1>Onboarding</h1><p className="muted">Finish the six operational checkpoints, then review plan access and monthly quotas.</p></div><button className="secondary-button" disabled={loading} onClick={() => void load()}>{loading ? 'Refreshing…' : 'Refresh readiness'}</button></header>
    {error ? <div className="data-banner error"><strong>Onboarding issue</strong><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div> : null}
    {notice ? <div className="data-banner success"><strong>Updated</strong><span>{notice}</span><button onClick={() => setNotice(null)}>Dismiss</button></div> : null}
    <section className="onboarding-progress workspace-card"><div><span>{state?.completed ? 'Complete' : `${savedCount} of ${steps.length} checkpoints`}</span><strong>{progress}%</strong></div><div className="quota-track"><i style={{ width: `${progress}%` }} /></div></section>
    <div className="onboarding-layout">
      <aside className="workspace-card onboarding-steps">{steps.map((step, index) => { const saved = Boolean(state?.data && step.key in state.data); return <button key={step.key} className={activeStep === step.key ? 'active' : ''} onClick={() => setActiveStep(step.key)}><span className={saved ? 'done' : ''}>{saved ? '✓' : index + 1}</span><div><strong>{step.label}</strong><small>{step.detail}</small></div></button>; })}<button className={activeStep === 'COMPLETE' ? 'active' : ''} onClick={() => setActiveStep('COMPLETE')}><span className={state?.completed ? 'done' : ''}>{state?.completed ? '✓' : 7}</span><div><strong>Review & finish</strong><small>Validate all checkpoints</small></div></button></aside>
      <main className="workspace-card onboarding-stage">
        {loading && !state ? <div className="empty-inline"><strong>Loading onboarding…</strong></div> : null}
        {activeStep === 'BUSINESS_PROFILE' ? <><div className="section-head"><div><p className="eyebrow">Step 1</p><h2>Business profile</h2></div></div><p className="muted">This checkpoint records the tenant identity used during onboarding.</p><div className="settings-form-grid"><label>Business name<input value={businessName} onChange={event => setBusinessName(event.target.value)} /></label><label>Operating timezone<input value={timezone} onChange={event => setTimezone(event.target.value)} /></label></div><button className="primary-button onboarding-save" disabled={saving || !canSave('BUSINESS_PROFILE')} onClick={() => void saveStep('BUSINESS_PROFILE')}>Save & continue</button></> : null}
        {activeStep === 'VERTICAL' ? <><div className="section-head"><div><p className="eyebrow">Step 2</p><h2>Business type</h2></div></div><p className="muted">Choose the closest operating model. Booking core remains shared across verticals.</p><div className="vertical-options">{[{ key: 'APPOINTMENT', title: 'Appointments', text: 'Salon, clinic, consulting and scheduled services' }, { key: 'PROPERTY', title: 'Property', text: 'Rooms, stays and capacity-based properties' }, { key: 'GENERAL', title: 'General', text: 'Flexible service and resource scheduling' }].map(row => <button className={vertical === row.key ? 'selected' : ''} key={row.key} onClick={() => setVertical(row.key)}><strong>{row.title}</strong><small>{row.text}</small></button>)}</div><button className="primary-button onboarding-save" disabled={saving} onClick={() => void saveStep('VERTICAL')}>Save & continue</button></> : null}
        {activeStep === 'WHATSAPP' ? <ReadinessStep eyebrow="Step 3" title="WhatsApp connection" ready={whatsappReady} summary={whatsappReady ? `${integrations?.whatsapp.phoneE164 ?? 'Connected number'} is ready` : `Current status: ${integrations?.whatsapp.status.replaceAll('_', ' ') ?? 'unknown'}`} action="Open connection settings" onAction={() => onNavigate('Settings')}><button className="primary-button" disabled={saving || !whatsappReady} onClick={() => void saveStep('WHATSAPP')}>Confirm & continue</button></ReadinessStep> : null}
        {activeStep === 'SERVICES' ? <ReadinessStep eyebrow="Step 4" title="Service catalogue" ready={readiness.services > 0} summary={`${readiness.services} active service${readiness.services === 1 ? '' : 's'} found`} action="Manage services" onAction={() => onNavigate('Services')}><button className="primary-button" disabled={saving || !canSave('SERVICES')} onClick={() => void saveStep('SERVICES')}>Confirm & continue</button></ReadinessStep> : null}
        {activeStep === 'STAFF' ? <ReadinessStep eyebrow="Step 5" title="Staff directory" ready={readiness.staff > 0} summary={`${readiness.staff} active staff member${readiness.staff === 1 ? '' : 's'} found`} action="Manage staff" onAction={() => onNavigate('Staff')}><button className="primary-button" disabled={saving || !canSave('STAFF')} onClick={() => void saveStep('STAFF')}>Confirm & continue</button></ReadinessStep> : null}
        {activeStep === 'HOURS' ? <ReadinessStep eyebrow="Step 6" title="Working hours" ready={readiness.hours > 0} summary={`${readiness.hours} staff schedule${readiness.hours === 1 ? '' : 's'} configured`} action="Manage working hours" onAction={() => onNavigate('Staff')}><button className="primary-button" disabled={saving || !canSave('HOURS')} onClick={() => void saveStep('HOURS')}>Confirm & review</button></ReadinessStep> : null}
        {activeStep === 'COMPLETE' ? <section className="onboarding-review"><span className={state?.completed ? 'review-icon complete' : 'review-icon'}>{state?.completed ? '✓' : '6'}</span><p className="eyebrow">Review</p><h2>{state?.completed ? 'Tenant onboarding is complete' : completionReady ? 'Ready to activate' : 'Checkpoints remain'}</h2><p className="muted">{state?.completed ? 'All onboarding checkpoints are stored and the tenant is ready for operational UAT.' : completionReady ? 'All required checkpoints are recorded. Complete onboarding to lock the current activation state.' : `${steps.length - savedCount} checkpoint${steps.length - savedCount === 1 ? '' : 's'} must still be saved.`}</p>{!state?.completed ? <button className="primary-button" disabled={saving || !completionReady} onClick={() => void complete()}>{saving ? 'Completing…' : 'Complete onboarding'}</button> : null}</section> : null}
      </main>
      <PlanPanel overview={overview} billing={billing} plans={plans} currentPlan={currentPlan} checkoutPlan={checkoutPlan} onCheckout={startCheckout}/>
    </div>
  </>;
}

function PlanPanel({overview,billing,plans,currentPlan,checkoutPlan,onCheckout}:{overview:TenantPlanOverview|null;billing:BillingOverview|null;plans:SaaSPlan[];currentPlan:SaaSPlan|null|undefined;checkoutPlan:string|null;onCheckout:(planCode:string)=>Promise<void>}){
  const pending=billing?.checkout&&['PENDING','ACTION_REQUIRED'].includes(billing.checkout.status)?billing.checkout:null;
  return <aside className="workspace-card plan-panel">
    <div className="section-head"><div><p className="eyebrow">Plan & billing</p><h2>{currentPlan?.name??'Choose a plan'}</h2></div>{overview?.subscription?<span className={`settings-status ${['ACTIVE','TRIAL'].includes(overview.subscription.status)?'configured':''}`}>{overview.subscription.status}</span>:pending?<span className="settings-status">{pending.status.replaceAll('_',' ')}</span>:null}</div>
    {pending?<div className="billing-pending"><strong>HitPay confirmation pending</strong><span>WSadmin will activate this plan only after a verified payment webhook.</span>{pending.checkoutUrl?<a href={pending.checkoutUrl}>Continue checkout</a>:null}</div>:null}
    {currentPlan?<><strong className="plan-price">{money(currentPlan.monthlyPriceMinor,currentPlan.currency)}<small>/ month</small></strong><p className="muted">Usage period {overview?.periodKey}</p><div className="quota-list">{overview?.quotas.map(row=><div key={row.key}><div><strong>{label(row.key)}</strong><span>{row.kind==='QUOTA'?`${row.used??0} / ${row.limit??0}`:row.enabled?'Included':'Unavailable'}</span></div>{row.kind==='QUOTA'?<div className="quota-track"><i style={{width:`${Math.min(100,((row.used??0)/Math.max(1,row.limit??1))*100)}%`}}/></div>:<span className={row.enabled?'feature-state enabled':'feature-state'}>{row.enabled?'Enabled':'Disabled'}</span>}</div>)}</div></>:<div className="available-plans"><p className="muted">Monthly subscription paid securely through HitPay.</p>{plans.filter(plan=>plan.monthlyPriceMinor>0).map(plan=><div className="billing-plan" key={plan.id}><div><strong>{plan.name}</strong><span>{money(plan.monthlyPriceMinor,plan.currency)} / month</span></div><button className="primary-button" disabled={Boolean(checkoutPlan)||Boolean(pending)||authenticationMode()!=='GOOGLE'} onClick={()=>void onCheckout(plan.code)}>{pending?'Checkout pending':checkoutPlan===plan.code?'Opening…':'Subscribe'}</button></div>)}{!plans.some(plan=>plan.monthlyPriceMinor>0)?<small className="billing-help">No paid plan has been published yet. The System Owner must approve pricing before checkout can open.</small>:authenticationMode()!=='GOOGLE'?<small className="billing-help">Paid checkout becomes available after secure Google tenant login is enabled.</small>:null}</div>}
  </aside>;
}

function ReadinessStep({ eyebrow, title, ready, summary, action, onAction, children }: { eyebrow: string; title: string; ready: boolean; summary: string; action: string; onAction: () => void; children: React.ReactNode }) {
  return <section className="readiness-step"><div className={ready ? 'readiness-icon ready' : 'readiness-icon'}>{ready ? '✓' : '!'}</div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p className="muted">{summary}</p><div className="readiness-actions"><button className="secondary-button" onClick={onAction}>{action}</button>{children}</div>{!ready ? <small className="readiness-help">Complete this configuration, then use Refresh readiness before continuing.</small> : null}</section>;
}
