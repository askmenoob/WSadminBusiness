import type{AiRouter}from'./router.js';
export type KnowledgeSourceType='FAQ'|'SERVICE'|'LOCATION'|'BOOKING_POLICY';
export type KnowledgeSource={id:string;type:KnowledgeSourceType;title:string;content:string};
export type FaqEntry={id:string;tenantId:string;question:string;answer:string;active:boolean;sortOrder:number;createdAt:Date;updatedAt:Date};
export interface AiKnowledgeRepository{search(tenantId:string,query:string,limit?:number):Promise<KnowledgeSource[]>;createFaq(tenantId:string,input:{question:string;answer:string;active?:boolean;sortOrder?:number}):Promise<FaqEntry>;listFaq(tenantId:string,includeInactive?:boolean):Promise<FaqEntry[]>;updateFaq(tenantId:string,id:string,input:Partial<{question:string;answer:string;active:boolean;sortOrder:number}>):Promise<FaqEntry|null>;}
export class KnowledgeValidationError extends Error{constructor(message:string){super(message);this.name='KnowledgeValidationError';}}
export class GroundedFaqService{
 constructor(private readonly router:Pick<AiRouter,'generate'>,private readonly repo:AiKnowledgeRepository){}
 async answer(tenantId:string,question:string,conversationId?:string|null){const q=question.trim().slice(0,2000);if(!q)throw new KnowledgeValidationError('question required');const sources=await this.repo.search(tenantId,q,8);if(!sources.length)return null;const context=sources.map((s,i)=>`[${i+1}] ${s.type} ${s.title}\n${s.content}`).join('\n\n');const result=await this.router.generate({tenantId,conversationId,operation:'grounded_faq',messages:[{role:'system',content:'Answer only from the supplied tenant-approved context. Do not invent facts. If context is insufficient say you need human help. Keep the answer concise in the customer language.'},{role:'user',content:`Question: ${q}\n\nContext:\n${context}`} ]});return{answer:result.text.trim(),sources:sources.map(s=>s.id)};}
}
