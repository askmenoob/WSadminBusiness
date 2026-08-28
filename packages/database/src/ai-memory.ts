import type{Pool}from'pg';import type{AiActionAudit,AiMemoryRepository}from'@wsadmin-business/ai';
const audit=(r:any):AiActionAudit=>({id:r.id,tenantId:r.tenant_id,conversationId:r.conversation_id,eventKey:r.event_key,intent:r.intent,confidence:Number(r.confidence),action:r.action,reason:r.reason,toolResult:r.tool_result??{},createdAt:r.created_at});
export function createAiMemoryRepository(pool:Pool):AiMemoryRepository{return{
 async getSummary(t,c){const r=await pool.query('SELECT summary FROM ai_conversation_memory WHERE tenant_id=$1 AND conversation_id=$2',[t,c]);return r.rowCount?r.rows[0].summary:null;},
 async saveSummary(t,c,s){const r=await pool.query(`INSERT INTO ai_conversation_memory(tenant_id,conversation_id,summary) VALUES($1,$2,$3) ON CONFLICT(tenant_id,conversation_id) DO UPDATE SET summary=excluded.summary,updated_at=now() RETURNING summary`,[t,c,s]);return r.rows[0].summary;},
 async recordAction(i){const r=await pool.query(`INSERT INTO ai_action_audit(tenant_id,conversation_id,event_key,intent,confidence,action,reason,tool_result) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,[i.tenantId,i.conversationId,i.eventKey??null,i.intent,i.confidence,i.action,i.reason,JSON.stringify(i.toolResult??{})]);return audit(r.rows[0]);},
 async listActions(t,c,l=50){const r=await pool.query('SELECT * FROM ai_action_audit WHERE tenant_id=$1 AND conversation_id=$2 ORDER BY created_at DESC,id DESC LIMIT $3',[t,c,l]);return r.rows.map(audit);}
};}
