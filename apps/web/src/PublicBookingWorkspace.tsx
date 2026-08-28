import { useEffect, useMemo, useRef, useState } from 'react';
import { publicGet, publicPost, type PublicAvailability, type PublicBookingResponse, type PublicCatalog, type PublicService, type PublicSlot, type PublicStaff } from './api';

const stepLabels = ['Service', 'Staff', 'Date & time', 'Details', 'Payment'];
const localDate = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
const addDays = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return localDate(date); };
const money = (minor: number, currency: string) => new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(minor / 100);
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function PublicBookingWorkspace({ tenantId }: { tenantId: string }) {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [staff, setStaff] = useState<PublicStaff[]>([]);
  const [availability, setAvailability] = useState<PublicAvailability | null>(null);
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(addDays(1));
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+60');
  const [paymentChoice, setPaymentChoice] = useState<'PAY_NOW' | 'PAY_LATER'>('PAY_LATER');
  const [result, setResult] = useState<PublicBookingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void publicGet<PublicCatalog>(tenantId, '/catalog', controller.signal).then(setCatalog).catch(caught => { if (!controller.signal.aborted) setError(message(caught, 'Unable to load booking services')); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tenantId]);

  useEffect(() => {
    if (!serviceId) { setStaff([]); return; }
    const controller = new AbortController();
    void publicGet<PublicStaff[]>(tenantId, `/staff?serviceId=${encodeURIComponent(serviceId)}`, controller.signal).then(setStaff).catch(caught => { if (!controller.signal.aborted) setError(message(caught, 'Unable to load available staff')); });
    return () => controller.abort();
  }, [serviceId, tenantId]);

  useEffect(() => {
    if (!serviceId || !date) { setAvailability(null); return; }
    const controller = new AbortController();
    setLoadingSlots(true); setSlot(null);
    const query = new URLSearchParams({ serviceId, localDate: date, ...(staffId ? { staffId } : {}) });
    void publicGet<PublicAvailability>(tenantId, `/availability?${query}`, controller.signal).then(setAvailability).catch(caught => { if (!controller.signal.aborted) setError(message(caught, 'Unable to load available times')); }).finally(() => { if (!controller.signal.aborted) setLoadingSlots(false); });
    return () => controller.abort();
  }, [date, serviceId, staffId, tenantId]);

  const selectedService = useMemo(() => catalog?.services.find(row => row.id === serviceId) ?? null, [catalog, serviceId]);
  const selectedStaff = useMemo(() => staff.find(row => row.id === (slot?.staffId ?? staffId)) ?? null, [slot, staff, staffId]);
  const validPhone = /^\+[1-9]\d{6,14}$/.test(phone.replace(/\s+/g, ''));
  const canContinue = step === 0 ? Boolean(serviceId) : step === 1 ? true : step === 2 ? Boolean(slot) : step === 3 ? Boolean(name.trim() && validPhone) : true;

  useEffect(() => { stageRef.current?.focus(); }, [step]);

  function chooseService(service: PublicService) {
    setServiceId(service.id); setStaffId(''); setSlot(null);
  }

  async function submit() {
    if (!selectedService || !slot || !name.trim() || !validPhone) return;
    setSubmitting(true); setError(null);
    try {
      setResult(await publicPost<PublicBookingResponse>(tenantId, '/book', { name: name.trim(), phone: phone.replace(/\s+/g, ''), serviceId: selectedService.id, staffId: slot.staffId, resourceId: slot.resourceId, startsAt: slot.startsAt, paymentChoice }));
    } catch (caught) {
      setError(message(caught, 'Unable to complete booking'));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) return <PublicBookingConfirmation result={result} service={selectedService} staff={selectedStaff} timezone={availability?.timezone ?? 'Asia/Kuala_Lumpur'} />;

  return <main className="public-booking-shell">
    <header className="public-booking-brand"><span>WS</span><div><strong>WSadmin Business</strong><small>Secure online booking</small></div></header>
    <section className="public-booking-card" aria-labelledby="public-booking-title">
      <div className="public-booking-head"><p className="eyebrow">Book online</p><h1 id="public-booking-title">Choose your appointment</h1><p>No account or app login required.</p></div>
      <div className="public-stepper" aria-label="Booking progress">{stepLabels.map((label, index) => <button key={label} className={index === step ? 'active' : index < step ? 'done' : ''} aria-current={index === step ? 'step' : undefined} aria-label={`Step ${index + 1}: ${label}`} onClick={() => index < step && setStep(index)}><span>{index < step ? '✓' : index + 1}</span><small>{label}</small></button>)}</div>
      {error ? <div className="public-error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}>×</button></div> : null}
      <div className="public-booking-stage" ref={stageRef} tabIndex={-1} aria-live="polite">
        {step === 0 ? <section><h2>Select a service</h2><p>Prices and duration are shown before you choose a time.</p>{loading ? <div className="public-loading">Loading services…</div> : <div className="public-service-list">{catalog?.services.map(service => <button className={serviceId === service.id ? 'selected' : ''} aria-pressed={serviceId === service.id} key={service.id} onClick={() => chooseService(service)}><div><strong>{service.name}</strong><small>{service.description ?? `${service.durationMinutes} minute appointment`}</small></div><div><strong>{money(service.priceMinor, service.currency)}</strong><small>{service.durationMinutes} min</small></div></button>)}{!catalog?.services.length ? <div className="public-loading">No public services are available.</div> : null}</div>}</section> : null}
        {step === 1 ? <section><h2>Choose a staff member</h2><p>Select someone specific or let us assign the first available person.</p><div className="public-staff-grid"><button className={staffId === '' ? 'selected' : ''} aria-pressed={staffId === ''} onClick={() => setStaffId('')}><span className="public-avatar">ANY</span><strong>Any available</strong><small>Fastest matching slot</small></button>{staff.map(person => <button className={staffId === person.id ? 'selected' : ''} aria-pressed={staffId === person.id} key={person.id} onClick={() => setStaffId(person.id)}>{person.photoUrl ? <img src={person.photoUrl} alt="" /> : <span className="public-avatar">{person.displayName.slice(0, 2).toUpperCase()}</span>}<strong>{person.displayName}</strong><small>Book with this staff</small></button>)}</div></section> : null}
        {step === 2 ? <section><h2>Choose date and time</h2><p>Only slots that pass the same live booking rules are shown.</p><div className="public-date-strip">{[1, 2, 3, 4, 5].map(offset => { const value = addDays(offset); return <button className={date === value ? 'selected' : ''} aria-pressed={date === value} key={value} onClick={() => setDate(value)}><strong>{new Date(`${value}T12:00:00Z`).toLocaleDateString('en-MY', { weekday: 'short' })}</strong><small>{new Date(`${value}T12:00:00Z`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}</small></button>; })}</div><label className="public-date-input">Another date<input type="date" min={localDate(new Date())} value={date} onChange={event => setDate(event.target.value)} /></label><div className="public-slot-grid">{loadingSlots ? <div className="public-loading">Checking live availability…</div> : availability?.slots.map(row => { const selected = slot?.startsAt === row.startsAt && slot.staffId === row.staffId; return <button className={selected ? 'selected' : ''} aria-pressed={selected} key={`${row.startsAt}:${row.staffId}:${row.resourceId ?? ''}`} onClick={() => setSlot(row)}><strong>{new Date(row.startsAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', timeZone: availability.timezone })}</strong><small>{row.staffDisplayName}</small></button>; })}{!loadingSlots && availability && !availability.slots.length ? <div className="public-loading">No slots on this date. Choose another day.</div> : null}</div></section> : null}
        {step === 3 ? <section><h2>Your details</h2><p>We use your name and phone number to match your booking—no account required.</p><div className="public-details-form"><label>Full name<input autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Nur Aina" /></label><label>Mobile number (E.164)<input autoComplete="tel" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+60123456789" /><small>{phone.length > 3 && !validPhone ? 'Use country code, for example +60123456789.' : 'Booking confirmation will use this number.'}</small></label></div></section> : null}
        {step === 4 ? <section><h2>Review and payment</h2><p>Confirm your appointment and choose how to pay.</p><BookingSummary service={selectedService} staff={selectedStaff} slot={slot} timezone={availability?.timezone ?? 'Asia/Kuala_Lumpur'} /><div className="public-payment-options"><button className={paymentChoice === 'PAY_LATER' ? 'selected' : ''} aria-pressed={paymentChoice === 'PAY_LATER'} onClick={() => setPaymentChoice('PAY_LATER')}><span>Pay later</span><small>Confirm now and pay at the business</small></button><button className={paymentChoice === 'PAY_NOW' ? 'selected' : ''} aria-pressed={paymentChoice === 'PAY_NOW'} disabled={!catalog?.payment.payNowAvailable} onClick={() => setPaymentChoice('PAY_NOW')}><span>Pay online</span><small>{catalog?.payment.payNowAvailable ? 'Open the secure payment link after booking' : 'Online payment is not configured'}</small></button></div></section> : null}
      </div>
      <footer className="public-booking-actions">{step > 0 ? <button className="public-back" onClick={() => setStep(current => current - 1)}>Back</button> : <span />}{step < stepLabels.length - 1 ? <button className="public-primary" disabled={!canContinue} onClick={() => setStep(current => current + 1)}>Continue</button> : <button className="public-primary" disabled={submitting} onClick={() => void submit()}>{submitting ? 'Confirming…' : 'Confirm booking'}</button>}</footer>
    </section>
    <p className="public-booking-foot">Availability is checked again when you confirm to prevent double booking.</p>
  </main>;
}

function BookingSummary({ service, staff, slot, timezone }: { service: PublicService | null; staff: PublicStaff | null; slot: PublicSlot | null; timezone: string }) {
  if (!service || !slot) return null;
  return <div className="public-summary"><div><small>Service</small><strong>{service.name}</strong></div><div><small>Staff</small><strong>{staff?.displayName ?? slot.staffDisplayName}</strong></div><div><small>Date & time</small><strong>{new Date(slot.startsAt).toLocaleString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: timezone })}</strong></div><div><small>Total</small><strong>{money(slot.priceMinor, slot.currency)}</strong></div></div>;
}

function PublicBookingConfirmation({ result, service, staff, timezone }: { result: PublicBookingResponse; service: PublicService | null; staff: PublicStaff | null; timezone: string }) {
  const link = result.payment?.link.url && /^https?:\/\//.test(result.payment.link.url) ? result.payment.link.url : null;
  return <main className="public-booking-shell"><header className="public-booking-brand"><span>WS</span><div><strong>WSadmin Business</strong><small>Secure online booking</small></div></header><section className="public-booking-card public-confirmation"><span className="public-confirm-icon">✓</span><p className="eyebrow">Booking confirmed</p><h1>You're all set</h1><p>Your booking reference is <strong>{result.booking.id.slice(0, 8).toUpperCase()}</strong>.</p><div className="public-summary"><div><small>Service</small><strong>{service?.name ?? result.booking.serviceId}</strong></div><div><small>Staff</small><strong>{staff?.displayName ?? result.booking.staffId}</strong></div><div><small>Date & time</small><strong>{new Date(result.booking.startsAt).toLocaleString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: timezone })}</strong></div><div><small>Total</small><strong>{money(result.booking.priceMinor, result.booking.currency)}</strong></div></div>{link ? <a className="public-primary public-pay-link" href={link} target="_blank" rel="noreferrer">Continue to payment</a> : result.paymentChoice === 'PAY_NOW' ? <div className="public-payment-warning">Your booking is confirmed, but payment could not be started. Please pay at the business.</div> : <div className="public-pay-later">Payment: pay at the business</div>}</section></main>;
}
