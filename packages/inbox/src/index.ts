import type{NormalizedWhatsAppEvent,WhatsAppProviderEventRecord}from'@wsadmin-business/whatsapp';
export const CONVERSATION_STATUSES=['OPEN','HUMAN','BOT_PAUSED','CLOSED'] as const;
export type ConversationStatus=(typeof CONVERSATION_STATUSES)[number];
export type Conversation={id:string;tenantId:string;instanceId:string;customerId:string|null;channel:'WHATSAPP';remoteJid:string;contactE164:string|null;displayName:string|null;status:ConversationStatus;unreadCount:number;lastMessageAt:Date|null;lastMessagePreview:string|null;aiIntent?:string|null;aiConfidence?:number|null;aiAction?:'EXECUTE'|'CLARIFY'|'HANDOFF'|null;aiReason?:string|null;aiAttentionState?:'NONE'|'CLARIFICATION'|'HUMAN';aiUpdatedAt?:Date|null;createdAt:Date;updatedAt:Date};
export type InboxMessage={id:string;tenantId:string;conversationId:string;providerEventId:string;providerMessageId:string|null;direction:'INBOUND'|'OUTBOUND';senderJid:string|null;messageType:string|null;textContent:string|null;occurredAt:Date;status:string;createdAt:Date};
export type ConversationSearch={status?:ConversationStatus;q?:string;limit?:number;offset?:number};
export interface InboxRepository{
 project(eventRecord:WhatsAppProviderEventRecord,event:NormalizedWhatsAppEvent):Promise<{conversation:Conversation;message:InboxMessage}|null>;
 listConversations(tenantId:string,query:ConversationSearch):Promise<Conversation[]>;
 getConversation(tenantId:string,conversationId:string):Promise<Conversation|null>;
 listMessages(tenantId:string,conversationId:string,limit:number,offset:number):Promise<InboxMessage[]>;
 updateStatus(tenantId:string,conversationId:string,status:ConversationStatus):Promise<Conversation|null>;
 markRead(tenantId:string,conversationId:string):Promise<Conversation|null>;
 recordAiState?(tenantId:string,conversationId:string,input:{intent:string;confidence:number;action:'EXECUTE'|'CLARIFY'|'HANDOFF';reason:string;attentionState:'NONE'|'CLARIFICATION'|'HUMAN'}):Promise<Conversation|null>;
}
export class InboxValidationError extends Error{constructor(message:string){super(message);this.name='InboxValidationError';}}
export class ConversationNotFoundError extends Error{constructor(){super('Conversation not found');this.name='ConversationNotFoundError';}}
export function contactE164(event:NormalizedWhatsAppEvent){const jid=event.message?.remoteJid;if(!jid)return null;const direct=/@(s\.whatsapp\.net|c\.us)$/i.test(jid);const source=direct?jid:event.message?.participant??null;if(!source||!/@(s\.whatsapp\.net|c\.us)$/i.test(source))return null;const digits=source.split('@')[0]!.replace(/\D/g,'');return digits.length>=7&&digits.length<=15?`+${digits}`:null;}
export class InboxService{
 constructor(private readonly repo:InboxRepository){}
 project(record:WhatsAppProviderEventRecord,event:NormalizedWhatsAppEvent){return this.repo.project(record,event);}
 list(tenantId:string,query:ConversationSearch={}){if(query.status&&!CONVERSATION_STATUSES.includes(query.status))throw new InboxValidationError('invalid conversation status');return this.repo.listConversations(tenantId,{...query,limit:Math.min(Math.max(query.limit??50,1),100),offset:Math.max(query.offset??0,0)});}
 async get(tenantId:string,id:string){const row=await this.repo.getConversation(tenantId,id);if(!row)throw new ConversationNotFoundError();return row;}
 async messages(tenantId:string,id:string,limit=50,offset=0){await this.get(tenantId,id);return this.repo.listMessages(tenantId,id,Math.min(Math.max(limit,1),100),Math.max(offset,0));}
 async status(tenantId:string,id:string,status:ConversationStatus){if(!CONVERSATION_STATUSES.includes(status))throw new InboxValidationError('invalid conversation status');const row=await this.repo.updateStatus(tenantId,id,status);if(!row)throw new ConversationNotFoundError();return row;}
 async markRead(tenantId:string,id:string){const row=await this.repo.markRead(tenantId,id);if(!row)throw new ConversationNotFoundError();return row;}
 async recordAiState(tenantId:string,id:string,input:{intent:string;confidence:number;action:'EXECUTE'|'CLARIFY'|'HANDOFF';reason:string;attentionState:'NONE'|'CLARIFICATION'|'HUMAN'}){if(!this.repo.recordAiState)return null;const row=await this.repo.recordAiState(tenantId,id,input);if(!row)throw new ConversationNotFoundError();return row;}
}
