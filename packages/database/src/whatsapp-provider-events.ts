import type{Pool}from'pg';import type{NormalizedWhatsAppEvent,WhatsAppProviderEventRecord,WhatsAppProviderEventRepository,WhatsAppProviderName}from'@wsadmin-business/whatsapp';
const map=(r:any):WhatsAppProviderEventRecord=>({id:r.id,tenantId:r.tenant_id,instanceId:r.instance_id,provider:r.provider,providerInstanceName:r.provider_instance_name,providerEventKey:r.provider_event_key,eventName:r.event_name,occurredAt:r.occurred_at,receivedAt:r.received_at});
export function createWhatsAppProviderEventRepository(pool:Pool):WhatsAppProviderEventRepository{return{
 async resolveInstance(provider:WhatsAppProviderName,name:string){const r=await pool.query('SELECT id,tenant_id FROM whatsapp_instances WHERE provider=$1 AND provider_instance_name=$2',[provider,name]);return r.rowCount?{id:r.rows[0].id,tenantId:r.rows[0].tenant_id}:null;},
 async ingest(instance,event:NormalizedWhatsAppEvent,rawPayload){
  const client=await pool.connect();try{await client.query('BEGIN');
   const inserted=await client.query(`INSERT INTO whatsapp_provider_events(tenant_id,instance_id,provider,provider_instance_name,provider_event_key,event_name,occurred_at,normalized_payload,raw_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) ON CONFLICT(provider,provider_instance_name,provider_event_key) DO NOTHING RETURNING *`,[instance.tenantId,instance.id,event.provider,event.providerInstanceName,event.providerEventKey,event.eventName,event.occurredAt,JSON.stringify(event),JSON.stringify(rawPayload)]);
   if(inserted.rowCount){await client.query('COMMIT');return{record:map(inserted.rows[0]),duplicate:false};}
   const existing=await client.query('SELECT * FROM whatsapp_provider_events WHERE provider=$1 AND provider_instance_name=$2 AND provider_event_key=$3',[event.provider,event.providerInstanceName,event.providerEventKey]);await client.query('COMMIT');return{record:map(existing.rows[0]),duplicate:true};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
};}
