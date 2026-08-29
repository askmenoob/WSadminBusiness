import { useEffect, useMemo, useState } from 'react';
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
import { authLogout, loadAuthentication, uatRole, type AuthConfig, type AuthSession } from './api';

const initials:Record<string,string>={Dashboard:'D','AI Inbox':'AI',Calendar:'C',Bookings:'B',Customers:'CU',Staff:'ST',Services:'SV',Resources:'R',Locations:'L',Payments:'P',Automation:'AU',Marketing:'M',Reports:'RP',Onboarding:'ON',Settings:'S','System Owner':'SO'};
const userInitials=(name:string|null|undefined,email:string|undefined)=>String(name||email||'User').split(/\s+/).slice(0,2).map(value=>value[0]?.toUpperCase()??'').join('');

export function App(){
  const [active,setActive]=useState('Dashboard');
  const [mobileOpen,setMobileOpen]=useState(false);
  const [auth,setAuth]=useState<{loading:boolean;config:AuthConfig|null;session:AuthSession|null;error:string|null}>({loading:true,config:null,session:null,error:null});
  const publicTenantId=window.location.pathname.match(/^\/book\/([^/]+)\/?$/)?.[1];

  useEffect(()=>{if(publicTenantId)return;let mounted=true;void loadAuthentication().then(result=>{if(!mounted)return;setAuth({loading:false,config:result.config,session:result.session,error:null});if(result.session?.role==='SYSTEM_OWNER')setActive('System Owner');else if(result.session&&!result.session.onboardingCompleted)setActive('Onboarding');}).catch(error=>{if(mounted)setAuth({loading:false,config:null,session:null,error:error instanceof Error?error.message:'Authentication is unavailable'});});return()=>{mounted=false;};},[publicTenantId]);

  const systemOwner=uatRole==='SYSTEM_OWNER';
  const groups=useMemo(()=>systemOwner?[{label:'Platform',items:['System Owner']}]:[
    {label:'Workspace',items:['Dashboard','AI Inbox','Calendar','Bookings','Customers']},
    {label:'Business',items:['Staff','Services','Resources','Locations']},
    {label:'Growth',items:['Payments','Automation','Marketing','Reports']},
    {label:'Platform',items:['Onboarding','Settings']},
  ],[systemOwner,auth.session?.role]);
  const open=(module:string)=>{setActive(module);setMobileOpen(false);};
  const setup=['Staff','Services','Resources','Locations'].includes(active),revenue=['Payments','Automation','Marketing'].includes(active);

  if(publicTenantId)return <PublicBookingWorkspace tenantId={decodeURIComponent(publicTenantId)}/>;
  if(auth.loading)return <AuthLoading/>;
  if(auth.error)return <AuthFailure message={auth.error}/>;
  if(auth.config?.mode==='GOOGLE'&&!auth.session)return <LoginScreen configured={auth.config.googleConfigured}/>;

  const tenantName=auth.session?.tenant?.name??(systemOwner?'WSadmin Platform':'WSadmin Business UAT');
  const identity=auth.session?.user;
  const logout=async()=>{await authLogout();setAuth(current=>({...current,session:null}));};

  return <>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <div className="app-shell">
      <aside className={`app-sidebar ${mobileOpen?'open':''}`} aria-label="Primary navigation">
        <div className="brand-row"><div className="brand-mark">WS</div><div className="brand-copy"><strong>WSadmin</strong><span>Business</span></div><button className="mobile-close" onClick={()=>setMobileOpen(false)} aria-label="Close navigation">×</button></div>
        <div className="tenant-switch"><span className="tenant-avatar">{systemOwner?'SO':'WB'}</span><div><strong>{tenantName}</strong><small>{uatRole.replaceAll('_',' ')} · Malaysia</small></div><span className="chevron">⌄</span></div>
        <nav aria-label="Product modules">{groups.map(group=><div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map(module=><button key={module} className={active===module?'active':''} aria-current={active===module?'page':undefined} onClick={()=>open(module)}><span className="nav-icon">{initials[module]}</span><span>{module}</span>{module==='AI Inbox'?<em>2</em>:null}</button>)}</div>)}</nav>
        <div className="sidebar-footer"><div className="connection-line"><i/><span>{auth.config?.mode==='GOOGLE'?'Secure tenant session':'UAT services online'}</span></div><small>WSadmin Business · dev</small></div>
      </aside>
      {mobileOpen?<button className="sidebar-scrim" onClick={()=>setMobileOpen(false)} aria-label="Close navigation"/>:null}
      <main className="app-main" id="main-content" tabIndex={-1}>
        <div className="mobile-top"><button className="menu-button" onClick={()=>setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen}>☰</button><div className="mobile-brand">WSadmin <span>Business</span></div></div>
        <div className="topbar"><div className="breadcrumb"><span>WSadmin Business</span><b>/</b><strong>{active}</strong></div><div className="top-actions"><button className="search-button">Search <kbd>⌘K</kbd></button><button className="secondary-button">Help</button>{!systemOwner?<button className="primary-button" onClick={()=>open('Bookings')}>+ New booking</button>:null}{auth.session?<button className="logout-button" aria-label={`Log out ${identity?.email}`} title={identity?.email} onClick={()=>void logout()}><span className="logout-avatar" aria-hidden="true">{userInitials(identity?.displayName,identity?.email)}</span><span>Log out</span></button>:<button className="avatar-button" aria-label="UAT account">KN</button>}</div></div>
        <div className="page-wrap">
          {active==='Dashboard'?<DashboardPreview/>
            :active==='AI Inbox'?<AIInbox/>
            :active==='Calendar'?<LiveCalendar/>
            :active==='Bookings'?<BookingsWorkspace/>
            :active==='Customers'?<CustomersWorkspace/>
            :setup?<BusinessSetupWorkspace initialTab={active as 'Staff'|'Services'|'Resources'|'Locations'}/>
            :revenue?<RevenueAutomationWorkspace module={active as RevenueTab}/>
            :active==='Reports'?<ReportsWorkspace/>
            :active==='Onboarding'?<OnboardingWorkspace onNavigate={open}/>
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
function LoginScreen({configured}:{configured:boolean}){const state=new URLSearchParams(window.location.search).get('auth');return <main className="auth-shell"><section className="auth-card login-card"><div className="brand-mark">WS</div><p className="eyebrow">Tenant access</p><h1>Sign in to WSadmin Business</h1><p className="muted">Use your verified Google account. Your first sign-in creates one isolated business tenant and starts the setup wizard.</p>{state&&state!=='success'?<div className="auth-notice">Google sign-in was not completed. Please try again.</div>:null}<a className={`google-login ${configured?'':'disabled'}`} href={configured?'/api/v1/auth/google/start':undefined} aria-disabled={!configured}><span>G</span>Continue with Google</a>{!configured?<small>Google login is awaiting server credentials.</small>:<small>WSadmin never receives your Google password.</small>}</section></main>;}
