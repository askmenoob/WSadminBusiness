import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type SubscriptionStatus='TRIAL'|'ACTIVE'|'PAST_DUE'|'CANCELLED';export type OnboardingState={tenantId:string;currentStep:string;completed:boolean;data:Record<string,unknown>;updatedAt:Date};export type Plan={id:string;code:string;name:string;monthlyPriceMinor:number;currency:string;entitlements:Record<string,number|boolean>;active:boolean};export type Subscription={tenantId:string;planCode:string;status:SubscriptionStatus;trialEndsAt:Date|null;currentPeriodEndsAt:Date|null;cancelAtPeriodEnd:boolean;updatedAt:Date};export type PlanQuota={key:string;kind:'QUOTA'|'FEATURE';limit:number|null;used:number|null;remaining:number|null;enabled:boolean};export type TenantPlanOverview={tenantId:string;periodKey:string;subscription:Subscription|null;plan:Plan|null;quotas:PlanQuota[]};export type SystemDashboard={tenants:number;subscriptions:Record<string,number>;whatsapp:Record<string,number>;automation:Record<string,number>;ai:{requests:number;inputTokens:number;outputTokens:number;latencyAvgMs:number;estimatedCostMicrousd:number};tenantHealth:{tenantId:string;name:string;subscriptionStatus:string|null;planCode:string|null;whatsappStatus:string|null;openJobs:number;aiRequests:number;aiCostMicrousd:number}[]};
export interface SaasRepository{getOnboarding(t:string):Promise<OnboardingState>;saveOnboarding(t:string,step:string,data:Record<string,unknown>,completed:boolean):Promise<OnboardingState>;createPlan(i:{code:string;name:string;monthlyPriceMinor:number;currency?:string;entitlements:Record<string,number|boolean>}):Promise<Plan>;getPlan(code:string):Promise<Plan|null>;listPlans():Promise<Plan[]>;setSubscription(t:string,i:{planCode:string;status:SubscriptionStatus;trialEndsAt?:Date|null;currentPeriodEndsAt?:Date|null;cancelAtPeriodEnd?:boolean}):Promise<Subscription>;getSubscription(t:string):Promise<Subscription|null>;getUsage(t:string,key:string,periodKey:string):Promise<number>;incrementUsage(t:string,key:string,periodKey:string,amount?:number):Promise<number>;systemDashboard():Promise<SystemDashboard>;upsertAiPrice(provider:string,model:string,inputMicrosPerMillion:number,outputMicrosPerMillion:number):Promise<void>;}
export class SaasError extends Error{constructor(message:string,public readonly code='saas_error'){super(message);this.name='SaasError';}}
export class OnboardingService{constructor(private readonly repo:SaasRepository){}async save(t:string,step:string,data:Record<string,unknown>,completed=false){const allowed=['BUSINESS_PROFILE','VERTICAL','WHATSAPP','SERVICES','STAFF','HOURS','COMPLETE'];if(!allowed.includes(step))throw new SaasError('invalid onboarding step','validation');if(step==='COMPLETE'){const current=await this.repo.getOnboarding(t),required=allowed.slice(0,6);const missing=required.filter(k=>!(k in current.data));if(missing.length)throw new SaasError(`onboarding incomplete: ${missing.join(',')}`,'incomplete');return this.repo.saveOnboarding(t,'COMPLETE',{},true);}return this.repo.saveOnboarding(t,step,{[step]:data},completed); }get(t:string){return this.repo.getOnboarding(t);}}
export class EntitlementService{constructor(private readonly repo:SaasRepository){}async assert(t:string,key:string,amount=1,periodKey=new Date().toISOString().slice(0,7)){const sub=await this.repo.getSubscription(t);if(!sub||!['TRIAL','ACTIVE'].includes(sub.status))throw new SaasError('subscription inactive','subscription_inactive');const plan=await this.repo.getPlan(sub.planCode);if(!plan||!plan.active)throw new SaasError('plan unavailable','plan_unavailable');const e=plan.entitlements[key];if(e===false||e===undefined)throw new SaasError(`entitlement ${key} disabled`,'entitlement_denied');if(typeof e==='number'){const used=await this.repo.getUsage(t,key,periodKey);if(used+amount>e)throw new SaasError(`quota ${key} exceeded`,'quota_exceeded');}return true;}async consume(t:string,key:string,amount=1,periodKey=new Date().toISOString().slice(0,7)){await this.assert(t,key,amount,periodKey);return this.repo.incrementUsage(t,key,periodKey,amount);}}
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
