import test from'node:test';import assert from'node:assert/strict';import{EntitlementService,OnboardingService,SaasError,SubscriptionService}from'./index.js';
test('server-side quota enforcement rejects overage',async()=>{let used=2;const repo:any={getSubscription:async()=>({planCode:'STARTER',status:'ACTIVE'}),getPlan:async()=>({active:true,entitlements:{ai_requests:3}}),getUsage:async()=>used,incrementUsage:async(_t:any,_k:any,_p:any,a=1)=>(used+=a)};const svc=new EntitlementService(repo);assert.equal(await svc.consume('t','ai_requests'),3);await assert.rejects(()=>svc.consume('t','ai_requests'),SaasError);});
test('plan overview exposes feature state and bounded quota usage',async()=>{const repo:any={getSubscription:async()=>({tenantId:'t',planCode:'GROWTH',status:'ACTIVE'}),getPlan:async()=>({id:'p',code:'GROWTH',name:'Growth',monthlyPriceMinor:19900,currency:'MYR',active:true,entitlements:{ai_requests:1000,marketing:true}}),getUsage:async(_t:string,key:string)=>key==='ai_requests'?275:0};const result=await new SubscriptionService(repo).overview('t','2026-08');assert.equal(result.quotas.find(x=>x.key==='ai_requests')?.remaining,725);assert.equal(result.quotas.find(x=>x.key==='marketing')?.enabled,true);await assert.rejects(()=>new SubscriptionService(repo).overview('t','2026-13'),SaasError);});

test('expired trial cannot consume tenant entitlements',async()=>{const repo:any={getSubscription:async()=>({planCode:'TRIAL',status:'TRIAL',trialEndsAt:new Date('2026-08-20T00:00:00Z')}),getPlan:async()=>({active:true,entitlements:{ai_requests:100}}),getUsage:async()=>0,incrementUsage:async()=>1};const service=new EntitlementService(repo,()=>new Date('2026-08-29T00:00:00Z'));await assert.rejects(()=>service.consume('t','ai_requests'),(error:any)=>error instanceof SaasError&&error.code==='subscription_inactive');});

test('business profile setup validates and normalizes tenant-entered company details',async()=>{let saved:any=null;const repo:any={async saveOnboarding(tenantId:string,step:string,data:any,completed:boolean){saved={tenantId,step,data,completed};return{tenantId,currentStep:step,completed,data,updatedAt:new Date()};}};const service=new OnboardingService(repo);await service.save('tenant-a','BUSINESS_PROFILE',{businessName:'  Klinik Maju Sdn Bhd  ',registrationNumber:' 202601234567 ',contactEmail:' Owner@Example.COM ',phoneE164:' +60 12-345 6789 ',websiteUrl:' https://example.com ',addressLine1:' 12 Jalan Maju ',addressLine2:'',city:' Shah Alam ',state:' Selangor ',postcode:' 40100 ',countryCode:'my',timezone:'Asia/Kuala_Lumpur'});assert.deepEqual(saved.data.BUSINESS_PROFILE,{businessName:'Klinik Maju Sdn Bhd',registrationNumber:'202601234567',contactEmail:'owner@example.com',phoneE164:'+60 12-345 6789',websiteUrl:'https://example.com',addressLine1:'12 Jalan Maju',addressLine2:'',city:'Shah Alam',state:'Selangor',postcode:'40100',countryCode:'MY',timezone:'Asia/Kuala_Lumpur'});await assert.rejects(()=>service.save('tenant-a','BUSINESS_PROFILE',{businessName:'A',contactEmail:'invalid',phoneE164:'',timezone:'Not/AZone'}),(error:any)=>error instanceof SaasError&&error.code==='validation');});

