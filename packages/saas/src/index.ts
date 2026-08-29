import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getBusinessTypeDefinition, isBusinessSubtype, type BusinessTypeKey, type BusinessWorkflow, type CustomOfferingField } from '@wsadmin-business/verticals';

export type SubscriptionStatus='TRIAL'|'ACTIVE'|'PAST_DUE'|'CANCELLED';export type OnboardingState={tenantId:string;currentStep:string;completed:boolean;data:Record<string,unknown>;updatedAt:Date};export type Plan={id:string;code:string;name:string;monthlyPriceMinor:number;currency:string;entitlements:Record<string,number|boolean>;active:boolean};export type Subscription={tenantId:string;planCode:string;status:SubscriptionStatus;trialEndsAt:Date|null;currentPeriodEndsAt:Date|null;cancelAtPeriodEnd:boolean;updatedAt:Date};export type PlanQuota={key:string;kind:'QUOTA'|'FEATURE';limit:number|null;used:number|null;remaining:number|null;enabled:boolean};export type TenantPlanOverview={tenantId:string;periodKey:string;subscription:Subscription|null;plan:Plan|null;quotas:PlanQuota[]};export type SystemDashboard={tenants:number;subscriptions:Record<string,number>;whatsapp:Record<string,number>;automation:Record<string,number>;ai:{requests:number;inputTokens:number;outputTokens:number;latencyAvgMs:number;estimatedCostMicrousd:number};tenantHealth:{tenantId:string;name:string;subscriptionStatus:string|null;planCode:string|null;whatsappStatus:string|null;openJobs:number;aiRequests:number;aiCostMicrousd:number}[]};
export type TenantBusinessContext={tenantId:string;businessId:string;name:string;businessType:BusinessTypeKey;businessSubtype:string|null;offeringKind:string;workflowKind:BusinessWorkflow;setupConfig:Record<string,unknown>;labels:{offeringSingular:string;offeringPlural:string;transactionSingular:string;transactionPlural:string;customerSingular:string;staffSingular:string};offerings:{id:string;sourceKey:string;offeringType:string;name:string;description:string|null;priceMinor:number;currency:string;durationMinutes:number|null;capacity:number;depositMinor:number;attributes:Record<string,unknown>;active:boolean}[]};
export interface SaasRepository{getOnboarding(t:string):Promise<OnboardingState>;saveOnboarding(t:string,step:string,data:Record<string,unknown>,completed:boolean):Promise<OnboardingState>;getBusinessContext(t:string):Promise<TenantBusinessContext|null>;createPlan(i:{code:string;name:string;monthlyPriceMinor:number;currency?:string;entitlements:Record<string,number|boolean>}):Promise<Plan>;getPlan(code:string):Promise<Plan|null>;listPlans():Promise<Plan[]>;setSubscription(t:string,i:{planCode:string;status:SubscriptionStatus;trialEndsAt?:Date|null;currentPeriodEndsAt?:Date|null;cancelAtPeriodEnd?:boolean}):Promise<Subscription>;getSubscription(t:string):Promise<Subscription|null>;getUsage(t:string,key:string,periodKey:string):Promise<number>;incrementUsage(t:string,key:string,periodKey:string,amount?:number):Promise<number>;systemDashboard():Promise<SystemDashboard>;upsertAiPrice(provider:string,model:string,inputMicrosPerMillion:number,outputMicrosPerMillion:number):Promise<void>;}
export class SaasError extends Error{constructor(message:string,public readonly code='saas_error'){super(message);this.name='SaasError';}}
const requiredText=(value:unknown,label:string,min:number,max:number)=>{const text=typeof value==='string'?value.trim():'';if(text.length<min||text.length>max)throw new SaasError(`${label} must be ${min}-${max} characters`,'validation');return text;};
const optionalText=(value:unknown,label:string,max:number)=>{const text=typeof value==='string'?value.trim():'';if(text.length>max)throw new SaasError(`${label} must be at most ${max} characters`,'validation');return text;};
const businessProfile=(data:Record<string,unknown>)=>{
  const contactEmail=requiredText(data.contactEmail,'contact email',5,254).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))throw new SaasError('contact email is invalid','validation');
  const websiteUrl=optionalText(data.websiteUrl,'website URL',300);
  if(websiteUrl){try{const url=new URL(websiteUrl);if(!['http:','https:'].includes(url.protocol))throw new Error();}catch{throw new SaasError('website URL must use http or https','validation');}}
  const timezone=requiredText(data.timezone,'timezone',3,80);
  try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format(new Date());}catch{throw new SaasError('timezone is invalid','validation');}
  const countryCode=optionalText(data.countryCode,'country code',2).toUpperCase()||'MY';
  if(!/^[A-Z]{2}$/.test(countryCode))throw new SaasError('country code must contain two letters','validation');
  return{businessName:requiredText(data.businessName,'business name',2,120),registrationNumber:optionalText(data.registrationNumber,'registration number',80),contactEmail,phoneE164:requiredText(data.phoneE164,'contact phone',7,40),websiteUrl,addressLine1:optionalText(data.addressLine1,'address line 1',200),addressLine2:optionalText(data.addressLine2,'address line 2',200),city:optionalText(data.city,'city',100),state:optionalText(data.state,'state',100),postcode:optionalText(data.postcode,'postcode',20),countryCode,timezone};
};

