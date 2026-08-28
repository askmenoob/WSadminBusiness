import { useMemo, useState } from 'react';
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
import { uatRole } from './api';

const initials: Record<string, string> = {
  Dashboard: 'D', 'AI Inbox': 'AI', Calendar: 'C', Bookings: 'B', Customers: 'CU', Staff: 'ST', Services: 'SV', Resources: 'R', Locations: 'L', Payments: 'P', Automation: 'AU', Marketing: 'M', Reports: 'RP', Onboarding: 'ON', Settings: 'S', 'System Owner': 'SO',
};

export function App() {
  const [active, setActive] = useState('Dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const publicTenantId = window.location.pathname.match(/^\/book\/([^/]+)\/?$/)?.[1];
  const groups = useMemo(() => [
    { label: 'Workspace', items: ['Dashboard', 'AI Inbox', 'Calendar', 'Bookings', 'Customers'] },
    { label: 'Business', items: ['Staff', 'Services', 'Resources', 'Locations'] },
    { label: 'Growth', items: ['Payments', 'Automation', 'Marketing', 'Reports'] },
    { label: 'Platform', items: ['Onboarding', 'Settings', ...(uatRole === 'SYSTEM_OWNER' ? ['System Owner'] : [])] },
  ], []);
  const open = (module: string) => { setActive(module); setMobileOpen(false); };
  const setup = ['Staff', 'Services', 'Resources', 'Locations'].includes(active);
  const revenue = ['Payments', 'Automation', 'Marketing'].includes(active);

  if (publicTenantId) return <PublicBookingWorkspace tenantId={decodeURIComponent(publicTenantId)} />;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className={`app-sidebar ${mobileOpen ? 'open' : ''}`} aria-label="Primary navigation">
      <div className="brand-row"><div className="brand-mark">WS</div><div className="brand-copy"><strong>WSadmin</strong><span>Business</span></div><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation">×</button></div>
      <div className="tenant-switch"><span className="tenant-avatar">WB</span><div><strong>WSadmin Business UAT</strong><small>{uatRole.replaceAll('_', ' ')} · Kuala Lumpur</small></div><span className="chevron">⌄</span></div>
      <nav aria-label="Product modules">{groups.map(group => <div className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map(module => <button key={module} className={active === module ? 'active' : ''} aria-current={active === module ? 'page' : undefined} onClick={() => open(module)}><span className="nav-icon">{initials[module]}</span><span>{module}</span>{module === 'AI Inbox' && <em>2</em>}</button>)}</div>)}</nav>
      <div className="sidebar-footer"><div className="connection-line"><i /><span>UAT services online</span></div><small>WSadmin Business · dev</small></div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    <main className="app-main" id="main-content" tabIndex={-1}>
      <div className="mobile-top"><button className="menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen}>☰</button><div className="mobile-brand">WSadmin <span>Business</span></div></div>
      <div className="topbar"><div className="breadcrumb"><span>WSadmin Business</span><b>/</b><strong>{active}</strong></div><div className="top-actions"><button className="search-button">Search <kbd>⌘K</kbd></button><button className="secondary-button">Help</button><button className="primary-button" onClick={() => open('Bookings')}>+ New booking</button><button className="avatar-button" aria-label="Account">KN</button></div></div>
      <div className="page-wrap">
        {active === 'Dashboard' ? <DashboardPreview />
          : active === 'AI Inbox' ? <AIInbox />
          : active === 'Calendar' ? <LiveCalendar />
          : active === 'Bookings' ? <BookingsWorkspace />
          : active === 'Customers' ? <CustomersWorkspace />
          : setup ? <BusinessSetupWorkspace initialTab={active as 'Staff' | 'Services' | 'Resources' | 'Locations'} />
          : revenue ? <RevenueAutomationWorkspace module={active as RevenueTab} />
          : active === 'Reports' ? <ReportsWorkspace />
          : active === 'Onboarding' ? <OnboardingWorkspace onNavigate={open} />
          : active === 'Settings' ? <SettingsWorkspace />
          : active === 'System Owner' ? <SystemOwnerWorkspace />
          : null}
      </div>
    </main>
  </div>;
}
