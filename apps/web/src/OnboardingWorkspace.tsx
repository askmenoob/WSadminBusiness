import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BUSINESS_TYPE_KEYS,
  getBusinessTypeDefinition,
  type BusinessTypeKey,
  type BusinessWorkflow,
  type CustomOfferingField,
} from '@wsadmin-business/verticals';
import {
  authenticationMode,
  platformGet,
  tenantGet,
  tenantPost,
  tenantPut,
  type BillingCheckout,
  type BillingOverview,
  type IntegrationStatus,
  type OnboardingState,
  type OnboardingStep,
  type SaaSPlan,
  type TenantPlanOverview,
} from './api';

type WizardStep = Exclude<OnboardingStep, 'COMPLETE'>;
type OfferingDraft = {
  sourceKey: string; name: string; description: string; price: number; durationMinutes: number; capacity: number;
  deposit: number; staffNames: string[]; stockQuantity: number; preparationMinutes: number; propertyCode: string;
  locationName: string; googleMapsUrl: string; roomType: string; unitCount: number; roomCount: number; bedrooms: number; bathrooms: number;
  maxGuests: number; privatePool: boolean; amenities: string[]; weekdayPrice: number; weekendPrice: number;
  publicHolidayPrice: number; peakSeasonPrice: number; extraGuestCharge: number; cleaningFee: number;
  minimumNights: number; maximumNights: number; sameDayBooking: boolean; checkInTime: string; checkOutTime: string;
  earlyCheckInAllowed: boolean; lateCheckOutAllowed: boolean; availability: string; bookingRules: string; cancellationPolicy: string;
  attributes: Record<string,string|number|boolean|string[]>;
};

const steps: { key: WizardStep; label: string; detail: string }[] = [
  { key: 'BUSINESS_PROFILE', label: 'Business information', detail: 'Company and contact details' },
  { key: 'BUSINESS_TYPE', label: 'Business type', detail: 'Choose the industry engine' },
  { key: 'BUSINESS_SUBTYPE', label: 'Business sub-type', detail: 'Select the operating model' },
  { key: 'OFFERINGS', label: 'What do you offer?', detail: 'Choose relevant products or services' },
  { key: 'OFFERING_DETAILS', label: 'Offering details', detail: 'Price, capacity and industry fields' },
  { key: 'WORKFLOW', label: 'Customer journey', detail: 'Booking, order or enquiry flow' },
  { key: 'PAYMENT', label: 'Payment', detail: 'Deposit, methods and policy' },
  { key: 'WHATSAPP_AI', label: 'WhatsApp & AI', detail: 'Generate tenant-specific knowledge' },
];
const amenityOptions = ['Wi-Fi','Air conditioning','Swimming pool','Private pool','Kitchen','BBQ','Parking','Washing machine','TV','Netflix','Towels','Iron','Hair dryer'];
const weekdays = [{ value: 1, label: 'Mon' },{ value: 2, label: 'Tue' },{ value: 3, label: 'Wed' },{ value: 4, label: 'Thu' },{ value: 5, label: 'Fri' },{ value: 6, label: 'Sat' },{ value: 0, label: 'Sun' }];
const workflowLabels: Record<BusinessWorkflow,string> = { APPOINTMENT: 'Appointment', BOOKING: 'Booking', ORDER: 'Order', RESERVATION: 'Reservation', ENQUIRY: 'Enquiry', QUOTATION: 'Quotation', WALK_IN: 'Walk-in' };
const money = (minor: number, currency = 'MYR') => new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(minor / 100);
const label = (key: string) => key.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,any> : {};
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const list = (value: unknown) => Array.isArray(value) ? value.filter(item => typeof item === 'string') as string[] : [];
const trialRemaining = (value: string | null) => value ? Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / (24 * 60 * 60_000))) : 0;
const sourceCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 70) || 'OFFERING';

function blankOffering(sourceKey: string, name: string): OfferingDraft {
  return { sourceKey, name, description: '', price: 0, durationMinutes: 60, capacity: 1, deposit: 0, staffNames: [], stockQuantity: 0, preparationMinutes: 15, propertyCode: sourceCode(name).slice(0,20), locationName: '', googleMapsUrl: '', roomType: name, unitCount: 1, roomCount: 1, bedrooms: 1, bathrooms: 1, maxGuests: 2, privatePool: false, amenities: [], weekdayPrice: 0, weekendPrice: 0, publicHolidayPrice: 0, peakSeasonPrice: 0, extraGuestCharge: 0, cleaningFee: 0, minimumNights: 1, maximumNights: 30, sameDayBooking: false, checkInTime: '15:00', checkOutTime: '11:00', earlyCheckInAllowed: false, lateCheckOutAllowed: false, availability: 'Available daily unless blocked', bookingRules: 'Subject to availability. House rules must be accepted before confirmation.', cancellationPolicy: 'Contact the host for cancellation terms.', attributes: {} };
}

function draftAttributes(value:unknown,fields:readonly CustomOfferingField[]){const attributes={...record(value)} as OfferingDraft['attributes'];for(const field of fields)if(field.type==='MONEY')attributes[field.key]=number(attributes[field.key])/100;return attributes;}
function savedAttributes(value:OfferingDraft['attributes'],fields:readonly CustomOfferingField[]){const attributes={...value};for(const field of fields)if(field.type==='MONEY')attributes[field.key]=Math.round(number(attributes[field.key])*100);return attributes;}
function customFieldsReady(value:OfferingDraft['attributes'],fields:readonly CustomOfferingField[]){return fields.every(field=>{if(!field.required)return true;const item=value[field.key];return field.type==='LIST'?Array.isArray(item)&&item.length>0:String(item??'').trim().length>0;});}
function defaultAttributes(fields:readonly CustomOfferingField[]){return Object.fromEntries(fields.map(field=>[field.key,field.type==='BOOLEAN'?false:field.type==='LIST'?[]:field.type==='NUMBER'||field.type==='MONEY'?0:field.type==='SELECT'?field.options?.[0]??'':''])) as OfferingDraft['attributes'];}

