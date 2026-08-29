import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBusinessTypeDefinition } from '@wsadmin-business/verticals';
import { AIInbox } from './AIInbox';
import { BusinessSetupWorkspace } from './BusinessSetupWorkspace';
import { BookingsWorkspace } from './BookingsWorkspace';
import { CustomersWorkspace } from './CustomersWorkspace';
import { DashboardPreview } from './DashboardPreview';
import { LiveCalendar } from './LiveCalendar';
import { OnboardingWorkspace } from './OnboardingWorkspace';
import { PublicBookingWorkspace } from './PublicBookingWorkspace';
import { ReportsWorkspace } from './ReportsWorkspace';
import { RevenueAutomationWorkspace, type RevenueTab } from './RevenueAutomationWorkspace';
import { SettingsWorkspace } from './SettingsWorkspace';
import { SystemOwnerWorkspace } from './SystemOwnerWorkspace';
import { TailoredOfferingsWorkspace } from './TailoredOfferingsWorkspace';
import { authLogout, loadAuthentication, tenantGet, uatRole, type AuthConfig, type AuthSession, type TenantBusinessContext } from './api';

const initials:Record<string,string>={Dashboard:'D','AI Inbox':'AI',Calendar:'C',Bookings:'B',Customers:'CU',Staff:'ST',Services:'SV',Resources:'R',Locations:'L',Payments:'P',Automation:'AU',Marketing:'M',Reports:'RP',Onboarding:'ON',Settings:'S','System Owner':'SO'};
const userInitials=(name:string|null|undefined,email:string|undefined)=>String(name||email||'User').split(/\s+/).slice(0,2).map(value=>value[0]?.toUpperCase()??'').join('');
const daysRemaining=(value:string|null|undefined)=>value?Math.max(0,Math.ceil((new Date(value).getTime()-Date.now())/(24*60*60_000))):0;