export const ONBOARDING_STEPS = ['BUSINESS_PROFILE','BUSINESS_TYPE','BUSINESS_SUBTYPE','OFFERINGS','OFFERING_DETAILS','WORKFLOW','PAYMENT','WHATSAPP_AI'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number] | 'COMPLETE';

const integer=(value:unknown,label:string,min:number,max:number)=>{const number=Number(value);if(!Number.isInteger(number)||number<min||number>max)throw new SaasError(`${label} must be an integer from ${min} to ${max}`,'validation');return number;};
const boolean=(value:unknown,fallback=false)=>typeof value==='boolean'?value:fallback;
const stringList=(value:unknown,label:string,min=0,max=30)=>{if(!Array.isArray(value))throw new SaasError(`${label} must be a list`,'validation');const rows=[...new Set(value.map(item=>typeof item==='string'?item.trim():'').filter(Boolean))];if(rows.length<min||rows.length>max)throw new SaasError(`${label} must contain ${min}-${max} items`,'validation');return rows;};
const timeText=(value:unknown,label:string,fallback:string)=>{const text=typeof value==='string'&&value.trim()?value.trim():fallback;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(text))throw new SaasError(`${label} must use HH:MM`,'validation');return text;};
const businessType=(data:Record<string,unknown>)=>{const requested=requiredText(data.businessType,'business type',2,60).toUpperCase() as BusinessTypeKey;return{businessType:getBusinessTypeDefinition(requested).key};};
const businessSubtype=(data:Record<string,unknown>)=>{const type=businessType(data).businessType,subtype=requiredText(data.businessSubtype,'business sub-type',2,80).toUpperCase();if(!isBusinessSubtype(type,subtype))throw new SaasError('business sub-type does not belong to the selected business type','validation');return{businessType:type,businessSubtype:subtype};};
const offerings=(data:Record<string,unknown>)=>{const type=businessType(data).businessType,definition=getBusinessTypeDefinition(type),selectedOffers=stringList(data.selectedOffers,'selected offerings',1,30).map(value=>value.toUpperCase());const valid=new Set(definition.offeringPresets.map(row=>row.key));if(selectedOffers.some(value=>!valid.has(value)))throw new SaasError('selected offering does not belong to the selected business type','validation');return{businessType:type,selectedOffers};};
const sourceKey=(value:unknown,index:number)=>{const text=typeof value==='string'?value.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g,'_').replace(/^_|_$/g,''):'';return text||`OFFER_${index+1}`;};
const urlText=(value:unknown,label:string)=>{const text=optionalText(value,label,500);if(!text)return'';try{const url=new URL(text);if(!['http:','https:'].includes(url.protocol))throw new Error();}catch{throw new SaasError(`${label} must use http or https`,'validation');}return text;};
const propertyItem=(raw:Record<string,unknown>,index:number)=>{
  const minimumNights=integer(raw.minimumNights??1,'minimum nights',1,365),maximumNights=integer(raw.maximumNights??30,'maximum nights',1,730);
  if(maximumNights<minimumNights)throw new SaasError('maximum nights cannot be lower than minimum nights','validation');
  return{
    sourceKey:sourceKey(raw.sourceKey,index),name:requiredText(raw.name,'property name',2,160),description:optionalText(raw.description,'property description',2000),
    propertyCode:requiredText(raw.propertyCode,'property code',2,80).toUpperCase(),locationName:requiredText(raw.locationName,'property location',2,200),googleMapsUrl:urlText(raw.googleMapsUrl,'Google Maps URL'),roomType:requiredText(raw.roomType,'room or unit type',2,120),
    unitCount:integer(raw.unitCount??1,'number of units',1,10000),roomCount:integer(raw.roomCount??raw.bedrooms??1,'number of rooms',0,10000),bedrooms:integer(raw.bedrooms,'bedrooms',0,100),bathrooms:integer(raw.bathrooms,'bathrooms',0,100),maxGuests:integer(raw.maxGuests,'guest capacity',1,10000),privatePool:boolean(raw.privatePool),amenities:stringList(raw.amenities??[],'amenities',0,80),
    weekdayPriceMinor:integer(raw.weekdayPriceMinor,'weekday price',0,1_000_000_000),weekendPriceMinor:integer(raw.weekendPriceMinor,'weekend price',0,1_000_000_000),publicHolidayPriceMinor:integer(raw.publicHolidayPriceMinor,'public holiday price',0,1_000_000_000),peakSeasonPriceMinor:integer(raw.peakSeasonPriceMinor??0,'peak season price',0,1_000_000_000),extraGuestChargeMinor:integer(raw.extraGuestChargeMinor??0,'extra guest charge',0,1_000_000_000),cleaningFeeMinor:integer(raw.cleaningFeeMinor??0,'cleaning fee',0,1_000_000_000),depositMinor:integer(raw.depositMinor??0,'deposit',0,1_000_000_000),
    minimumNights,maximumNights,sameDayBooking:boolean(raw.sameDayBooking),checkInTime:timeText(raw.checkInTime,'check-in time','15:00'),checkOutTime:timeText(raw.checkOutTime,'check-out time','11:00'),earlyCheckInAllowed:boolean(raw.earlyCheckInAllowed),lateCheckOutAllowed:boolean(raw.lateCheckOutAllowed),availability:requiredText(raw.availability??'DAILY','availability',2,1000),bookingRules:requiredText(raw.bookingRules??'Standard house rules apply.','booking rules',2,4000),cancellationPolicy:requiredText(raw.cancellationPolicy??raw.bookingRules??'Contact the host for cancellation terms.','cancellation policy',2,4000),active:boolean(raw.active,true),
  };
};
const customAttributes=(value:unknown,fields:readonly CustomOfferingField[])=>{
  const raw=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  return Object.fromEntries(fields.map(field=>{
    const item=raw[field.key];
    if(field.type==='BOOLEAN')return[field.key,boolean(item)];
    if(field.type==='NUMBER'||field.type==='MONEY')return[field.key,integer(item??0,field.label,0,1_000_000_000)];
    if(field.type==='LIST')return[field.key,stringList(item??[],field.label,field.required?1:0,50)];
    const text=field.required?requiredText(item,field.label,1,1000):optionalText(item,field.label,1000);
    if(field.type==='SELECT'&&text&&!(field.options??[]).includes(text))throw new SaasError(`${field.label} is invalid`,'validation');
    return[field.key,text];
  }));
};
const standardItem=(raw:Record<string,unknown>,index:number,definition:ReturnType<typeof getBusinessTypeDefinition>)=>{
  const fields=definition.offeringFields;
  const item:Record<string,unknown>={sourceKey:sourceKey(raw.sourceKey,index),name:requiredText(raw.name,'offering name',2,160),description:optionalText(raw.description,'offering description',2000),priceMinor:integer(raw.priceMinor??0,'price',0,1_000_000_000),capacity:integer(raw.capacity??1,'capacity',1,10000),depositMinor:integer(raw.depositMinor??0,'deposit',0,1_000_000_000),staffNames:stringList(raw.staffNames??[],'staff names',0,100),attributes:customAttributes(raw.attributes,definition.customFields),active:boolean(raw.active,true)};
  if(fields.includes('DURATION'))item.durationMinutes=integer(raw.durationMinutes,'duration',5,10080);
  if(fields.includes('PREPARATION_TIME'))item.preparationMinutes=integer(raw.preparationMinutes??15,'preparation time',0,10080);
  if(fields.includes('STOCK'))item.stockQuantity=integer(raw.stockQuantity??0,'stock quantity',0,10_000_000);
  return item;
};
const offeringDetails=(data:Record<string,unknown>)=>{const type=businessType(data).businessType,definition=getBusinessTypeDefinition(type);if(!Array.isArray(data.items)||data.items.length<1||data.items.length>50)throw new SaasError('offering details must contain 1-50 items','validation');const items=data.items.map((row,index)=>{if(!row||typeof row!=='object')throw new SaasError('offering detail must be an object','validation');return definition.offeringKind==='PROPERTY'?propertyItem(row as Record<string,unknown>,index):standardItem(row as Record<string,unknown>,index,definition);});return{businessType:type,offeringKind:definition.offeringKind,items};};
const workflow=(data:Record<string,unknown>)=>{const type=businessType(data).businessType,definition=getBusinessTypeDefinition(type),workflowKind=requiredText(data.workflowKind,'workflow',2,40).toUpperCase() as BusinessWorkflow;if(!definition.workflows.includes(workflowKind))throw new SaasError('workflow is not supported by the selected business type','validation');const workflowKinds=(Array.isArray(data.workflowKinds)?[...new Set(data.workflowKinds.map(value=>String(value).trim().toUpperCase()))]:[workflowKind]) as BusinessWorkflow[];if(!workflowKinds.length||!workflowKinds.includes(workflowKind)||workflowKinds.some(value=>!definition.workflows.includes(value)))throw new SaasError('customer journeys must use workflows supported by the selected business type','validation');const workingDays=Array.isArray(data.workingDays)?[...new Set(data.workingDays.map(Number))]:[];if(!workingDays.length||workingDays.some(day=>!Number.isInteger(day)||day<0||day>6))throw new SaasError('working days must contain weekdays 0-6','validation');const openTime=timeText(data.openTime,'opening time','09:00'),closeTime=timeText(data.closeTime,'closing time','18:00');if(openTime>=closeTime)throw new SaasError('closing time must be later than opening time','validation');const slotIntervalMinutes=integer(data.slotIntervalMinutes??30,'slot interval',5,720);if(slotIntervalMinutes%5!==0)throw new SaasError('slot interval must use five-minute increments','validation');return{businessType:type,workflowKind,workflowKinds,slotIntervalMinutes,minimumLeadMinutes:integer(data.minimumLeadMinutes??60,'minimum lead',0,10080),bookingHorizonDays:integer(data.bookingHorizonDays??90,'booking horizon',1,730),cancellationDeadlineMinutes:integer(data.cancellationDeadlineMinutes??120,'cancellation deadline',0,43200),openTime,closeTime,workingDays,autoConfirm:boolean(data.autoConfirm,true)};};
const payment=(data:Record<string,unknown>)=>{const type=businessType(data).businessType,paymentTiming=requiredText(data.paymentTiming,'payment timing',2,40).toUpperCase();if(!['NO_PAYMENT','DEPOSIT','FULL','PAY_AFTER_SERVICE','PAY_ON_ARRIVAL','QUOTATION_FIRST','FLEXIBLE'].includes(paymentTiming))throw new SaasError('payment timing is invalid','validation');const depositType=requiredText(data.depositType??'NONE','deposit type',2,40).toUpperCase();if(!['NONE','FIXED','PERCENTAGE'].includes(depositType))throw new SaasError('deposit type is invalid','validation');const depositValue=integer(data.depositValue??0,'deposit value',0,1_000_000_000);if(depositType==='PERCENTAGE'&&depositValue>100)throw new SaasError('percentage deposit cannot exceed 100','validation');return{businessType:type,paymentTiming,depositType,depositValue,paymentMethods:stringList(data.paymentMethods,'payment methods',paymentTiming==='NO_PAYMENT'?0:1,20),paymentPolicy:requiredText(data.paymentPolicy,'payment policy',2,4000)};};
const whatsappAi=(data:Record<string,unknown>)=>{const type=businessType(data).businessType,tone=requiredText(data.tone??'FRIENDLY','AI tone',2,40).toUpperCase();if(!['FRIENDLY','PROFESSIONAL','CASUAL','CONCISE'].includes(tone))throw new SaasError('AI tone is invalid','validation');return{businessType:type,whatsappEnabled:boolean(data.whatsappEnabled,true),aiEnabled:boolean(data.aiEnabled,true),tone,languages:stringList(data.languages,'AI languages',1,10),handoffMessage:requiredText(data.handoffMessage,'handoff message',2,1000),businessSummary:requiredText(data.businessSummary,'business summary',10,4000),connectionStatus:optionalText(data.connectionStatus,'WhatsApp connection status',80)};};
export class OnboardingService{
  constructor(private readonly repo:SaasRepository){}
  async save(t:string,step:string,data:Record<string,unknown>,completed=false){
    const allowed=[...ONBOARDING_STEPS,'COMPLETE'];
    if(!allowed.includes(step))throw new SaasError('invalid onboarding step','validation');
    if(step==='COMPLETE'){const current=await this.repo.getOnboarding(t),missing=ONBOARDING_STEPS.filter(k=>!(k in current.data));if(missing.length)throw new SaasError(`onboarding incomplete: ${missing.join(',')}`,'incomplete');return this.repo.saveOnboarding(t,'COMPLETE',{},true);}
    if(step==='BUSINESS_PROFILE')return this.repo.saveOnboarding(t,step,{[step]:businessProfile(data)},completed);
    const validators:Record<string,(input:Record<string,unknown>)=>Record<string,unknown>>={BUSINESS_TYPE:businessType,BUSINESS_SUBTYPE:businessSubtype,OFFERINGS:offerings,OFFERING_DETAILS:offeringDetails,WORKFLOW:workflow,PAYMENT:payment,WHATSAPP_AI:whatsappAi};
    return this.repo.saveOnboarding(t,step,{[step]:validators[step]!(data)},completed);
  }
  get(t:string){return this.repo.getOnboarding(t);}
}
export class EntitlementService{constructor(private readonly repo:SaasRepository,private readonly now:()=>Date=()=>new Date()){}async assert(t:string,key:string,amount=1,periodKey=this.now().toISOString().slice(0,7)){const sub=await this.repo.getSubscription(t);if(!sub||!['TRIAL','ACTIVE'].includes(sub.status)||sub.status==='TRIAL'&&(!sub.trialEndsAt||sub.trialEndsAt.getTime()<=this.now().getTime()))throw new SaasError('subscription inactive','subscription_inactive');const plan=await this.repo.getPlan(sub.planCode);if(!plan||!plan.active)throw new SaasError('plan unavailable','plan_unavailable');const e=plan.entitlements[key];if(e===false||e===undefined)throw new SaasError(`entitlement ${key} disabled`,'entitlement_denied');if(typeof e==='number'){const used=await this.repo.getUsage(t,key,periodKey);if(used+amount>e)throw new SaasError(`quota ${key} exceeded`,'quota_exceeded');}return true;}async consume(t:string,key:string,amount=1,periodKey=this.now().toISOString().slice(0,7)){await this.assert(t,key,amount,periodKey);return this.repo.incrementUsage(t,key,periodKey,amount);}}
export class SubscriptionService{constructor(private readonly repo:SaasRepository){}createPlan(i:{code:string;name:string;monthlyPriceMinor:number;currency?:string;entitlements:Record<string,number|boolean>}){if(!/^[A-Z0-9_-]{2,40}$/.test(i.code))throw new SaasError('invalid plan code','validation');return this.repo.createPlan({...i,code:i.code.toUpperCase()});}set(t:string,i:{planCode:string;status:SubscriptionStatus;trialEndsAt?:Date|null;currentPeriodEndsAt?:Date|null;cancelAtPeriodEnd?:boolean}){return this.repo.setSubscription(t,{...i,planCode:i.planCode.toUpperCase()});}async overview(t:string,periodKey=new Date().toISOString().slice(0,7)):Promise<TenantPlanOverview>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey))throw new SaasError('invalid period','validation');const subscription=await this.repo.getSubscription(t),plan=subscription?await this.repo.getPlan(subscription.planCode):null,quotas:PlanQuota[]=await Promise.all(Object.entries(plan?.entitlements??{}).map(async([key,value])=>{if(typeof value==='boolean')return{key,kind:'FEATURE',limit:null,used:null,remaining:null,enabled:value};const used=await this.repo.getUsage(t,key,periodKey);return{key,kind:'QUOTA',limit:value,used,remaining:Math.max(0,value-used),enabled:true};}));return{tenantId:t,periodKey,subscription,plan,quotas};}}