export function OnboardingWorkspace({ onNavigate, onBusinessTypeChange, ownerEmail = '', trialDays = 10 }: { onNavigate: (module: string) => void; onBusinessTypeChange?: (businessType: BusinessTypeKey) => void; ownerEmail?: string; trialDays?: number }) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [overview, setOverview] = useState<TenantPlanOverview | null>(null);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [activeStep, setActiveStep] = useState<OnboardingStep>('BUSINESS_PROFILE');
  const [businessName, setBusinessName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [contactEmail, setContactEmail] = useState(ownerEmail);
  const [phoneE164, setPhoneE164] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postcode, setPostcode] = useState('');
  const [countryCode, setCountryCode] = useState('MY');
  const [timezone, setTimezone] = useState('Asia/Kuala_Lumpur');
  const [businessType, setBusinessType] = useState<BusinessTypeKey | ''>('');
  const [businessSubtype, setBusinessSubtype] = useState('');
  const [selectedOffers, setSelectedOffers] = useState<string[]>([]);
  const [offeringItems, setOfferingItems] = useState<OfferingDraft[]>([]);
  const [workflowKind, setWorkflowKind] = useState<BusinessWorkflow>('ENQUIRY');
  const [workflowKinds, setWorkflowKinds] = useState<BusinessWorkflow[]>(['ENQUIRY']);
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(30);
  const [minimumLeadMinutes, setMinimumLeadMinutes] = useState(60);
  const [bookingHorizonDays, setBookingHorizonDays] = useState(90);
  const [cancellationDeadlineMinutes, setCancellationDeadlineMinutes] = useState(120);
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('18:00');
  const [workingDays, setWorkingDays] = useState([1,2,3,4,5,6]);
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [paymentTiming, setPaymentTiming] = useState('DEPOSIT');
  const [depositType, setDepositType] = useState('FIXED');
  const [depositValue, setDepositValue] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState(['ONLINE_BANKING','CARD','CASH']);
  const [paymentPolicy, setPaymentPolicy] = useState('Payment or deposit is required according to the selected booking terms.');
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiTone, setAiTone] = useState('FRIENDLY');
  const [languages, setLanguages] = useState(['ms','en']);
  const [handoffMessage, setHandoffMessage] = useState('Terima kasih. Saya akan serahkan pertanyaan ini kepada team kami untuk bantuan lanjut.');
  const [businessSummary, setBusinessSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);

  const definition = useMemo(() => businessType ? getBusinessTypeDefinition(businessType) : null, [businessType]);
  const subtypeLabel = definition?.subtypes.find(row => row.key === businessSubtype)?.label ?? businessSubtype;
  const selectedLabels = useMemo(() => definition?.offeringPresets.filter(row => selectedOffers.includes(row.key)).map(row => row.label) ?? [], [definition, selectedOffers]);
  const generatedSummary = useMemo(() => {
    if (!definition) return '';
    const company = businessName.trim() || 'Perniagaan ini';
    const offers = offeringItems.map(item => item.name).filter(Boolean).join(', ') || selectedLabels.join(', ');
    return `${company} ialah ${subtypeLabel || definition.label}. AI bertindak sebagai ${subtypeLabel || definition.label} ${definition.labels.transactionSingular} Assistant. ${definition.labels.offeringPlural} yang ditawarkan: ${offers || 'akan dikemas kini'}. Workflow utama: ${workflowLabels[workflowKind]}. Jawab hanya berdasarkan harga, kapasiti, availability, polisi bayaran dan maklumat yang disimpan untuk tenant ini.`;
  }, [businessName, definition, offeringItems, selectedLabels, subtypeLabel, workflowKind]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [nextState, nextOverview, nextBilling, nextPlans, nextIntegrations] = await Promise.all([
        tenantGet<OnboardingState>('/onboarding'), tenantGet<TenantPlanOverview>('/subscription'), tenantGet<BillingOverview>('/billing'), platformGet<SaaSPlan[]>('/plans'), tenantGet<IntegrationStatus>('/settings/integrations'),
      ]);
      const data = nextState.data, profile = record(data.BUSINESS_PROFILE), typeData = record(data.BUSINESS_TYPE), subtypeData = record(data.BUSINESS_SUBTYPE), offerData = record(data.OFFERINGS), detailData = record(data.OFFERING_DETAILS), workflowData = record(data.WORKFLOW), paymentData = record(data.PAYMENT), aiData = record(data.WHATSAPP_AI);
      setBusinessName(text(profile.businessName)); setRegistrationNumber(text(profile.registrationNumber)); setContactEmail(text(profile.contactEmail, ownerEmail)); setPhoneE164(text(profile.phoneE164)); setWebsiteUrl(text(profile.websiteUrl)); setAddressLine1(text(profile.addressLine1)); setAddressLine2(text(profile.addressLine2)); setCity(text(profile.city)); setRegion(text(profile.state)); setPostcode(text(profile.postcode)); setCountryCode(text(profile.countryCode, 'MY')); setTimezone(text(profile.timezone, 'Asia/Kuala_Lumpur'));
      const savedType = text(typeData.businessType) as BusinessTypeKey;
      const savedDefinition = BUSINESS_TYPE_KEYS.includes(savedType) ? getBusinessTypeDefinition(savedType) : null;
      if (savedDefinition) {
        setBusinessType(savedType); setBusinessSubtype(text(subtypeData.businessSubtype, savedDefinition.subtypes[0]!.key)); setSelectedOffers(list(offerData.selectedOffers));
        setWorkflowKind((text(workflowData.workflowKind, savedDefinition.defaultWorkflow) as BusinessWorkflow)); setWorkflowKinds((list(workflowData.workflowKinds).length ? list(workflowData.workflowKinds) : [text(workflowData.workflowKind, savedDefinition.defaultWorkflow)]) as BusinessWorkflow[]);
        onBusinessTypeChange?.(savedType);
      }
      if (Array.isArray(detailData.items)) setOfferingItems(detailData.items.map((value:any) => ({ ...blankOffering(text(value.sourceKey), text(value.name)), ...value, price: number(value.priceMinor) / 100, deposit: number(value.depositMinor) / 100, weekdayPrice: number(value.weekdayPriceMinor) / 100, weekendPrice: number(value.weekendPriceMinor) / 100, publicHolidayPrice: number(value.publicHolidayPriceMinor) / 100, peakSeasonPrice: number(value.peakSeasonPriceMinor) / 100, extraGuestCharge: number(value.extraGuestChargeMinor) / 100, cleaningFee: number(value.cleaningFeeMinor) / 100, staffNames: list(value.staffNames), amenities: list(value.amenities), attributes: {...defaultAttributes(savedDefinition?.customFields??[]),...draftAttributes(value.attributes,savedDefinition?.customFields??[])} })));
      setSlotIntervalMinutes(number(workflowData.slotIntervalMinutes,30)); setMinimumLeadMinutes(number(workflowData.minimumLeadMinutes,60)); setBookingHorizonDays(number(workflowData.bookingHorizonDays,90)); setCancellationDeadlineMinutes(number(workflowData.cancellationDeadlineMinutes,120)); setOpenTime(text(workflowData.openTime,'09:00')); setCloseTime(text(workflowData.closeTime,'18:00')); setWorkingDays(Array.isArray(workflowData.workingDays)?workflowData.workingDays.map(Number):[1,2,3,4,5,6]); setAutoConfirm(typeof workflowData.autoConfirm==='boolean'?workflowData.autoConfirm:true);
      const savedPaymentTiming=text(paymentData.paymentTiming,'DEPOSIT'),savedDepositType=text(paymentData.depositType,'FIXED');setPaymentTiming(savedPaymentTiming==='PAY_LATER'?(savedType==='PROPERTY'?'PAY_ON_ARRIVAL':'PAY_AFTER_SERVICE'):savedPaymentTiming); setDepositType(savedDepositType); setDepositValue(savedDepositType==='FIXED'?number(paymentData.depositValue)/100:number(paymentData.depositValue)); setPaymentMethods(list(paymentData.paymentMethods).length?list(paymentData.paymentMethods):['ONLINE_BANKING','CARD','CASH']); setPaymentPolicy(text(paymentData.paymentPolicy,'Payment or deposit is required according to the selected booking terms.'));
      setWhatsappEnabled(typeof aiData.whatsappEnabled==='boolean'?aiData.whatsappEnabled:true); setAiEnabled(typeof aiData.aiEnabled==='boolean'?aiData.aiEnabled:true); setAiTone(text(aiData.tone,'FRIENDLY')); setLanguages(list(aiData.languages).length?list(aiData.languages):['ms','en']); setHandoffMessage(text(aiData.handoffMessage,'Terima kasih. Saya akan serahkan pertanyaan ini kepada team kami untuk bantuan lanjut.')); setBusinessSummary(text(aiData.businessSummary));
      setState(nextState); setOverview(nextOverview); setBilling(nextBilling); setPlans(nextPlans); setIntegrations(nextIntegrations);
      const nextMissing = steps.find(step => !(step.key in data)); setActiveStep(nextState.completed ? 'COMPLETE' : nextMissing?.key ?? 'COMPLETE');
    } catch (caught) { setError(message(caught, 'Unable to load onboarding status')); } finally { setLoading(false); }
  }, [onBusinessTypeChange, ownerEmail]);
  useEffect(() => { void load(); }, [load]);

  const savedCount = useMemo(() => steps.filter(step => state?.data && step.key in state.data).length, [state]);
  const progress = state?.completed ? 100 : Math.round((savedCount / steps.length) * 100);
  const completionReady = savedCount === steps.length;

  function selectType(next: BusinessTypeKey) {
    const nextDefinition = getBusinessTypeDefinition(next); setBusinessType(next); setBusinessSubtype(nextDefinition.subtypes[0]!.key); setSelectedOffers([]); setOfferingItems([]); setWorkflowKind(nextDefinition.defaultWorkflow); setWorkflowKinds([nextDefinition.defaultWorkflow]); setBusinessSummary('');
  }
  function toggleOffer(key: string) { setSelectedOffers(current => current.includes(key) ? current.filter(value => value !== key) : [...current,key]); }
  function prepareOfferingDetails() {
    if (!definition) return;
    setOfferingItems(current => selectedOffers.map(key => {const existing=current.find(item => item.sourceKey === key),draft=existing??blankOffering(key, definition.offeringPresets.find(row => row.key === key)?.label ?? label(key));return{...draft,attributes:{...defaultAttributes(definition.customFields),...draft.attributes}};}));
  }
  function updateOffering(index: number, patch: Partial<OfferingDraft>) { setOfferingItems(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }
  function payloadFor(step: WizardStep): Record<string, unknown> {
    if (step === 'BUSINESS_PROFILE') return { businessName, registrationNumber, contactEmail, phoneE164, websiteUrl, addressLine1, addressLine2, city, state: region, postcode, countryCode, timezone };
    if (step === 'BUSINESS_TYPE') return { businessType };
    if (step === 'BUSINESS_SUBTYPE') return { businessType, businessSubtype };
    if (step === 'OFFERINGS') return { businessType, selectedOffers };
    if (step === 'OFFERING_DETAILS') return { businessType, items: offeringItems.map(item => definition?.offeringKind === 'PROPERTY' ? { sourceKey:item.sourceKey,name:item.name,description:item.description,propertyCode:item.propertyCode,locationName:item.locationName,googleMapsUrl:item.googleMapsUrl,roomType:item.roomType,unitCount:item.unitCount,roomCount:item.roomCount,bedrooms:item.bedrooms,bathrooms:item.bathrooms,maxGuests:item.maxGuests,privatePool:item.privatePool,amenities:item.amenities,weekdayPriceMinor:Math.round(item.weekdayPrice*100),weekendPriceMinor:Math.round(item.weekendPrice*100),publicHolidayPriceMinor:Math.round(item.publicHolidayPrice*100),peakSeasonPriceMinor:Math.round(item.peakSeasonPrice*100),extraGuestChargeMinor:Math.round(item.extraGuestCharge*100),cleaningFeeMinor:Math.round(item.cleaningFee*100),depositMinor:Math.round(item.deposit*100),minimumNights:item.minimumNights,maximumNights:item.maximumNights,sameDayBooking:item.sameDayBooking,checkInTime:item.checkInTime,checkOutTime:item.checkOutTime,earlyCheckInAllowed:item.earlyCheckInAllowed,lateCheckOutAllowed:item.lateCheckOutAllowed,availability:item.availability,bookingRules:item.bookingRules,cancellationPolicy:item.cancellationPolicy,active:true } : { sourceKey:item.sourceKey,name:item.name,description:item.description,priceMinor:Math.round(item.price*100),durationMinutes:item.durationMinutes,capacity:item.capacity,depositMinor:Math.round(item.deposit*100),staffNames:item.staffNames,stockQuantity:item.stockQuantity,preparationMinutes:item.preparationMinutes,attributes:savedAttributes(item.attributes,definition?.customFields??[]),active:true }) };
    if (step === 'WORKFLOW') return { businessType, workflowKind, workflowKinds, slotIntervalMinutes, minimumLeadMinutes, bookingHorizonDays, cancellationDeadlineMinutes, openTime, closeTime, workingDays, autoConfirm };
    if (step === 'PAYMENT') return { businessType, paymentTiming, depositType, depositValue: depositType === 'FIXED' ? Math.round(depositValue * 100) : depositValue, paymentMethods, paymentPolicy };
    return { businessType, whatsappEnabled, aiEnabled, tone: aiTone, languages, handoffMessage, businessSummary: businessSummary.trim() || generatedSummary, connectionStatus: integrations?.whatsapp.status ?? '' };
  }
  function canSave(step: WizardStep) {
    if (step === 'BUSINESS_PROFILE') return businessName.trim().length >= 2 && contactEmail.includes('@') && phoneE164.trim().length >= 7 && Boolean(timezone.trim());
    if (step === 'BUSINESS_TYPE') return Boolean(definition);
    if (step === 'BUSINESS_SUBTYPE') return Boolean(definition?.subtypes.some(row => row.key === businessSubtype));
    if (step === 'OFFERINGS') return selectedOffers.length > 0;
    if (step === 'OFFERING_DETAILS') return offeringItems.length > 0 && offeringItems.every(item => definition?.offeringKind === 'PROPERTY' ? item.name.trim() && item.propertyCode.trim() && item.locationName.trim() && item.roomType.trim() && item.unitCount > 0 && item.roomCount >= 0 && item.maxGuests > 0 && item.minimumNights > 0 && item.maximumNights >= item.minimumNights && item.bookingRules.trim() && item.cancellationPolicy.trim() : item.name.trim() && item.price >= 0 && (!definition?.offeringFields.includes('DURATION') || item.durationMinutes >= 5) && customFieldsReady(item.attributes,definition?.customFields??[]));
    if (step === 'WORKFLOW') return workflowKinds.length > 0 && workingDays.length > 0 && openTime < closeTime;
    if (step === 'PAYMENT') return (paymentTiming==='NO_PAYMENT'||paymentMethods.length > 0) && paymentPolicy.trim().length >= 2;
    return languages.length > 0 && handoffMessage.trim().length >= 2 && (businessSummary.trim() || generatedSummary).length >= 10;
  }
  async function saveStep(step: WizardStep) {
    if (!canSave(step)) return;
    setSaving(true); setError(null);
    try {
      const next = await tenantPut<OnboardingState>(`/onboarding/${step}`, payloadFor(step)); setState(next); setNotice(`${steps.find(row => row.key === step)?.label} saved`);
      if ((step === 'BUSINESS_TYPE' || step === 'OFFERING_DETAILS') && businessType) onBusinessTypeChange?.(businessType);
      if (step === 'OFFERINGS') prepareOfferingDetails();
      const index = steps.findIndex(row => row.key === step); setActiveStep(steps[index + 1]?.key ?? 'COMPLETE');
    } catch (caught) { setError(message(caught, 'Unable to save onboarding checkpoint')); } finally { setSaving(false); }
  }
  async function complete() { setSaving(true); setError(null); try { const next = await tenantPut<OnboardingState>('/onboarding/COMPLETE', {}); setState(next); setActiveStep('COMPLETE'); setNotice('Business setup completed'); if (businessType) onBusinessTypeChange?.(businessType); } catch (caught) { setError(message(caught, 'Unable to complete onboarding')); } finally { setSaving(false); } }
  async function startCheckout(planCode:string){setCheckoutPlan(planCode);setError(null);try{const checkout=await tenantPost<BillingCheckout>('/billing/checkout',{planCode});setBilling(current=>({checkout,invoices:current?.invoices??[]}));if(!checkout.checkoutUrl)throw new Error('HitPay did not return a checkout URL');window.location.assign(checkout.checkoutUrl);}catch(caught){setError(message(caught,'Unable to start HitPay checkout'));setCheckoutPlan(null);}}

  return <>
    <header className="page-header"><div><p className="eyebrow">{trialDays}-day free trial setup</p><h1>Build your business workspace</h1><p className="muted">Your answers configure the dashboard, offerings, customer workflow, payment policy and AI knowledge for this tenant.</p></div><button className="secondary-button" disabled={loading} onClick={() => void load()}>{loading ? 'Refreshing…' : 'Refresh setup'}</button></header>
    {error ? <div className="data-banner error"><strong>Setup issue</strong><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div> : null}
    {notice ? <div className="data-banner success"><strong>Updated</strong><span>{notice}</span><button onClick={() => setNotice(null)}>Dismiss</button></div> : null}
    <section className="onboarding-progress workspace-card"><div><span>{state?.completed ? 'Complete' : `${savedCount} of ${steps.length} steps`}</span><strong>{progress}%</strong></div><div className="quota-track"><i style={{ width: `${progress}%` }} /></div></section>
    <div className="onboarding-layout dynamic-onboarding">
      <aside className="workspace-card onboarding-steps">{steps.map((step, index) => { const saved = Boolean(state?.data && step.key in state.data); return <button key={step.key} className={activeStep === step.key ? 'active' : ''} onClick={() => setActiveStep(step.key)}><span className={saved ? 'done' : ''}>{saved ? '✓' : index + 1}</span><div><strong>{step.label}</strong><small>{step.detail}</small></div></button>; })}<button className={activeStep === 'COMPLETE' ? 'active' : ''} onClick={() => setActiveStep('COMPLETE')}><span className={state?.completed ? 'done' : ''}>{state?.completed ? '✓' : 9}</span><div><strong>Review & finish</strong><small>Activate the tailored workspace</small></div></button></aside>
      <main className="workspace-card onboarding-stage">
        {loading && !state ? <div className="empty-inline"><strong>Loading setup…</strong></div> : null}
        {activeStep === 'BUSINESS_PROFILE' ? <Step title="Business information" eyebrow="Step 1" description="Tell WSadmin who operates this tenant. These details also create the primary location."><div className="settings-form-grid company-details-grid"><Field label="Company or business name *"><input autoComplete="organization" value={businessName} onChange={event => setBusinessName(event.target.value)} placeholder="Example: Villa Mawar Sdn Bhd" /></Field><Field label="Registration number"><input value={registrationNumber} onChange={event => setRegistrationNumber(event.target.value)} placeholder="SSM or registration number" /></Field><Field label="Company email *"><input type="email" value={contactEmail} onChange={event => setContactEmail(event.target.value)} /></Field><Field label="Contact phone *"><input type="tel" value={phoneE164} onChange={event => setPhoneE164(event.target.value)} placeholder="+60 12-345 6789" /></Field><Field label="Website"><input type="url" value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://company.com" /></Field><Field label="Operating timezone *"><input value={timezone} onChange={event => setTimezone(event.target.value)} /></Field><Field label="Address line 1" wide><input value={addressLine1} onChange={event => setAddressLine1(event.target.value)} /></Field><Field label="Address line 2" wide><input value={addressLine2} onChange={event => setAddressLine2(event.target.value)} /></Field><Field label="City"><input value={city} onChange={event => setCity(event.target.value)} /></Field><Field label="State"><input value={region} onChange={event => setRegion(event.target.value)} /></Field><Field label="Postcode"><input value={postcode} onChange={event => setPostcode(event.target.value)} /></Field><Field label="Country code"><input maxLength={2} value={countryCode} onChange={event => setCountryCode(event.target.value.toUpperCase())} /></Field></div><SaveButton saving={saving} enabled={canSave('BUSINESS_PROFILE')} onClick={() => void saveStep('BUSINESS_PROFILE')}>Save business & continue</SaveButton></Step> : null}
        {activeStep === 'BUSINESS_TYPE' ? <Step title="What type of business do you operate?" eyebrow="Step 2" description="Business Type is the workspace engine. It changes terminology, fields, workflow, dashboard and AI behaviour."><div className="business-type-grid">{BUSINESS_TYPE_KEYS.map(key => { const item=getBusinessTypeDefinition(key); return <button key={key} className={businessType===key?'selected':''} onClick={()=>selectType(key)}><strong>{item.label}</strong><small>{item.description}</small><span>{item.labels.offeringPlural} · {item.labels.transactionPlural}</span></button>; })}</div><SaveButton saving={saving} enabled={canSave('BUSINESS_TYPE')} onClick={() => void saveStep('BUSINESS_TYPE')}>Use this business type</SaveButton></Step> : null}
        {activeStep === 'BUSINESS_SUBTYPE' && definition ? <Step title={`Choose your ${definition.label} sub-type`} eyebrow="Step 3" description="This makes the setup questions and AI role more precise."><div className="choice-grid">{definition.subtypes.map(row=><button key={row.key} className={businessSubtype===row.key?'selected':''} onClick={()=>setBusinessSubtype(row.key)}><strong>{row.label}</strong></button>)}</div><SaveButton saving={saving} enabled={canSave('BUSINESS_SUBTYPE')} onClick={() => void saveStep('BUSINESS_SUBTYPE')}>Save sub-type & continue</SaveButton></Step> : null}
        {activeStep === 'OFFERINGS' && definition ? <Step title={`What ${definition.labels.offeringPlural.toLowerCase()} do you offer?`} eyebrow="Step 4" description={`Choose all that apply. The next step will create the real ${definition.labels.offeringPlural.toLowerCase()} records.`}><div className="offering-choice-grid">{definition.offeringPresets.map(row=><button key={row.key} className={selectedOffers.includes(row.key)?'selected':''} onClick={()=>toggleOffer(row.key)}><span>{selectedOffers.includes(row.key)?'✓':'+'}</span><strong>{row.label}</strong></button>)}</div><SaveButton saving={saving} enabled={canSave('OFFERINGS')} onClick={() => void saveStep('OFFERINGS')}>Configure selected {definition.labels.offeringPlural.toLowerCase()}</SaveButton></Step> : null}
        {activeStep === 'OFFERING_DETAILS' && definition ? <Step title={`Create your ${definition.labels.offeringPlural.toLowerCase()}`} eyebrow="Step 5" description={definition.offeringKind==='PROPERTY'?'Property setup uses guest, stay, check-in and booking fields—never salon service fields.':`Each ${definition.labels.offeringSingular.toLowerCase()} becomes part of the tenant catalogue and AI knowledge.`}>{offeringItems.length ? <div className="offering-editor-list">{offeringItems.map((item,index)=>definition.offeringKind==='PROPERTY'?<PropertyEditor key={item.sourceKey} item={item} index={index} update={updateOffering}/>:<StandardOfferingEditor key={item.sourceKey} item={item} index={index} definition={definition} update={updateOffering}/>)}</div>:<div className="empty-inline"><strong>No offering selected</strong><span>Return to Step 4 and choose at least one item.</span></div>}<SaveButton saving={saving} enabled={canSave('OFFERING_DETAILS')} onClick={() => void saveStep('OFFERING_DETAILS')}>Create {definition.labels.offeringPlural.toLowerCase()} & continue</SaveButton></Step> : null}
        {activeStep === 'WORKFLOW' && definition ? <Step title="How do customers deal with your business?" eyebrow="Step 6" description="Choose one or more customer journeys and set the primary flow used by the dashboard and AI."><div className="workflow-grid">{definition.workflows.map(row=><label className={workflowKinds.includes(row)?'selected':''} key={row}><input type="checkbox" checked={workflowKinds.includes(row)} onChange={event=>{const next=event.target.checked?[...workflowKinds,row]:workflowKinds.filter(value=>value!==row);setWorkflowKinds(next);if(event.target.checked||workflowKind===row)setWorkflowKind(next[0]??definition.defaultWorkflow);}}/><span><strong>{workflowLabels[row]}</strong><small>{row==='ORDER'?'Cart, quantity and fulfilment':row==='ENQUIRY'?'Qualification and human follow-up':row==='QUOTATION'?'Requirements, estimate and owner approval':row==='WALK_IN'?'Serve without an advance booking':`${definition.labels.transactionSingular} availability and confirmation`}</small></span></label>)}</div><div className="settings-form-grid"><Field label="Primary workflow"><select value={workflowKind} onChange={event=>setWorkflowKind(event.target.value as BusinessWorkflow)}>{workflowKinds.map(row=><option value={row} key={row}>{workflowLabels[row]}</option>)}</select></Field><Field label="Slot interval (minutes)"><input type="number" min="5" step="5" value={slotIntervalMinutes} onChange={event=>setSlotIntervalMinutes(Number(event.target.value))}/></Field><Field label="Opening time"><input type="time" value={openTime} onChange={event=>setOpenTime(event.target.value)}/></Field><Field label="Closing time"><input type="time" value={closeTime} onChange={event=>setCloseTime(event.target.value)}/></Field><Field label="Minimum lead (minutes)"><input type="number" min="0" value={minimumLeadMinutes} onChange={event=>setMinimumLeadMinutes(Number(event.target.value))}/></Field><Field label="Advance booking limit (days)"><input type="number" min="1" value={bookingHorizonDays} onChange={event=>setBookingHorizonDays(Number(event.target.value))}/></Field><Field label="Cancellation deadline (minutes)"><input type="number" min="0" value={cancellationDeadlineMinutes} onChange={event=>setCancellationDeadlineMinutes(Number(event.target.value))}/></Field><label className="toggle-field"><input type="checkbox" checked={autoConfirm} onChange={event=>setAutoConfirm(event.target.checked)}/><span><strong>Auto-confirm</strong><small>Confirm when availability and payment rules pass</small></span></label></div><div><strong className="field-heading">Operating days</strong><div className="chip-picker">{weekdays.map(day=><button key={day.value} className={workingDays.includes(day.value)?'selected':''} onClick={()=>setWorkingDays(current=>current.includes(day.value)?current.filter(value=>value!==day.value):[...current,day.value])}>{day.label}</button>)}</div></div><SaveButton saving={saving} enabled={canSave('WORKFLOW')} onClick={() => void saveStep('WORKFLOW')}>Save customer journey</SaveButton></Step> : null}
        {activeStep === 'PAYMENT' && definition ? <Step title={`${definition.labels.transactionSingular} payment configuration`} eyebrow="Step 7" description="Set what the AI should explain before confirming a customer transaction."><div className="choice-grid payment-choice-grid">{[{key:'NO_PAYMENT',label:'No payment required'},{key:'DEPOSIT',label:'Deposit required'},{key:'FULL',label:'Full payment'},{key:'PAY_AFTER_SERVICE',label:'Pay after service'},{key:'PAY_ON_ARRIVAL',label:'Pay on arrival'},{key:'QUOTATION_FIRST',label:'Quotation first'},{key:'FLEXIBLE',label:'Flexible terms'}].map(row=><button key={row.key} className={paymentTiming===row.key?'selected':''} onClick={()=>{setPaymentTiming(row.key);if(row.key==='NO_PAYMENT')setDepositType('NONE');}}><strong>{row.label}</strong></button>)}</div><div className="settings-form-grid"><Field label="Deposit type"><select value={depositType} onChange={event=>setDepositType(event.target.value)}><option value="NONE">No deposit</option><option value="FIXED">Fixed amount (MYR)</option><option value="PERCENTAGE">Percentage</option></select></Field><Field label={depositType==='PERCENTAGE'?'Deposit percentage':'Deposit amount (MYR)'}><input type="number" min="0" max={depositType==='PERCENTAGE'?100:undefined} step={depositType==='PERCENTAGE'?1:0.01} disabled={depositType==='NONE'} value={depositValue} onChange={event=>setDepositValue(Number(event.target.value))}/></Field><Field label="Payment policy" wide><textarea rows={4} value={paymentPolicy} onChange={event=>setPaymentPolicy(event.target.value)}/></Field></div><strong className="field-heading">Accepted payment methods</strong><div className="chip-picker">{[{key:'ONLINE_BANKING',label:'Online banking'},{key:'CARD',label:'Card'},{key:'EWALLET',label:'E-wallet'},{key:'CASH',label:'Cash'}].map(row=><button key={row.key} className={paymentMethods.includes(row.key)?'selected':''} onClick={()=>setPaymentMethods(current=>current.includes(row.key)?current.filter(value=>value!==row.key):[...current,row.key])}>{row.label}</button>)}</div><SaveButton saving={saving} enabled={canSave('PAYMENT')} onClick={() => void saveStep('PAYMENT')}>Save payment rules</SaveButton></Step> : null}
        {activeStep === 'WHATSAPP_AI' && definition ? <Step title={`${subtypeLabel || definition.label} AI Assistant`} eyebrow="Step 8" description="WSadmin generates tenant-specific grounding from every previous answer. The AI must not borrow examples from another industry."><div className="ai-role-card"><div><span className="ai-role-icon">AI</span><div><strong>{subtypeLabel || definition.label} {definition.labels.transactionSingular} Assistant</strong><small>{definition.labels.offeringPlural} → {workflowLabels[workflowKind]} → Payment → Customer reply</small></div></div><span className={integrations?.whatsapp.status==='CONNECTED'?'settings-status configured':'settings-status'}>{integrations?.whatsapp.status.replaceAll('_',' ')??'Not configured'}</span></div><div className="settings-form-grid"><label className="toggle-field"><input type="checkbox" checked={whatsappEnabled} onChange={event=>setWhatsappEnabled(event.target.checked)}/><span><strong>WhatsApp workflow</strong><small>Use this configuration for WhatsApp conversations</small></span></label><label className="toggle-field"><input type="checkbox" checked={aiEnabled} onChange={event=>setAiEnabled(event.target.checked)}/><span><strong>AI assistant</strong><small>Answer only from tenant knowledge</small></span></label><Field label="Reply tone"><select value={aiTone} onChange={event=>setAiTone(event.target.value)}><option value="FRIENDLY">Friendly</option><option value="PROFESSIONAL">Professional</option><option value="CASUAL">Casual</option><option value="CONCISE">Concise</option></select></Field><Field label="Human handoff message" wide><textarea rows={3} value={handoffMessage} onChange={event=>setHandoffMessage(event.target.value)}/></Field><Field label="AI business knowledge" wide><textarea rows={7} value={businessSummary || generatedSummary} onChange={event=>setBusinessSummary(event.target.value)}/><button className="inline-link" onClick={()=>setBusinessSummary(generatedSummary)}>Regenerate from wizard</button></Field></div><strong className="field-heading">Languages</strong><div className="chip-picker">{[{key:'ms',label:'Bahasa Melayu'},{key:'en',label:'English'},{key:'zh',label:'中文'}].map(row=><button key={row.key} className={languages.includes(row.key)?'selected':''} onClick={()=>setLanguages(current=>current.includes(row.key)?current.filter(value=>value!==row.key):[...current,row.key])}>{row.label}</button>)}</div><div className="readiness-actions"><button className="secondary-button" onClick={()=>onNavigate('Settings')}>WhatsApp connection settings</button><SaveButton saving={saving} enabled={canSave('WHATSAPP_AI')} onClick={() => void saveStep('WHATSAPP_AI')}>Save AI configuration</SaveButton></div></Step> : null}
        {activeStep === 'COMPLETE' ? <section className="onboarding-review"><span className={state?.completed ? 'review-icon complete' : 'review-icon'}>{state?.completed ? '✓' : '8'}</span><p className="eyebrow">Review</p><h2>{state?.completed ? `${subtypeLabel || definition?.label || 'Tenant'} workspace is ready` : completionReady ? 'Ready to build the tailored dashboard' : 'Setup steps remain'}</h2><p className="muted">{state?.completed ? `The dashboard, ${definition?.labels.offeringPlural.toLowerCase() ?? 'offerings'}, ${definition?.labels.transactionPlural.toLowerCase() ?? 'workflow'} and AI knowledge now follow this tenant's wizard choices.` : completionReady ? 'All eight steps are validated. Finish setup to activate this tenant configuration.' : `${steps.length-savedCount} step${steps.length-savedCount===1?'':'s'} must still be saved.`}</p>{definition?<div className="review-flow"><span>{definition.label}</span><b>→</b><span>{subtypeLabel}</span><b>→</b><span>{definition.labels.offeringPlural}</span><b>→</b><span>{workflowLabels[workflowKind]}</span><b>→</b><span>AI Assistant</span></div>:null}{!state?.completed?<button className="primary-button" disabled={saving||!completionReady} onClick={()=>void complete()}>{saving?'Finishing…':'Finish & open workspace'}</button>:<button className="primary-button" onClick={()=>onNavigate('Dashboard')}>Open tailored dashboard</button>}</section> : null}
      </main>
      <PlanPanel overview={overview} billing={billing} plans={plans} currentPlan={overview?.plan} checkoutPlan={checkoutPlan} onCheckout={startCheckout}/>
    </div>
  </>;
}

function Step({ eyebrow, title, description, children }: { eyebrow:string;title:string;description:string;children:React.ReactNode }) { return <section className="dynamic-step"><div className="section-head"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div></div><p className="muted step-description">{description}</p>{children}</section>; }
function Field({ label: fieldLabel, wide=false, children }: { label:string;wide?:boolean;children:React.ReactNode }) { return <label className={wide?'span-two':''}>{fieldLabel}{children}</label>; }
function SaveButton({ saving, enabled, onClick, children }: { saving:boolean;enabled:boolean;onClick:()=>void;children:React.ReactNode }) { return <button className="primary-button onboarding-save" disabled={saving||!enabled} onClick={onClick}>{saving?'Saving…':children}</button>; }

function PropertyEditor({ item,index,update }:{item:OfferingDraft;index:number;update:(index:number,patch:Partial<OfferingDraft>)=>void}) {
  const set=(patch:Partial<OfferingDraft>)=>update(index,patch);
  return <article className="offering-editor property-editor">
    <div className="offering-editor-head"><span>{index+1}</span><div><p className="eyebrow">Property / unit</p><h3>{item.name||'New property'}</h3></div></div>
    <div className="settings-form-grid">
      <Field label="Property name *"><input value={item.name} onChange={event=>set({name:event.target.value})}/></Field><Field label="Property ID *"><input value={item.propertyCode} onChange={event=>set({propertyCode:event.target.value.toUpperCase()})}/></Field>
      <Field label="Description" wide><textarea rows={3} value={item.description} onChange={event=>set({description:event.target.value})}/></Field>
      <Field label="Location / address *"><input value={item.locationName} onChange={event=>set({locationName:event.target.value})} placeholder="Janda Baik, Pahang"/></Field><Field label="Google Maps URL"><input type="url" value={item.googleMapsUrl} onChange={event=>set({googleMapsUrl:event.target.value})} placeholder="https://maps.google.com/…"/></Field>
      <Field label="Unit / room type *"><input value={item.roomType} onChange={event=>set({roomType:event.target.value})}/></Field><Field label="Number of units"><input type="number" min="1" value={item.unitCount} onChange={event=>set({unitCount:Number(event.target.value)})}/></Field>
      <Field label="Number of rooms"><input type="number" min="0" value={item.roomCount} onChange={event=>set({roomCount:Number(event.target.value)})}/></Field><Field label="Guest capacity *"><input type="number" min="1" value={item.maxGuests} onChange={event=>set({maxGuests:Number(event.target.value)})}/></Field>
      <Field label="Bedrooms"><input type="number" min="0" value={item.bedrooms} onChange={event=>set({bedrooms:Number(event.target.value)})}/></Field><Field label="Bathrooms"><input type="number" min="0" value={item.bathrooms} onChange={event=>set({bathrooms:Number(event.target.value)})}/></Field>
      <Field label="Weekday price (MYR)"><input type="number" min="0" step="0.01" value={item.weekdayPrice} onChange={event=>set({weekdayPrice:Number(event.target.value)})}/></Field><Field label="Weekend price (MYR)"><input type="number" min="0" step="0.01" value={item.weekendPrice} onChange={event=>set({weekendPrice:Number(event.target.value)})}/></Field>
      <Field label="Public holiday price (MYR)"><input type="number" min="0" step="0.01" value={item.publicHolidayPrice} onChange={event=>set({publicHolidayPrice:Number(event.target.value)})}/></Field><Field label="Peak season price (MYR)"><input type="number" min="0" step="0.01" value={item.peakSeasonPrice} onChange={event=>set({peakSeasonPrice:Number(event.target.value)})}/></Field>
      <Field label="Extra guest charge (MYR)"><input type="number" min="0" step="0.01" value={item.extraGuestCharge} onChange={event=>set({extraGuestCharge:Number(event.target.value)})}/></Field><Field label="Cleaning fee (MYR)"><input type="number" min="0" step="0.01" value={item.cleaningFee} onChange={event=>set({cleaningFee:Number(event.target.value)})}/></Field>
      <Field label="Security deposit (MYR)"><input type="number" min="0" step="0.01" value={item.deposit} onChange={event=>set({deposit:Number(event.target.value)})}/></Field><Field label="Availability"><input value={item.availability} onChange={event=>set({availability:event.target.value})}/></Field>
      <Field label="Minimum nights"><input type="number" min="1" value={item.minimumNights} onChange={event=>set({minimumNights:Number(event.target.value)})}/></Field><Field label="Maximum nights"><input type="number" min="1" value={item.maximumNights} onChange={event=>set({maximumNights:Number(event.target.value)})}/></Field>
      <Field label="Check-in time"><input type="time" value={item.checkInTime} onChange={event=>set({checkInTime:event.target.value})}/></Field><Field label="Check-out time"><input type="time" value={item.checkOutTime} onChange={event=>set({checkOutTime:event.target.value})}/></Field>
      <label className="toggle-field"><input type="checkbox" checked={item.sameDayBooking} onChange={event=>set({sameDayBooking:event.target.checked})}/><span><strong>Same-day booking</strong><small>Guests may book on the check-in date</small></span></label>
      <label className="toggle-field"><input type="checkbox" checked={item.privatePool} onChange={event=>set({privatePool:event.target.checked,amenities:event.target.checked?[...new Set([...item.amenities,'Private pool'])]:item.amenities.filter(value=>value!=='Private pool')})}/><span><strong>Private pool</strong><small>Available exclusively to this unit</small></span></label>
      <label className="toggle-field"><input type="checkbox" checked={item.earlyCheckInAllowed} onChange={event=>set({earlyCheckInAllowed:event.target.checked})}/><span><strong>Early check-in</strong><small>Available subject to the stored rules</small></span></label>
      <label className="toggle-field"><input type="checkbox" checked={item.lateCheckOutAllowed} onChange={event=>set({lateCheckOutAllowed:event.target.checked})}/><span><strong>Late check-out</strong><small>Available subject to the stored rules</small></span></label>
      <Field label="Booking rules *" wide><textarea rows={4} value={item.bookingRules} onChange={event=>set({bookingRules:event.target.value})}/></Field><Field label="Cancellation policy *" wide><textarea rows={3} value={item.cancellationPolicy} onChange={event=>set({cancellationPolicy:event.target.value})}/></Field>
    </div>
    <strong className="field-heading">Facilities & amenities</strong><div className="chip-picker amenity-picker">{amenityOptions.map(option=><button key={option} className={item.amenities.includes(option)?'selected':''} onClick={()=>set({amenities:item.amenities.includes(option)?item.amenities.filter(value=>value!==option):[...item.amenities,option],privatePool:option==='Private pool'?!item.amenities.includes(option):item.privatePool})}>{option}</button>)}</div>
  </article>;
}

function StandardOfferingEditor({ item,index,definition,update }:{item:OfferingDraft;index:number;definition:ReturnType<typeof getBusinessTypeDefinition>;update:(index:number,patch:Partial<OfferingDraft>)=>void}) {
  const set=(patch:Partial<OfferingDraft>)=>update(index,patch),has=(field:string)=>definition.offeringFields.includes(field as any),setAttribute=(key:string,value:string|number|boolean|string[])=>set({attributes:{...item.attributes,[key]:value}});
  return <article className="offering-editor">
    <div className="offering-editor-head"><span>{index+1}</span><div><p className="eyebrow">{definition.labels.offeringSingular}</p><h3>{item.name||`New ${definition.labels.offeringSingular.toLowerCase()}`}</h3></div></div>
    <div className="settings-form-grid"><Field label={`${definition.labels.offeringSingular} name *`}><input value={item.name} onChange={event=>set({name:event.target.value})}/></Field><Field label="Price (MYR)"><input type="number" min="0" step="0.01" value={item.price} onChange={event=>set({price:Number(event.target.value)})}/></Field><Field label="Description" wide><textarea rows={3} value={item.description} onChange={event=>set({description:event.target.value})}/></Field>{has('DURATION')?<Field label="Duration (minutes)"><input type="number" min="5" step="5" value={item.durationMinutes} onChange={event=>set({durationMinutes:Number(event.target.value)})}/></Field>:null}{has('CAPACITY')?<Field label="Capacity"><input type="number" min="1" value={item.capacity} onChange={event=>set({capacity:Number(event.target.value)})}/></Field>:null}{has('STAFF')?<Field label={`${definition.labels.staffSingular} names`}><input value={item.staffNames.join(', ')} onChange={event=>set({staffNames:event.target.value.split(',').map(value=>value.trim()).filter(Boolean)})} placeholder="Aina, Sarah"/></Field>:null}{has('DEPOSIT')?<Field label="Deposit (MYR)"><input type="number" min="0" step="0.01" value={item.deposit} onChange={event=>set({deposit:Number(event.target.value)})}/></Field>:null}{has('STOCK')?<Field label="Opening stock"><input type="number" min="0" value={item.stockQuantity} onChange={event=>set({stockQuantity:Number(event.target.value)})}/></Field>:null}{has('PREPARATION_TIME')?<Field label="Preparation time (minutes)"><input type="number" min="0" value={item.preparationMinutes} onChange={event=>set({preparationMinutes:Number(event.target.value)})}/></Field>:null}
      {definition.customFields.map(field=><CustomOfferingInput key={field.key} field={field} value={item.attributes[field.key]} set={value=>setAttribute(field.key,value)}/>)}
    </div>
  </article>;
}

function CustomOfferingInput({field,value,set}:{field:CustomOfferingField;value:string|number|boolean|string[]|undefined;set:(value:string|number|boolean|string[])=>void}){
  if(field.type==='BOOLEAN')return <label className="toggle-field"><input type="checkbox" checked={Boolean(value)} onChange={event=>set(event.target.checked)}/><span><strong>{field.label}</strong><small>Saved as part of this industry offering</small></span></label>;
  if(field.type==='LIST')return <Field label={`${field.label}${field.required?' *':''}`}><input value={Array.isArray(value)?value.join(', '):''} onChange={event=>set(event.target.value.split(',').map(item=>item.trim()).filter(Boolean))} placeholder={field.placeholder}/></Field>;
  if(field.type==='SELECT')return <Field label={`${field.label}${field.required?' *':''}`}><select value={String(value??'')} onChange={event=>set(event.target.value)}>{field.options?.map(option=><option key={option} value={option}>{option}</option>)}</select></Field>;
  if(field.type==='NUMBER'||field.type==='MONEY')return <Field label={`${field.label}${field.required?' *':''}`}><input type="number" min="0" step={field.type==='MONEY'?'0.01':'1'} value={Number(value??0)} onChange={event=>set(Number(event.target.value))}/></Field>;
  return <Field label={`${field.label}${field.required?' *':''}`}><input value={String(value??'')} onChange={event=>set(event.target.value)} placeholder={field.placeholder}/></Field>;
}

function PlanPanel({overview,billing,plans,currentPlan,checkoutPlan,onCheckout}:{overview:TenantPlanOverview|null;billing:BillingOverview|null;plans:SaaSPlan[];currentPlan:SaaSPlan|null|undefined;checkoutPlan:string|null;onCheckout:(planCode:string)=>Promise<void>}){
  const pending=billing?.checkout&&['PENDING','ACTION_REQUIRED'].includes(billing.checkout.status)?billing.checkout:null,trial=overview?.subscription?.status==='TRIAL'?overview.subscription:null;
  return <aside className="workspace-card plan-panel"><div className="section-head"><div><p className="eyebrow">Plan & billing</p><h2>{currentPlan?.name??'Choose a plan'}</h2></div>{overview?.subscription?<span className={`settings-status ${['ACTIVE','TRIAL'].includes(overview.subscription.status)?'configured':''}`}>{overview.subscription.status}</span>:null}</div>{pending?<div className="billing-pending"><strong>HitPay confirmation pending</strong><span>Activation waits for a verified payment webhook.</span>{pending.checkoutUrl?<a href={pending.checkoutUrl}>Continue checkout</a>:null}</div>:null}{currentPlan?<>{trial?<><strong className="plan-price">{trialRemaining(trial.trialEndsAt)}<small>days remaining</small></strong><p className="muted">No payment is collected during setup.</p></>:<strong className="plan-price">{money(currentPlan.monthlyPriceMinor,currentPlan.currency)}<small>/ month</small></strong>}<div className="quota-list">{overview?.quotas.map(row=><div key={row.key}><div><strong>{label(row.key)}</strong><span>{row.kind==='QUOTA'?`${row.used??0} / ${row.limit??0}`:row.enabled?'Included':'Unavailable'}</span></div>{row.kind==='QUOTA'?<div className="quota-track"><i style={{width:`${Math.min(100,((row.used??0)/Math.max(1,row.limit??1))*100)}%`}}/></div>:null}</div>)}</div></>:<div className="available-plans"><p className="muted">Monthly subscription paid securely through HitPay.</p>{plans.filter(plan=>plan.monthlyPriceMinor>0).map(plan=><div className="billing-plan" key={plan.id}><div><strong>{plan.name}</strong><span>{money(plan.monthlyPriceMinor,plan.currency)} / month</span></div><button className="primary-button" disabled={Boolean(checkoutPlan)||Boolean(pending)||authenticationMode()!=='GOOGLE'} onClick={()=>void onCheckout(plan.code)}>{checkoutPlan===plan.code?'Opening…':'Subscribe'}</button></div>)}</div>}</aside>;
}
