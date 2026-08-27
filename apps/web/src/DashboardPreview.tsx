const bookings=[
  {time:'10:00',customer:'Fatin Rahman',service:'Glow Facial',staff:'Aina',status:'Confirmed'},
  {time:'12:00',customer:'Aisyah Omar',service:'Facial Treatment',staff:'Sarah',status:'Confirmed'},
  {time:'14:00',customer:'Hana Lee',service:'Deep Tissue',staff:'Aina',status:'Pending'},
  {time:'17:00',customer:'Siti Noor',service:'Aromatherapy',staff:'Sarah',status:'Confirmed'}
];
export function DashboardPreview(){return <>
  <header><div><p className="eyebrow">WSadmin Business</p><h1>Good evening · business overview</h1><p className="muted">Today’s bookings, utilization and attention items from one operational view.</p></div><div className="status">31 Aug · Kuala Lumpur</div></header>
  <section className="metric-grid">
    <article className="metric-card"><div><small>Today bookings</small><strong>8</strong></div><span className="metric-note positive">5 confirmed</span></article>
    <article className="metric-card"><div><small>Utilization</small><strong>42%</strong></div><span className="metric-note">340 / 810 min</span></article>
    <article className="metric-card"><div><small>Needs attention</small><strong>2</strong></div><span className="metric-note warning">2 pending</span></article>
    <article className="metric-card"><div><small>Cancellations</small><strong>1</strong></div><span className="metric-note">Today</span></article>
  </section>
  <section className="dashboard-grid"><article className="dashboard-table-card"><div className="section-head"><div><p className="eyebrow">Today</p><h2>Upcoming bookings</h2></div><button className="text-button">View calendar →</button></div><div className="booking-list">{bookings.map(b=><div className="booking-row" key={`${b.time}-${b.customer}`}><time>{b.time}</time><div><strong>{b.customer}</strong><small>{b.service}</small></div><div><strong>{b.staff}</strong><small>Staff</small></div><span className={`booking-status ${b.status.toLowerCase()}`}>{b.status}</span></div>)}</div></article>
  <aside className="attention-card"><p className="eyebrow">Attention</p><h2>What needs action</h2><div className="attention-item"><span>2</span><div><strong>Pending confirmations</strong><small>Customers waiting for approval</small></div></div><div className="attention-item muted-item"><span>0</span><div><strong>No-shows</strong><small>No follow-up required today</small></div></div><div className="attention-item"><span>1</span><div><strong>Cancellation</strong><small>Review capacity released</small></div></div></aside></section>
</>}
