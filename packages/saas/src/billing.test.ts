import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { HitPayRecurringGateway, SaasBillingService, type BillingCheckout, type SaasBillingRepository } from './index.js';

function checkout(overrides:Partial<BillingCheckout>={}):BillingCheckout{return{id:'c1',tenantId:'t1',planCode:'GROWTH',provider:'HITPAY',reference:'wsb:c1',providerSubscriptionId:null,status:'PENDING',checkoutUrl:null,amountMinor:19900,currency:'MYR',customerEmail:'owner@example.com',createdByUserId:'u1',lastError:null,createdAt:new Date('2026-08-29T00:00:00Z'),updatedAt:new Date('2026-08-29T00:00:00Z'),...overrides};}

test('HitPay recurring checkout sends a monthly MYR subscription without exposing the API key',async()=>{
  let request:any;
  const gateway=new HitPayRecurringGateway({apiKey:'secret-api-key',webhookSalt:'webhook-salt',baseUrl:'https://api.sandbox.hit-pay.com',fetch:async(url,init)=>{request={url,init,body:JSON.parse(String(init?.body))};return new Response(JSON.stringify({id:'hp-sub-1',url:'https://securecheckout.hit-pay.com/subscription/1',status:'pending'}),{status:200,headers:{'content-type':'application/json'}});}});
  const result=await gateway.createRecurring({reference:'wsb:c1',customerEmail:'owner@example.com',customerName:'Owner',planName:'Growth',amountMinor:19900,currency:'MYR',redirectUrl:'https://wsadmin-biz.imai.my/?billing=return'});
  assert.equal(request.url,'https://api.sandbox.hit-pay.com/v1/recurring-billing');
  assert.equal(request.init.headers['X-BUSINESS-API-KEY'],'secret-api-key');
  assert.equal(request.body.amount,199);
  assert.equal(request.body.cycle,'monthly');
  assert.equal(request.body.currency,'MYR');
  assert.deepEqual(request.body.payment_methods,['card']);
  assert.equal(result.providerSubscriptionId,'hp-sub-1');
  assert.match(result.checkoutUrl,/securecheckout/);
});

test('HitPay webhook requires the raw-body HMAC signature',async()=>{
  const gateway=new HitPayRecurringGateway({apiKey:'key',webhookSalt:'salt',baseUrl:'https://api.sandbox.hit-pay.com',fetch:async()=>new Response()});
  const raw=Buffer.from(JSON.stringify({id:'hp-sub-1',reference:'wsb:c1',status:'active',updated_at:'2026-08-29T00:00:00Z'}));
  const signature=createHmac('sha256','salt').update(raw).digest('hex');
  const event=await gateway.verifyWebhook(raw,{'hitpay-signature':signature,'hitpay-event-object':'recurring_billing','hitpay-event-type':'subscription_updated'});
  assert.equal(event.providerSubscriptionId,'hp-sub-1');
  assert.equal(event.reference,'wsb:c1');
  assert.equal(event.subscriptionStatus,'ACTIVE');
  await assert.rejects(()=>gateway.verifyWebhook(raw,{'hitpay-signature':'0'.repeat(64),'hitpay-event-object':'recurring_billing','hitpay-event-type':'subscription_updated'}));
});

test('subscription becomes active only from a verified, idempotent provider event',async()=>{
  const row=checkout({providerSubscriptionId:'hp-sub-1',checkoutUrl:'https://checkout.test'}),events=new Set<string>(),subscriptions:any[]=[];
  const repo:SaasBillingRepository={
    async getPlan(){return{id:'p1',code:'GROWTH',name:'Growth',monthlyPriceMinor:19900,currency:'MYR',entitlements:{},active:true};},
    async createBillingCheckout(){return row;},async attachBillingProvider(){return row;},async failBillingCheckout(){return row;},async getBillingOverview(){return{checkout:row,invoices:[]};},
    async recordBillingEvent(_provider,event){if(events.has(event.eventId))return false;events.add(event.eventId);return true;},
    async findBillingCheckout(){return row;},async updateBillingCheckout(_id,status){row.status=status;return row;},async finishBillingEvent(){},
    async setSubscription(tenantId,input){subscriptions.push({tenantId,...input});return{tenantId,...input,trialEndsAt:null,currentPeriodEndsAt:input.currentPeriodEndsAt??null,cancelAtPeriodEnd:false,updatedAt:new Date()};},
    async recordBillingInvoice(){},async getBillingSummary(){return{currency:'MYR',activeSubscriptions:0,pastDueSubscriptions:0,monthlyRecurringRevenueMinor:0,paidRevenueMinor:0,pendingCheckouts:0};},
  };
  const gateway:any={name:'HITPAY',async createRecurring(){throw new Error('unused');},async verifyWebhook(){return{eventId:'event-1',eventName:'recurring_billing.subscription_updated',providerSubscriptionId:'hp-sub-1',reference:'wsb:c1',subscriptionStatus:'ACTIVE',chargeId:null,amountMinor:null,currency:null,occurredAt:new Date('2026-08-29T00:00:00Z'),rawStatus:'active'};}};
  const service=new SaasBillingService(repo,()=>gateway);
  const first=await service.reconcile('HITPAY',Buffer.from('{}'),{}),second=await service.reconcile('HITPAY',Buffer.from('{}'),{});
  assert.equal(first.duplicate,false);
  assert.equal(second.duplicate,true);
  assert.equal(subscriptions.length,1);
  assert.equal(subscriptions[0].status,'ACTIVE');
});

test('an unfinished checkout is reused instead of creating a second HitPay subscription',async()=>{
  const pending=checkout({providerSubscriptionId:'hp-sub-1',checkoutUrl:'https://checkout.test',status:'ACTION_REQUIRED'});
  let created=0,providerCalls=0;
  const repo:any={
    async getPlan(){return{id:'p1',code:'GROWTH',name:'Growth',monthlyPriceMinor:19900,currency:'MYR',entitlements:{},active:true};},
    async getBillingOverview(){return{checkout:pending,invoices:[]};},
    async createBillingCheckout(){created+=1;return pending;},
  };
  const service=new SaasBillingService(repo,()=>({name:'HITPAY',async createRecurring(){providerCalls+=1;throw new Error('must not be called');},async verifyWebhook(){throw new Error('unused');}}));
  const result=await service.createCheckout({tenantId:'t1',planCode:'GROWTH',provider:'HITPAY',customerEmail:'owner@example.com',customerName:'Owner',createdByUserId:'u1',redirectUrl:'https://wsadmin-biz.imai.my/?billing=return'});
  assert.equal(result.id,pending.id);
  assert.equal(created,0);
  assert.equal(providerCalls,0);
});
