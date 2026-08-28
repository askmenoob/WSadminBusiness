import { useCallback, useEffect, useMemo, useState } from 'react';
import { tenantGet, type BusinessReportSnapshot } from './api';

const pad = (value: number) => String(value).padStart(2, '0');
const localDate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const firstOfMonth = () => { const date = new Date(); date.setDate(1); return localDate(date); };
const money = (amountMinor: number, currency: string) => new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(amountMinor / 100);
const integer = (value: number) => new Intl.NumberFormat('en-MY').format(value);
const shortDate = (value: string) => new Intl.DateTimeFormat('en-MY', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`));
const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export function ReportsWorkspace() {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(localDate);
  const [report, setReport] = useState<BusinessReportSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ from, to });
      setReport(await tenantGet<BusinessReportSnapshot>(`/reports/overview?${query}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load report');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);
  const chartMax = useMemo(() => Math.max(1, ...(report?.daily.map(point => point.revenueMinor - point.refundedMinor) ?? [1])), [report]);
  const bookingMax = useMemo(() => Math.max(1, ...(report?.daily.map(point => point.bookings) ?? [1])), [report]);

  function downloadCsv() {
    if (!report) return;
    const rows = [
      ['Date', 'Bookings', 'Completed', `Gross revenue (${report.currency})`, `Refunded (${report.currency})`, `Net revenue (${report.currency})`],
      ...report.daily.map(point => [point.localDate, point.bookings, point.completed, (point.revenueMinor / 100).toFixed(2), (point.refundedMinor / 100).toFixed(2), ((point.revenueMinor - point.refundedMinor) / 100).toFixed(2)]),
    ];
    const blob = new Blob([rows.map(row => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `wsadmin-business-report-${report.from}-${report.to}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <>
    <header className="page-header">
      <div><p className="eyebrow">Business intelligence</p><h1>Reports</h1><p className="muted">Tenant-safe operational metrics across bookings, revenue, capacity, customers, automation and AI.</p></div>
      <div className="header-actions"><button className="secondary-button" disabled={!report} onClick={downloadCsv}>Download CSV</button><button className="primary-button" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Run report'}</button></div>
    </header>
    {error ? <div className="data-banner error"><strong>Report unavailable</strong><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div> : null}
    <section className="report-filter"><div><label>From<input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} /></label></div><span>{report ? `${report.timezone} · ${report.daily.length} days` : 'Select a reporting range'}</span></section>
    {loading && !report ? <section className="metric-grid">{[1, 2, 3, 4].map(value => <article className="metric-card skeleton" key={value}><div><small>Loading</small><strong>—</strong></div></article>)}</section> : report ? <>
      <section className="metric-grid">
        <article className="metric-card"><div><small>Net revenue</small><strong>{money(report.revenue.netMinor, report.currency)}</strong></div><span className="metric-note">{report.revenue.paidCount} paid transactions</span></article>
        <article className="metric-card"><div><small>Bookings</small><strong>{integer(report.bookings.total)}</strong></div><span className="metric-note positive">{report.bookings.completed} completed</span></article>
        <article className="metric-card"><div><small>Utilization</small><strong>{report.utilization.percentage}%</strong></div><span className="metric-note">{integer(report.utilization.bookedMinutes)} / {integer(report.utilization.scheduledMinutes)} min</span></article>
        <article className="metric-card"><div><small>Repeat rate</small><strong>{report.customers.repeatRatePercentage}%</strong></div><span className="metric-note">{report.customers.repeatCustomers} repeat customers</span></article>
      </section>
      <section className="workspace-card report-chart-card">
        <div className="section-head"><div><p className="eyebrow">Daily trend</p><h2>Bookings and net revenue</h2></div><span className="demo-chip">Live API</span></div>
        <div className="report-chart-scroll"><div className="report-chart" style={{ minWidth: `${Math.max(720, report.daily.length * 30)}px` }}>{report.daily.map(point => { const net = point.revenueMinor - point.refundedMinor; return <div className="report-day" key={point.localDate} title={`${shortDate(point.localDate)} · ${point.bookings} bookings · ${money(net, report.currency)}`}><div className="report-bars"><i className="revenue-bar" style={{ height: `${net > 0 ? Math.max(3, net / chartMax * 100) : 0}%` }} /><i className="booking-bar" style={{ height: `${point.bookings ? Math.max(3, point.bookings * 100 / bookingMax) : 0}%` }} /></div><small>{shortDate(point.localDate)}</small></div>; })}</div></div>
        <div className="report-legend"><span><i className="revenue-key"/>Net revenue</span><span><i className="booking-key"/>Bookings</span></div>
      </section>
      <div className="report-card-grid">
        <section className="workspace-card report-detail-card"><p className="eyebrow">Booking outcomes</p><h2>{report.bookings.total} bookings</h2><div className="report-stats"><span><b>{report.bookings.confirmed}</b>Confirmed</span><span><b>{report.bookings.completed}</b>Completed</span><span><b>{report.bookings.pending}</b>Pending</span><span><b>{report.bookings.cancelled}</b>Cancelled</span><span><b>{report.bookings.noShow}</b>No-show</span></div></section>
        <section className="workspace-card report-detail-card"><p className="eyebrow">Revenue</p><h2>{money(report.revenue.netMinor, report.currency)} net</h2><div className="report-stats"><span><b>{money(report.revenue.grossMinor, report.currency)}</b>Gross</span><span><b>{money(report.revenue.refundedMinor, report.currency)}</b>Refunded</span><span><b>{report.revenue.paidCount}</b>Paid</span></div></section>
        <section className="workspace-card report-detail-card"><p className="eyebrow">Customers</p><h2>{report.customers.total} active profiles</h2><div className="report-stats"><span><b>{report.customers.newCustomers}</b>New</span><span><b>{report.customers.engagedCustomers}</b>Visited</span><span><b>{report.customers.repeatCustomers}</b>Repeat</span></div></section>
        <section className="workspace-card report-detail-card"><p className="eyebrow">Automation</p><h2>{report.automation.total} jobs</h2><div className="report-stats"><span><b>{report.automation.dispatched}</b>Dispatched</span><span><b>{report.automation.queued}</b>Queued</span><span><b>{report.automation.skipped}</b>Skipped</span><span><b>{report.automation.failed}</b>Failed</span></div></section>
        <section className="workspace-card report-detail-card"><p className="eyebrow">AI operations</p><h2>{report.ai.requests} requests</h2><div className="report-stats"><span><b>{report.ai.successful}</b>Successful</span><span><b>{report.ai.failed}</b>Failed</span><span><b>{integer(report.ai.inputTokens + report.ai.outputTokens)}</b>Tokens</span><span><b>{integer(report.ai.latencyAvgMs)} ms</b>Avg latency</span></div></section>
        <section className="workspace-card report-detail-card"><p className="eyebrow">Capacity</p><h2>{report.utilization.percentage}% utilized</h2><div className="utilization-track"><i style={{ width: `${Math.min(100, report.utilization.percentage)}%` }} /></div><div className="report-stats"><span><b>{report.utilization.activeStaff}</b>Active staff</span><span><b>{integer(report.utilization.bookedMinutes)}</b>Booked min</span><span><b>{integer(report.utilization.scheduledMinutes)}</b>Scheduled min</span></div></section>
      </div>
      <section className="workspace-card report-daily-card"><div className="section-head"><div><p className="eyebrow">Exact values</p><h2>Daily report detail</h2></div></div><div className="report-daily-table"><div className="report-daily-head"><span>Date</span><span>Bookings</span><span>Completed</span><span>Gross</span><span>Refunded</span><span>Net</span></div>{report.daily.map(point => <div className="report-daily-row" key={point.localDate}><span>{point.localDate}</span><span>{point.bookings}</span><span>{point.completed}</span><span>{money(point.revenueMinor, report.currency)}</span><span>{money(point.refundedMinor, report.currency)}</span><span>{money(point.revenueMinor - point.refundedMinor, report.currency)}</span></div>)}</div></section>
    </> : null}
  </>;
}
