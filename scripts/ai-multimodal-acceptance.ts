import assert from'node:assert/strict';import{randomUUID}from'node:crypto';
import{AiMultimodalIntakeService}from'@wsadmin-business/ai';
import{WhatsAppWebhookIngestionService}from'@wsadmin-business/whatsapp';
import{createInboxRepository,createPool,createWhatsAppProviderEventRepository}from'@wsadmin-business/database';
async function main(){const pool=createPool(),tenantId=randomUUID();try{
 await pool.query(`INSERT INTO tenants(id,name,slug) VALUES($1,'Multimodal Acceptance',$2)`,[tenantId,`mm-${tenantId.slice(0,8)}`]);
 const instanceName=`wsb-${tenantId.replace(/-/g,'').slice(0,24)}`;
 await pool.query(`INSERT INTO whatsapp_instances(tenant_id,provider,provider_instance_name,display_name,status) VALUES($1,'EVOLUTION',$2,'WSadmin','CONNECTED')`,[tenantId,instanceName]);
 const payload={event:'messages.upsert',instance:instanceName,data:{key:{id:'VOICE-ACCEPT-1',remoteJid:'60123456789@s.whatsapp.net',fromMe:false},message:{audioMessage:{mimetype:'audio/ogg; codecs=opus',fileLength:2048}},messageTimestamp:1787850000,messageType:'audioMessage'}};
 const ingested=await new WhatsAppWebhookIngestionService(createWhatsAppProviderEventRepository(pool)).ingestEvolution(payload);
 assert.equal(ingested.event.message?.media?.kind,'AUDIO');assert.equal(ingested.event.message?.media?.sizeBytes,2048);
 const projection=await createInboxRepository(pool).project(ingested.record,ingested.event);assert.equal(projection?.message.mediaKind,'AUDIO');assert.match(projection?.message.mediaMimeType??'',/^audio\/ogg/);
 const calls:any[]=[];const downstream={async handle(i:any){calls.push(i);return{handled:true,action:'EXECUTE' as const,intent:'BOOK',confidence:.95,reason:'high_confidence_complete',reply:'booking ready',outboundMessageId:'out1',bookingId:'book1',knowledgeSources:[]};}};
 const media=ingested.event.message!.media!;const safe={...media,providerInstanceName:instanceName,providerMessageId:ingested.event.message!.providerMessageId!};
 const service=new AiMultimodalIntakeService({async resolve(ref){assert.equal(ref.providerMessageId,'VOICE-ACCEPT-1');return{bytes:new Uint8Array([1,2,3]),mimeType:'audio/ogg',fileName:'voice.ogg'};}},{name:'fake-transcriber',async transcribe(){return{text:'nak facial esok 3 petang',confidence:.93};}},downstream);
 const result=await service.handle({tenantId,conversationId:projection!.conversation.id,instanceId:ingested.record.instanceId,remoteJid:projection!.conversation.remoteJid,customerId:projection!.conversation.customerId,eventKey:ingested.record.providerEventKey,media:safe});
 assert.equal(result.bookingId,'book1');assert.equal(calls[0].text,'nak facial esok 3 petang');
 const uncertain=new AiMultimodalIntakeService({async resolve(){return{bytes:new Uint8Array([1]),mimeType:'audio/ogg',fileName:'v.ogg'};}},{name:'fake',async transcribe(){return{text:'?',confidence:.2};}},downstream);
 const handoff=await uncertain.handle({tenantId,conversationId:projection!.conversation.id,instanceId:ingested.record.instanceId,remoteJid:projection!.conversation.remoteJid,eventKey:'uncertain',media:safe});assert.equal(handoff.action,'HANDOFF');assert.equal(handoff.reason,'transcription_uncertain');
 console.log(JSON.stringify({status:'PASS',mediaKind:projection!.message.mediaKind,transcript:calls[0].text,uncertainAction:handoff.action}));
 }finally{await pool.query('DELETE FROM tenants WHERE id=$1',[tenantId]).catch(()=>undefined);await pool.end();}}
main().catch(e=>{console.error(e);process.exit(1);});