test('property offering details require property-specific fields', async () => {
  let saved:any=null;
  const repo:any={
    async getOnboarding(){return{tenantId:'tenant-a',currentStep:'BUSINESS_SUBTYPE',completed:false,data:{BUSINESS_TYPE:{businessType:'PROPERTY'},BUSINESS_SUBTYPE:{businessType:'PROPERTY',businessSubtype:'HOMESTAY'}},updatedAt:new Date()};},
    async saveOnboarding(tenantId:string,step:string,data:any,completed:boolean){saved={tenantId,step,data,completed};return{tenantId,currentStep:step,completed,data,updatedAt:new Date()};},
  };
  const service=new OnboardingService(repo);
  await assert.rejects(()=>service.save('tenant-a','OFFERING_DETAILS',{businessType:'PROPERTY',items:[{name:'Villa Mawar',priceMinor:35000,durationMinutes:60}]}),(error:any)=>error instanceof SaasError&&error.code==='validation'&&/property code/i.test(error.message));
  await service.save('tenant-a','OFFERING_DETAILS',{businessType:'PROPERTY',items:[{sourceKey:'VILLA_MAWAR',name:'Villa Mawar',propertyCode:'VM-01',locationName:'Janda Baik',googleMapsUrl:'https://maps.google.com/?q=Janda+Baik',roomType:'Entire villa',bedrooms:3,bathrooms:2,maxGuests:8,privatePool:true,amenities:['WiFi','BBQ'],weekdayPriceMinor:35000,weekendPriceMinor:45000,publicHolidayPriceMinor:55000,depositMinor:10000,checkInTime:'15:00',checkOutTime:'11:00',availability:'DAILY',bookingRules:'No smoking'}]});
  assert.equal(saved.data.OFFERING_DETAILS.items[0].propertyCode,'VM-01');
  assert.equal(saved.data.OFFERING_DETAILS.items[0].publicHolidayPriceMinor,55000);
  assert.equal('durationMinutes' in saved.data.OFFERING_DETAILS.items[0],false);
});

test('automotive offering stores vehicle and workshop fields instead of a generic service only',async()=>{
  let saved:any=null;const repo:any={async saveOnboarding(tenantId:string,step:string,data:any,completed:boolean){saved={tenantId,step,data,completed};return{tenantId,currentStep:step,completed,data,updatedAt:new Date()};}};
  const service=new OnboardingService(repo),base:any={businessType:'AUTOMOTIVE',items:[{sourceKey:'GENERAL_SERVICE',name:'80k Service',priceMinor:45000,durationMinutes:120,capacity:1,depositMinor:5000,staffNames:['Azman'],attributes:{requiredParts:['Engine oil'],serviceBayRequired:true,estimateOnly:true}}]};
  await assert.rejects(()=>service.save('tenant-a','OFFERING_DETAILS',base),(error:any)=>error instanceof SaasError&&error.code==='validation'&&/vehicle information/i.test(error.message));
  base.items[0]!.attributes.vehicleInformation=['Vehicle type','Brand','Model','Year','Registration number','Mileage'];
  await service.save('tenant-a','OFFERING_DETAILS',base);
  assert.deepEqual(saved.data.OFFERING_DETAILS.items[0].attributes.vehicleInformation,['Vehicle type','Brand','Model','Year','Registration number','Mileage']);
  assert.equal(saved.data.OFFERING_DETAILS.items[0].attributes.serviceBayRequired,true);
});

test('dynamic onboarding completes only after all eight industry checkpoints', async () => {
  const required=['BUSINESS_PROFILE','BUSINESS_TYPE','BUSINESS_SUBTYPE','OFFERINGS','OFFERING_DETAILS','WORKFLOW','PAYMENT','WHATSAPP_AI'];
  const data=Object.fromEntries(required.map(key=>[key,{configured:true}]));
  let completed=false;
  const repo:any={async getOnboarding(){return{tenantId:'tenant-a',currentStep:'WHATSAPP_AI',completed:false,data,updatedAt:new Date()};},async saveOnboarding(_tenantId:string,step:string,_data:any,isComplete:boolean){completed=isComplete;return{tenantId:'tenant-a',currentStep:step,completed:isComplete,data,updatedAt:new Date()};}};
  const service=new OnboardingService(repo);
  const state=await service.save('tenant-a','COMPLETE',{});
  assert.equal(completed,true);
  assert.equal(state.completed,true);
});