export type BillingCheckoutStatus='PENDING'|'ACTION_REQUIRED'|'ACTIVE'|'FAILED'|'CANCELLED';
export type BillingCheckout={id:string;tenantId:string;planCode:string;provider:string;reference:string;providerSubscriptionId:string|null;status:BillingCheckoutStatus;checkoutUrl:string|null;amountMinor:number;currency:string;customerEmail:string;createdByUserId:string;lastError:string|null;createdAt:Date;updatedAt:Date};
export type BillingInvoice={id:string;tenantId:string;checkoutId:string|null;provider:string;providerChargeId:string;amountMinor:number;currency:string;status:'PAID'|'FAILED'|'REFUNDED';paidAt:Date|null;createdAt:Date};
export type BillingOverview={checkout:BillingCheckout|null;invoices:BillingInvoice[]};
export type BillingSummary={currency:string;activeSubscriptions:number;pastDueSubscriptions:number;monthlyRecurringRevenueMinor:number;paidRevenueMinor:number;pendingCheckouts:number};
export type BillingProviderEvent={eventId:string;eventName:string;providerSubscriptionId:string|null;reference:string|null;subscriptionStatus:SubscriptionStatus|null;chargeId:string|null;amountMinor:number|null;currency:string|null;occurredAt:Date;rawStatus:string|null;currentPeriodEndsAt?:Date|null};
export interface RecurringBillingGateway{readonly name:string;createRecurring(input:{reference:string;customerEmail:string;customerName:string|null;planName:string;amountMinor:number;currency:string;redirectUrl:string}):Promise<{providerSubscriptionId:string;checkoutUrl:string;status:BillingCheckoutStatus}>;verifyWebhook(rawBody:Buffer,headers:Record<string,string|undefined>):Promise<BillingProviderEvent>;}
export interface SaasBillingRepository{
  getPlan(code:string):Promise<Plan|null>;
  createBillingCheckout(input:{tenantId:string;planCode:string;provider:string;amountMinor:number;currency:string;customerEmail:string;createdByUserId:string}):Promise<BillingCheckout>;
  attachBillingProvider(checkoutId:string,input:{providerSubscriptionId:string;checkoutUrl:string;status:BillingCheckoutStatus}):Promise<BillingCheckout>;
  failBillingCheckout(checkoutId:string,error:string):Promise<BillingCheckout>;
  getBillingOverview(tenantId:string):Promise<BillingOverview>;
  recordBillingEvent(provider:string,event:BillingProviderEvent,rawPayload:unknown):Promise<boolean>;
  findBillingCheckout(provider:string,providerSubscriptionId:string|null,reference:string|null):Promise<BillingCheckout|null>;
  updateBillingCheckout(checkoutId:string,status:BillingCheckoutStatus):Promise<BillingCheckout>;
  finishBillingEvent(provider:string,eventId:string,input:{tenantId:string|null;checkoutId:string|null;outcome:string}):Promise<void>;
  setSubscription(tenantId:string,input:{planCode:string;status:SubscriptionStatus;trialEndsAt?:Date|null;currentPeriodEndsAt?:Date|null;cancelAtPeriodEnd?:boolean}):Promise<Subscription>;
  recordBillingInvoice(input:{tenantId:string;checkoutId:string|null;provider:string;providerChargeId:string;amountMinor:number;currency:string;status:'PAID'|'FAILED'|'REFUNDED';paidAt:Date|null}):Promise<void>;
  getBillingSummary():Promise<BillingSummary>;
}

