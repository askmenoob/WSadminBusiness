import assert from'node:assert/strict';import{randomUUID}from'node:crypto';
import{AiBookingOrchestrator}from'@wsadmin-business/ai';
import{createAiBusinessTools,createAvailabilityRepository,createBookingRepository,createPool}from'@wsadmin-business/database';
async function main(){const pool=createPool(),tenantId=randomUUID();try{
 await pool.query(`INSERT INTO tenants(id,name,slug) VALUES($1,'AI Acceptance',$2)`,[tenantId,`ai-${tenantId.slice(0,8)}`]);
 const biz=(await pool.query(`INSERT INTO businesses(tenant_id,name) VALUES($1,'AI Acceptance Business') RETURNING id`,[tenantId])).rows[0].id;
 const loc=(await pool.query(`INSERT INTO locations(tenant_id,business_id,name,code) VALUES($1,$2,'KLCC','KLCC') RETURNING id`,[tenantId,biz])).rows[0].id;
 const svc=(await pool.query(`INSERT INTO services(tenant_id,name,duration_minutes,price_minor,currency) VALUES($1,'Facial',60,12000,'MYR') RETURNING id`,[tenantId])).rows[0].id;
 await pool.query(`INSERT INTO service_locations(tenant_id,service_id,location_id) VALUES($1,$2,$3)`,[tenantId,svc,loc]);
 const staff=(await pool.query(`INSERT INTO staff_profiles(tenant_id,display_name,booking_capacity) VALUES($1,'Aina',1) RETURNING id`,[tenantId])).rows[0].id;
 await pool.query(`INSERT INTO staff_locations(tenant_id,staff_id,location_id) VALUES($1,$2,$3)`,[tenantId,staff,loc]);
 await pool.query(`INSERT INTO staff_services(tenant_id,staff_id,service_id) VALUES($1,$2,$3)`,[tenantId,staff,svc]);
 await pool.query(`INSERT INTO staff_working_hours(tenant_id,staff_id,weekday,start_minute,end_minute) VALUES($1,$2,1,540,1080)`,[tenantId,staff]);
 const room=(await pool.query(`INSERT INTO resources(tenant_id,location_id,name,type,capacity) VALUES($1,$2,'Room 1','ROOM',1) RETURNING id`,[tenantId,loc])).rows[0].id;
 await pool.query(`INSERT INTO resource_services(tenant_id,resource_id,service_id,allocation_priority) VALUES($1,$2,$3,1)`,[tenantId,room,svc]);
 const customer=(await pool.query(`INSERT INTO customers(tenant_id,name,phone) VALUES($1,'Sarah','+60123456789') RETURNING id`,[tenantId])).rows[0].id;
 const instance=(await pool.query(`INSERT INTO whatsapp_instances(tenant_id,provider,provider_instance_name,display_name,status) VALUES($1,'EVOLUTION',$2,'WSadmin','CONNECTED') RETURNING id`,[tenantId,`wsb-${tenantId.replace(/-/g,'').slice(0,24)}`])).rows[0].id;
 const convo=(await pool.query(`INSERT INTO whatsapp_conversations(tenant_id,instance_id,customer_id,remote_jid,contact_e164,status) VALUES($1,$2,$3,'60123456789@s.whatsapp.net','+60123456789','OPEN') RETURNING id`,[tenantId,instance,customer])).rows[0].id;
 const interpreter={async interpret(){return{intent:'BOOK' as const,confidence:.97,language:'mixed' as const,entities:{service:'Facial',date:'2026-08-31',time:'10:00',pax:null,staff:null,resource:null,location:'KLCC',budgetMinor:null},missing:[],reason:'clear'};}};
 const orchestrator=new AiBookingOrchestrator(interpreter,createAiBusinessTools(pool,createAvailabilityRepository(pool),createBookingRepository(pool)));
 const out=await orchestrator.handle({tenantId,conversationId:convo,instanceId:instance,remoteJid:'60123456789@s.whatsapp.net',customerId:customer,text:'nak Facial KLCC Isnin 10 pagi',eventKey:'accept-1'});
 assert.equal(out.action,'EXECUTE');assert.ok(out.bookingId);assert.ok(out.outboundMessageId);
 const b=await pool.query('SELECT source FROM bookings WHERE tenant_id=$1 AND id=$2',[tenantId,out.bookingId]);assert.equal(b.rows[0].source,'WHATSAPP');
 const q=await pool.query('SELECT status,idempotency_key FROM whatsapp_outbound_deliveries WHERE tenant_id=$1 AND id=$2',[tenantId,out.outboundMessageId]);assert.equal(q.rows[0].status,'QUEUED');assert.match(q.rows[0].idempotency_key,/^ai:/);
 console.log(JSON.stringify({status:'PASS',bookingId:out.bookingId,outboundMessageId:out.outboundMessageId}));
 }finally{await pool.query('DELETE FROM tenants WHERE id=$1',[tenantId]).catch(()=>undefined);await pool.end();}}
main().catch(e=>{console.error(e);process.exit(1);});
