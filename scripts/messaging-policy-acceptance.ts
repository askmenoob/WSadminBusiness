import assert from'node:assert/strict';
import{randomUUID}from'node:crypto';
import{AutomationMessageDispatcher,AutomationService,MessagingPolicyService}from'@wsadmin-business/automation';
import{createAutomationRepository,createDeliveryRepository,createLifecycleRepository,createMessagingPolicyRepository,createPool}from'@wsadmin-business/database';
async function main(){
 const pool=createPool(),tenantId=randomUUID();
 try{
  await pool.query(`INSERT INTO tenants(id,name,slug) VALUES($1,'Policy UAT',$2)`,[tenantId,`policy-${tenantId.slice(0,8)}`]);
  const customerId=(await pool.query(`INSERT INTO customers(tenant_id,name,phone) VALUES($1,'Policy Customer','+60120000000') RETURNING id`,[tenantId])).rows[0].id;
  const instance=(await pool.query(`INSERT INTO whatsapp_instances(tenant_id,provider,provider_instance_name,display_name,status,phone_e164) VALUES($1,'EVOLUTION',$2,'WSadmin','CONNECTED','+60110000000') RETURNING id,provider_instance_name`,[tenantId,`wsb-${tenantId.replaceAll('-','').slice(0,24)}`])).rows[0];
  const automation=createAutomationRepository(pool),lifecycle=createLifecycleRepository(pool),delivery=createDeliveryRepository(pool),policyRepo=createMessagingPolicyRepository(pool),service=new AutomationService(automation),policy=new MessagingPolicyService(policyRepo);
  const payload=(marketing:boolean,text:string)=>({textContent:text,toE164:'+60120000000',instanceId:instance.id,provider:'EVOLUTION',providerInstanceName:instance.provider_instance_name,marketing,context:{customer_name:'Policy Customer'}});
  const daytime=new Date('2026-08-28T01:00:00Z');
  await service.schedule({tenantId,trigger:'MANUAL_CAMPAIGN',triggerKey:'consent',windowKey:'1',customerId,dueAt:daytime,payload:payload(true,'Consent check')});
  let dispatcher=new AutomationMessageDispatcher(automation,lifecycle,delivery,()=>daytime,policy);
  let result=await dispatcher.processOne();assert.equal(result?.status,'SKIPPED');
  let audit=await pool.query(`SELECT reason FROM messaging_policy_audit WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1`,[tenantId]);assert.equal(audit.rows[0].reason,'marketing_consent_required');
  await policyRepo.upsertPreference(tenantId,customerId,{marketingOptIn:true});
  const quietTime=new Date('2026-08-28T15:00:00Z');
  await service.schedule({tenantId,trigger:'MANUAL_CAMPAIGN',triggerKey:'quiet',windowKey:'1',customerId,dueAt:quietTime,payload:payload(true,'Quiet check')});
  dispatcher=new AutomationMessageDispatcher(automation,lifecycle,delivery,()=>quietTime,policy);result=await dispatcher.processOne();assert.equal(result?.status,'DEFERRED');
  const deferred=await pool.query(`SELECT status,available_at FROM automation_jobs WHERE tenant_id=$1 AND trigger_key='quiet'`,[tenantId]);assert.equal(deferred.rows[0].status,'DEFERRED');assert.ok(deferred.rows[0].available_at>quietTime);
  await policyRepo.upsertPolicy(tenantId,{quietStartMinute:0,quietEndMinute:0,maxMessagesPerMinute:100});
  const allowedTime=new Date('2026-08-28T05:00:00Z');
  await service.schedule({tenantId,trigger:'BOOKING_CONFIRMED',triggerKey:'allowed',windowKey:'1',customerId,dueAt:allowedTime,payload:payload(false,'Allowed transactional')});
  dispatcher=new AutomationMessageDispatcher(automation,lifecycle,delivery,()=>allowedTime,policy);result=await dispatcher.processOne();assert.equal(result?.status,'DISPATCHED');
  const sent=await pool.query(`SELECT max_attempts FROM whatsapp_outbound_deliveries WHERE tenant_id=$1 AND text_content='Allowed transactional'`,[tenantId]);assert.equal(sent.rowCount,1);assert.equal(sent.rows[0].max_attempts,5);
  await policyRepo.upsertPreference(tenantId,customerId,{whatsappEnabled:false,marketingOptIn:false});
  const optOutTime=new Date('2026-08-28T05:05:00Z');
  await service.schedule({tenantId,trigger:'BOOKING_CONFIRMED',triggerKey:'optout',windowKey:'1',customerId,dueAt:optOutTime,payload:payload(false,'Blocked transactional')});
  dispatcher=new AutomationMessageDispatcher(automation,lifecycle,delivery,()=>optOutTime,policy);result=await dispatcher.processOne();assert.equal(result?.status,'SKIPPED');
  audit=await pool.query(`SELECT reason FROM messaging_policy_audit WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1`,[tenantId]);assert.equal(audit.rows[0].reason,'customer_whatsapp_opt_out');
  console.log(JSON.stringify({status:'PASS',marketingConsentBlocked:true,quietHoursDeferred:true,transactionalAllowed:true,maxAttempts:5,optOutBlocked:true}));
 }finally{await pool.query('DELETE FROM tenants WHERE id=$1',[tenantId]).catch(()=>undefined);await pool.end();}
}
main().catch(error=>{console.error(error);process.exit(1)});
