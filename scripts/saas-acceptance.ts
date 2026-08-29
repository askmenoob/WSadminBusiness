import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AutomationService } from '@wsadmin-business/automation';
import { EntitlementService,OnboardingService,SaasError,SubscriptionService } from '@wsadmin-business/saas';
import { createAutomationRepository,createPool,createSaasRepository } from '@wsadmin-business/database';

async function main(){const pool=createPool(),tenantId=randomUUID();try{
  await pool.query(`INSERT INTO tenants(id,name,slug) VALUES($1,'SaaS UAT',$2)`,[tenantId,`saas-${tenantId.slice(0,8)}`]);
  const repo=createSaasRepository(pool),subscriptions=new SubscriptionService(repo),onboarding=new OnboardingService(repo),entitlements=new EntitlementService(repo);
  await subscriptions.createPlan({code:'STARTER',name:'Starter',monthlyPriceMinor:5900,entitlements:{ai_requests:2,bookings_monthly:10,campaigns_monthly:1}});
  await subscriptions.set(tenantId,{planCode:'STARTER',status:'ACTIVE',currentPeriodEndsAt:new Date('2026-09-28')});
  await onboarding.save(tenantId,'BUSINESS_PROFILE',{businessName:'SaaS UAT',registrationNumber:'',contactEmail:'owner@example.test',phoneE164:'+60123456789',websiteUrl:'',addressLine1:'Kuala Lumpur',addressLine2:'',city:'Kuala Lumpur',state:'WP Kuala Lumpur',postcode:'50000',countryCode:'MY',timezone:'Asia/Kuala_Lumpur'});
  await onboarding.save(tenantId,'BUSINESS_TYPE',{businessType:'GENERAL'});
  await onboarding.save(tenantId,'BUSINESS_SUBTYPE',{businessType:'GENERAL',businessSubtype:'SERVICE_BUSINESS'});
  await onboarding.save(tenantId,'OFFERINGS',{businessType:'GENERAL',selectedOffers:['STANDARD_OFFER']});
  await onboarding.save(tenantId,'OFFERING_DETAILS',{businessType:'GENERAL',items:[{sourceKey:'STANDARD_OFFER',name:'Standard offering',description:'UAT',priceMinor:1000,durationMinutes:30,capacity:1,depositMinor:0,staffNames:['UAT Staff'],active:true}]});
  await onboarding.save(tenantId,'WORKFLOW',{businessType:'GENERAL',workflowKind:'APPOINTMENT',workflowKinds:['APPOINTMENT','ENQUIRY'],slotIntervalMinutes:15,minimumLeadMinutes:60,bookingHorizonDays:90,cancellationDeadlineMinutes:120,openTime:'09:00',closeTime:'18:00',workingDays:[1,2,3,4,5],autoConfirm:true});
  await onboarding.save(tenantId,'PAYMENT',{businessType:'GENERAL',paymentTiming:'PAY_AFTER_SERVICE',depositType:'NONE',depositValue:0,paymentMethods:['CASH'],paymentPolicy:'Pay after completion.'});
  await onboarding.save(tenantId,'WHATSAPP_AI',{businessType:'GENERAL',whatsappEnabled:true,aiEnabled:true,tone:'FRIENDLY',languages:['ms'],handoffMessage:'Team akan membantu.',businessSummary:'General UAT business with one standard offering.',connectionStatus:'DISCONNECTED'});
  const completed=await onboarding.save(tenantId,'COMPLETE',{});assert.equal(completed.completed,true);
  await entitlements.consume(tenantId,'ai_requests',1,'2026-08');await entitlements.consume(tenantId,'ai_requests',1,'2026-08');let quota=false;try{await entitlements.consume(tenantId,'ai_requests',1,'2026-08');}catch(error){quota=error instanceof SaasError&&error.code==='quota_exceeded';}assert.equal(quota,true);
  await repo.upsertAiPrice('GROQ','test-model',1000000,2000000);await pool.query(`INSERT INTO ai_usage_logs(tenant_id,provider,model,operation,input_tokens,output_tokens,latency_ms,success) VALUES($1,'GROQ','test-model','uat',1000,500,250,true)`,[tenantId]);await pool.query(`INSERT INTO whatsapp_instances(tenant_id,provider,provider_instance_name,display_name,status) VALUES($1,'EVOLUTION',$2,'WSadmin','DISCONNECTED')`,[tenantId,`wsb-${tenantId.replaceAll('-','').slice(0,24)}`]);
  const automation=new AutomationService(createAutomationRepository(pool));await automation.schedule({tenantId,trigger:'BIRTHDAY',triggerKey:'customer:x',windowKey:'2026-08-28',dueAt:new Date(Date.now()+86400000)});
  const dashboard=await repo.systemDashboard(),health=dashboard.tenantHealth.find(row=>row.tenantId===tenantId);assert.equal(health?.subscriptionStatus,'ACTIVE');assert.equal(health?.whatsappStatus,'DISCONNECTED');assert.ok((health?.openJobs??0)>=1);assert.equal(health?.aiRequests,1);assert.ok((health?.aiCostMicrousd??0)>0);
  console.log(JSON.stringify({status:'PASS',onboarding:completed.completed,quotaEnforced:quota,plan:'STARTER',tenantHealth:health,ai:dashboard.ai}));
}finally{await pool.query('DELETE FROM tenants WHERE id=$1',[tenantId]).catch(()=>undefined);await pool.end();}}
main().catch(error=>{console.error(error);process.exit(1);});