export function App(){
  const [active,setActive]=useState('Dashboard');
  const [mobileOpen,setMobileOpen]=useState(false);
  const [auth,setAuth]=useState<{loading:boolean;config:AuthConfig|null;session:AuthSession|null;error:string|null}>({loading:true,config:null,session:null,error:null});
  const [businessContext,setBusinessContext]=useState<TenantBusinessContext|null>(null);
  const publicTenantId=window.location.pathname.match(/^\/book\/([^/]+)\/?$/)?.[1];
  const systemOwner=(auth.session?.role??uatRole)==='SYSTEM_OWNER';

  useEffect(()=>{if(publicTenantId)return;let mounted=true;void loadAuthentication().then(result=>{if(!mounted)return;setAuth({loading:false,config:result.config,session:result.session,error:null});if(result.session?.role==='SYSTEM_OWNER')setActive('System Owner');else if(result.session&&!result.session.onboardingCompleted)setActive('Onboarding');}).catch(error=>{if(mounted)setAuth({loading:false,config:null,session:null,error:error instanceof Error?error.message:'Authentication is unavailable'});});return()=>{mounted=false;};},[publicTenantId]);

  const refreshBusinessContext=useCallback(async()=>{if(systemOwner)return;try{setBusinessContext(await tenantGet<TenantBusinessContext>('/business-context'));}catch{setBusinessContext(null);}},[systemOwner]);
  useEffect(()=>{if(publicTenantId||auth.loading||systemOwner||auth.config?.mode==='GOOGLE'&&!auth.session)return;void refreshBusinessContext();},[auth.config?.mode,auth.loading,auth.session,publicTenantId,refreshBusinessContext,systemOwner]);

  const offeringModule=businessContext?.labels.offeringPlural??'Services';
  const businessDefinition=businessContext?getBusinessTypeDefinition(businessContext.businessType):null;
  const needsStaff=Boolean(businessDefinition?.offeringFields.includes('STAFF'));
  const needsResources=Boolean(businessContext&&businessContext.offeringKind!=='PROPERTY'&&businessContext.offeringKind!=='PRODUCT');
  const configuredWorkflows=businessContext?((businessContext.setupConfig.workflow as {workflowKinds?:string[]}|undefined)?.workflowKinds??[businessContext.workflowKind]):[];
  const bookingCompatible=Boolean(businessContext&&businessContext.offeringKind!=='PROPERTY'&&businessContext.offeringKind!=='PRODUCT'&&configuredWorkflows.some(workflow=>['APPOINTMENT','BOOKING','RESERVATION'].includes(workflow)));
  const groups=useMemo(()=>systemOwner?[{label:'Platform',items:['System Owner']}]:[
    {label:'Workspace',items:['Dashboard','AI Inbox',...(bookingCompatible?['Calendar','Bookings']:[]),'Customers']},
    {label:'Business',items:businessContext?[...(needsStaff?['Staff']:[]),offeringModule,...(needsResources?['Resources']:[]),'Locations']:['Staff','Services','Resources','Locations']},
    {label:'Growth',items:['Payments','Automation','Marketing','Reports']},
    {label:'Platform',items:['Onboarding','Settings']},
  ],[bookingCompatible,businessContext,needsResources,needsStaff,offeringModule,systemOwner]);
  const open=(module:string)=>{setActive(module);setMobileOpen(false);};
  const setup=['Staff','Services','Resources','Locations'].includes(active),revenue=['Payments','Automation','Marketing'].includes(active);
  const tailoredOffering=Boolean(businessContext&&active===offeringModule&&offeringModule!=='Services');
  const logout=async()=>{await authLogout();setAuth(current=>({...current,session:null}));};

  if(publicTenantId)return <PublicBookingWorkspace tenantId={decodeURIComponent(publicTenantId)}/>;
  if(auth.loading)return <AuthLoading/>;
  if(auth.error)return <AuthFailure message={auth.error}/>;
  if(auth.config?.mode==='GOOGLE'&&!auth.session)return <LoginScreen configured={auth.config.googleConfigured} trialDays={auth.config.trialDays}/>;
  if(auth.session?.subscription?.trialExpired)return <TrialExpiredScreen trialEndsAt={auth.session.subscription.trialEndsAt} onLogout={logout}/>;

  const tenantName=auth.session?.tenant?.name??(systemOwner?'WSadmin Platform':'WSadmin Business UAT');
  const identity=auth.session?.user;
  const trialDaysLeft=auth.session?.subscription?.status==='TRIAL'?daysRemaining(auth.session.subscription.trialEndsAt):null;

  return <>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <div className="app-shell">
      <aside className={`app-sidebar ${mobileOpen?'open':''}`} aria-label="Primary navigation">
        <div className="brand-row"><div className="brand-mark">WS</div><div className="brand-copy"><strong>WSadmin</strong><span>Business</span></div><button className="mobile-close" onClick={()=>setMobileOpen(false)} aria-label="Close navigation">×</button></div>
        <div className="tenant-switch"><span className="tenant-avatar">{systemOwner?'SO':'WB'}</span><div><strong>{tenantName}</strong><small>{uatRole.replaceAll('_',' ')} · Malaysia</small></div><span className="chevron">⌄</span></div>
        <nav aria-label="Product modules">{groups.map(group=><div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map(module=><button key={module} className={active===module?'active':''} aria-current={active===module?'page':undefined} onClick={()=>open(module)}><span className="nav-icon">{initials[module]??module.split(/\s+/).map(word=>word[0]).join('').slice(0,2).toUpperCase()}</span><span>{module}</span>{module==='AI Inbox'?<em>2</em>:null}</button>)}</div>)}</nav>
        <div className="sidebar-footer"><div className="connection-line"><i/><span>{auth.config?.mode==='GOOGLE'?'Secure tenant session':'UAT services online'}</span></div><small>WSadmin Business · dev</small></div>
      </aside>
      {mobileOpen?<button className="sidebar-scrim" onClick={()=>setMobileOpen(false)} aria-label="Close navigation"/>:null}
      <main className="app-main" id="main-content" tabIndex={-1}>
        <div className="mobile-top"><button className="menu-button" onClick={()=>setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen}>☰</button><div className="mobile-brand">WSadmin <span>Business</span></div></div>
        <div className="topbar"><div className="breadcrumb"><span>WSadmin Business</span><b>/</b><strong>{active}</strong></div><div className="top-actions">{trialDaysLeft!==null?<span className="trial-pill">Trial · {trialDaysLeft} day{trialDaysLeft===1?'':'s'} left</span>:null}<button className="search-button">Search <kbd>⌘K</kbd></button><button className="secondary-button">Help</button>{!systemOwner?(bookingCompatible?<button className="primary-button" onClick={()=>open('Bookings')}>+ New {businessContext?.labels.transactionSingular.toLowerCase()}</button>:businessContext?<button className="primary-button" onClick={()=>open(offeringModule)}>Manage {offeringModule.toLowerCase()}</button>:null):null}{auth.session?<button className="logout-button" aria-label={`Log out ${identity?.email}`} title={identity?.email} onClick={()=>void logout()}><span className="logout-avatar" aria-hidden="true">{userInitials(identity?.displayName,identity?.email)}</span><span>Log out</span></button>:<button className="avatar-button" aria-label="UAT account">KN</button>}</div></div>
        <div className="page-wrap">
          {active==='Dashboard'?<DashboardPreview businessContext={businessContext} onNavigate={open}/>
            :active==='AI Inbox'?<AIInbox/>
            :active==='Calendar'?<LiveCalendar/>
            :active==='Bookings'?<BookingsWorkspace/>
            :active==='Customers'?<CustomersWorkspace/>
            :tailoredOffering&&businessContext?<TailoredOfferingsWorkspace context={businessContext} onNavigate={open}/>
            :setup?<BusinessSetupWorkspace initialTab={active as 'Staff'|'Services'|'Resources'|'Locations'}/>
            :revenue?<RevenueAutomationWorkspace module={active as RevenueTab}/>
            :active==='Reports'?<ReportsWorkspace/>
            :active==='Onboarding'?<OnboardingWorkspace onNavigate={open} onBusinessTypeChange={()=>void refreshBusinessContext()} ownerEmail={identity?.email} trialDays={auth.config?.trialDays??10}/>
            :active==='Settings'?<SettingsWorkspace/>
            :active==='System Owner'?<SystemOwnerWorkspace/>
            :null}
        </div>
      </main>
    </div>
  </>;
}