type FetchLike=(input:string|URL,init?:RequestInit)=>Promise<Response>;
const nestedString=(value:any,paths:string[][]):string|null=>{for(const path of paths){let current=value;for(const key of path)current=current?.[key];if(typeof current==='string'&&current.trim())return current.trim();}return null;};
const parseDate=(value:unknown)=>{if(typeof value!=='string'||!value)return null;const date=new Date(value);return Number.isNaN(date.getTime())?null:date;};
const minorAmount=(value:unknown)=>{const amount=typeof value==='number'?value:Number(value);return Number.isFinite(amount)?Math.round(amount*100):null;};
const subscriptionStatus=(eventName:string,status:string|null):SubscriptionStatus|null=>{
  const normalized=(status??'').toLowerCase();
  if(['active','succeeded','completed','paid'].includes(normalized))return'ACTIVE';
  if(['past_due','past-due','inactive','failed','declined'].includes(normalized))return'PAST_DUE';
  if(['cancelled','canceled','expired','deleted'].includes(normalized))return'CANCELLED';
  if(eventName.includes('method_detached'))return'PAST_DUE';
  return null;
};

export class HitPayRecurringGateway implements RecurringBillingGateway{
  readonly name='HITPAY';
  private readonly fetcher:FetchLike;
  constructor(private readonly config:{apiKey:string;webhookSalt:string;baseUrl:string;fetch?:FetchLike;paymentMethods?:string[]}){this.fetcher=config.fetch??fetch;}
  async createRecurring(input:{reference:string;customerEmail:string;customerName:string|null;planName:string;amountMinor:number;currency:string;redirectUrl:string}){
    const response=await this.fetcher(`${this.config.baseUrl.replace(/\/$/,'')}/v1/recurring-billing`,{method:'POST',headers:{'X-BUSINESS-API-KEY':this.config.apiKey,'X-Requested-With':'XMLHttpRequest','Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({plan_id:null,name:input.planName,cycle:'monthly',amount:input.amountMinor/100,currency:input.currency.toUpperCase(),customer_email:input.customerEmail,customer_name:input.customerName??undefined,start_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),redirect_url:input.redirectUrl,reference:input.reference,payment_methods:this.config.paymentMethods?.length?this.config.paymentMethods:['card'],send_email:'true',times_to_be_charged:100})});
    const text=await response.text();let body:any={};try{body=text?JSON.parse(text):{};}catch{body={};}
    if(!response.ok)throw new SaasError(`HitPay recurring billing request failed (${response.status})`,'provider_unavailable');
    const id=String(body.id??body.recurring_billing_id??'').trim(),url=String(body.url??body.checkout_url??'').trim();
    if(!id||!url)throw new SaasError('HitPay response did not include subscription id and checkout URL','provider_invalid_response');
    return{providerSubscriptionId:id,checkoutUrl:url,status:'ACTION_REQUIRED' as const};
  }
  async verifyWebhook(rawBody:Buffer,headers:Record<string,string|undefined>):Promise<BillingProviderEvent>{
    const signature=String(headers['hitpay-signature']??headers['Hitpay-Signature']??'').trim().toLowerCase();
    const expected=createHmac('sha256',this.config.webhookSalt).update(rawBody).digest('hex');
    if(!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))throw new SaasError('Invalid HitPay webhook signature','webhook_signature');
    let body:any;try{body=JSON.parse(rawBody.toString('utf8'));}catch{throw new SaasError('Invalid HitPay webhook payload','webhook_payload');}
    const object=String(headers['hitpay-event-object']??headers['Hitpay-Event-Object']??'').trim().toLowerCase();
    const type=String(headers['hitpay-event-type']??headers['Hitpay-Event-Type']??'').trim().toLowerCase();
    const eventName=type.includes('.')?type:(object&&type?`${object}.${type}`:object||type||'unknown');
    const rawStatus=nestedString(body,[['status'],['subscription','status'],['recurring_billing','status']]);
    const providerSubscriptionId=nestedString(body,[['recurring_billing_id'],['subscription_id'],['recurring_billing','id'],['subscription','id']])??(eventName.includes('recurring_billing')?nestedString(body,[['id']]):null);
    const reference=nestedString(body,[['reference'],['reference_number'],['recurring_billing','reference'],['subscription','reference']]);
    const occurredAt=parseDate(body.updated_at??body.created_at)??new Date();
    return{eventId:createHash('sha256').update(eventName).update('\0').update(rawBody).digest('hex'),eventName,providerSubscriptionId,reference,subscriptionStatus:subscriptionStatus(eventName,rawStatus),chargeId:eventName.startsWith('charge.')?nestedString(body,[['id']]):nestedString(body,[['charge_id'],['charge','id']]),amountMinor:minorAmount(body.amount),currency:typeof body.currency==='string'?body.currency.toUpperCase():null,occurredAt,rawStatus,currentPeriodEndsAt:parseDate(body.current_period_ends_at??body.next_billing_date)};
  }
}

const addMonth=(date:Date)=>{const next=new Date(date);next.setUTCMonth(next.getUTCMonth()+1);return next;};
export class SaasBillingService{
  constructor(private readonly repo:SaasBillingRepository,private readonly gatewayFor:(name:string)=>RecurringBillingGateway){}
  overview(tenantId:string){return this.repo.getBillingOverview(tenantId);}
  summary(){return this.repo.getBillingSummary();}
  async createCheckout(input:{tenantId:string;planCode:string;provider:string;customerEmail:string;customerName:string|null;createdByUserId:string;redirectUrl:string}){
    const planCode=input.planCode.trim().toUpperCase(),plan=await this.repo.getPlan(planCode);
    if(!plan||!plan.active)throw new SaasError('Plan is unavailable','plan_unavailable');
    if(!Number.isInteger(plan.monthlyPriceMinor)||plan.monthlyPriceMinor<=0)throw new SaasError('Paid checkout requires a priced plan','plan_not_billable');
    if(!input.customerEmail.includes('@'))throw new SaasError('Authenticated billing email is required','validation');
    const existing=(await this.repo.getBillingOverview(input.tenantId)).checkout;
    if(existing?.planCode===planCode&&existing.provider===input.provider.toUpperCase()&&existing.checkoutUrl&&['PENDING','ACTION_REQUIRED'].includes(existing.status))return existing;
    const gateway=this.gatewayFor(input.provider),checkout=await this.repo.createBillingCheckout({tenantId:input.tenantId,planCode,provider:gateway.name,amountMinor:plan.monthlyPriceMinor,currency:plan.currency,customerEmail:input.customerEmail.toLowerCase(),createdByUserId:input.createdByUserId});
    try{const created=await gateway.createRecurring({reference:checkout.reference,customerEmail:checkout.customerEmail,customerName:input.customerName,planName:`WSadmin Business — ${plan.name}`,amountMinor:checkout.amountMinor,currency:checkout.currency,redirectUrl:input.redirectUrl});return await this.repo.attachBillingProvider(checkout.id,created);}catch(error){await this.repo.failBillingCheckout(checkout.id,error instanceof Error?error.message:'provider error');throw error;}
  }
  async reconcile(provider:string,rawBody:Buffer,headers:Record<string,string|undefined>){
    const gateway=this.gatewayFor(provider),event=await gateway.verifyWebhook(rawBody,headers),payload=JSON.parse(rawBody.toString('utf8'));
    const fresh=await this.repo.recordBillingEvent(gateway.name,event,payload);if(!fresh)return{accepted:true,duplicate:true};
    const checkout=await this.repo.findBillingCheckout(gateway.name,event.providerSubscriptionId,event.reference);
    if(!checkout){await this.repo.finishBillingEvent(gateway.name,event.eventId,{tenantId:null,checkoutId:null,outcome:'UNMATCHED'});return{accepted:true,duplicate:false,unmatched:true};}
    const status=event.subscriptionStatus;
    if(status==='ACTIVE'){
      await this.repo.updateBillingCheckout(checkout.id,'ACTIVE');
      await this.repo.setSubscription(checkout.tenantId,{planCode:checkout.planCode,status:'ACTIVE',currentPeriodEndsAt:event.currentPeriodEndsAt??addMonth(event.occurredAt),cancelAtPeriodEnd:false});
      if(event.chargeId)await this.repo.recordBillingInvoice({tenantId:checkout.tenantId,checkoutId:checkout.id,provider:gateway.name,providerChargeId:event.chargeId,amountMinor:event.amountMinor??checkout.amountMinor,currency:event.currency??checkout.currency,status:'PAID',paidAt:event.occurredAt});
    }else if(status==='PAST_DUE'){
      await this.repo.updateBillingCheckout(checkout.id,'FAILED');
      await this.repo.setSubscription(checkout.tenantId,{planCode:checkout.planCode,status:'PAST_DUE',currentPeriodEndsAt:event.currentPeriodEndsAt??null});
    }else if(status==='CANCELLED'){
      await this.repo.updateBillingCheckout(checkout.id,'CANCELLED');
      await this.repo.setSubscription(checkout.tenantId,{planCode:checkout.planCode,status:'CANCELLED',currentPeriodEndsAt:event.currentPeriodEndsAt??null});
    }
    await this.repo.finishBillingEvent(gateway.name,event.eventId,{tenantId:checkout.tenantId,checkoutId:checkout.id,outcome:status??'NO_STATE_CHANGE'});
    return{accepted:true,duplicate:false,unmatched:false,status:status??null};
  }
}