function AuthLoading(){return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">WS</div><p className="eyebrow">WSadmin Business</p><h1>Checking secure session…</h1><p className="muted">Preparing the correct tenant workspace.</p></section></main>;}
function AuthFailure({message}:{message:string}){return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">!</div><p className="eyebrow">Connection issue</p><h1>Unable to verify this session</h1><p className="muted">{message}</p><button className="primary-button" onClick={()=>window.location.reload()}>Try again</button></section></main>;}
function GoogleLogo(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.42l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.51H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.49l3.35-2.62Z"/><path fill="#EA4335" d="M12 6c1.47 0 2.79.51 3.82 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.62C7.18 7.76 9.39 6 12 6Z"/></svg>}
function LoginScreen({configured,trialDays}:{configured:boolean;trialDays:number}){
  const state=new URLSearchParams(window.location.search).get('auth');
  return <main className="auth-shell auth-login-shell">
    <div className="login-layout">
      <section className="login-story" aria-label="About WSadmin Business">
        <div className="login-brand"><div className="brand-mark">WS</div><div><strong>WSadmin</strong><span>Business</span></div></div>
        <div className="login-story-copy">
          <h1>Your business,<br/>ready to run.</h1>
          <p>Build the right workspace for your industry, then manage every customer conversation and operation from one place.</p>
        </div>
        <ol className="login-benefits">
          <li><span>01</span><div><strong>Choose your business type</strong><small>Your dashboard adapts to your actual workflow.</small></div></li>
          <li><span>02</span><div><strong>Configure what you offer</strong><small>Add services, products, properties, pricing and availability.</small></div></li>
          <li><span>03</span><div><strong>Put WhatsApp AI to work</strong><small>Give customers accurate answers based on your setup.</small></div></li>
        </ol>
        <p className="login-story-foot">Built for service businesses in Malaysia</p>
      </section>
      <section className="auth-card login-card">
        <div className="login-card-brand"><div className="brand-mark">WS</div><strong>WSadmin Business</strong></div>
        <div className="trial-label"><span/>Free {trialDays}-day trial</div>
        <h2>Set up your business</h2>
        <p className="muted">Sign in with Google to create your secure tenant workspace. No payment or card is required to start.</p>
        {state&&state!=='success'?<div className="auth-notice" role="alert">Google sign-in was not completed. Please try again.</div>:null}
        <a className={`google-login ${configured?'':'disabled'}`} href={configured?'/api/v1/auth/google/start':undefined} aria-disabled={!configured}><GoogleLogo/><span>Continue with Google</span></a>
        <div className="login-assurance" aria-label="Trial assurances"><span>10-day access</span><span>No card required</span><span>Secure Google sign-in</span></div>
        {!configured?<small>Google login is awaiting server credentials.</small>:<small>WSadmin never receives or stores your Google password.</small>}
      </section>
    </div>
  </main>;
}
function TrialExpiredScreen({trialEndsAt,onLogout}:{trialEndsAt:string|null;onLogout:()=>Promise<void>}){return <main className="auth-shell"><section className="auth-card trial-expired-card"><div className="brand-mark">WS</div><p className="eyebrow">Free trial ended</p><h1>Your WSadmin Business trial has ended</h1><p className="muted">The trial ended {trialEndsAt?new Intl.DateTimeFormat('en-MY',{dateStyle:'long'}).format(new Date(trialEndsAt)):'recently'}. Your company data remains isolated and unchanged. Contact the System Owner when you are ready to reactivate access.</p><button className="secondary-button" onClick={()=>void onLogout()}>Log out</button></section></main>;}
