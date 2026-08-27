import { createHash } from 'node:crypto';
import type { WhatsAppProviderName } from './connections.js';
export type NormalizedWhatsAppEvent={provider:WhatsAppProviderName;providerInstanceName:string;providerEventKey:string;eventName:string;occurredAt:Date|null;rawHash:string;message:{providerMessageId:string|null;remoteJid:string|null;fromMe:boolean|null;participant:string|null;text:string|null;messageType:string|null}|null};
export type WhatsAppProviderEventRecord={id:string;tenantId:string;instanceId:string;provider:WhatsAppProviderName;providerInstanceName:string;providerEventKey:string;eventName:string;occurredAt:Date|null;receivedAt:Date};
export interface WhatsAppProviderEventRepository{
 resolveInstance(provider:WhatsAppProviderName,providerInstanceName:string):Promise<{id:string;tenantId:string}|null>;
 ingest(instance:{id:string;tenantId:string},event:NormalizedWhatsAppEvent,rawPayload:unknown):Promise<{record:WhatsAppProviderEventRecord;duplicate:boolean}>;
}
export class WhatsAppWebhookError extends Error{constructor(message:string,public readonly code='webhook_error'){super(message);this.name='WhatsAppWebhookError';}}
function object(v:unknown):Record<string,any>{return typeof v==='object'&&v!==null?v as Record<string,any>:{};}
function stable(v:unknown):string{if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(typeof v==='object'&&v!==null){const o=v as Record<string,unknown>;return`{${Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+stable(o[k])).join(',')}}`;}return JSON.stringify(v);}
function dateOf(value:unknown){if(value===null||value===undefined||value==='')return null;const n=Number(value);if(Number.isFinite(n)&&String(value).trim()!=='')return new Date(n>2e10?n:n*1000);const d=new Date(String(value));return Number.isNaN(d.valueOf())?null:d;}
function textOf(message:any):string|null{return message?.conversation??message?.extendedTextMessage?.text??message?.imageMessage?.caption??message?.videoMessage?.caption??null;}
export function normalizeEvolutionWebhook(payload:unknown):NormalizedWhatsAppEvent{
  const root=object(payload),data=object(root.data),instanceObject=object(root.instance);
  const providerInstanceName=String(root.instanceName??root.instance??instanceObject.instanceName??instanceObject.name??data.instanceName??'').trim();
  if(!providerInstanceName)throw new WhatsAppWebhookError('Evolution webhook missing instance name','invalid_payload');
  const eventName=String(root.event??root.type??data.event??'UNKNOWN').trim().toUpperCase().replace(/[.-]/g,'_');
  const key=object(data.key??root.key),message=object(data.message??root.message);
  const providerMessageId=String(key.id??data.id??root.id??'').trim()||null;
  const occurredAt=dateOf(data.messageTimestamp??root.messageTimestamp??root.date_time??root.createdAt);
  const rawHash=createHash('sha256').update(stable(payload)).digest('hex');
  const providerEventKey=providerMessageId?`${eventName}:${providerMessageId}`:`${eventName}:sha256:${rawHash}`;
  const hasMessage=Object.keys(message).length>0||providerMessageId!==null||key.remoteJid!==undefined;
  return{provider:'EVOLUTION',providerInstanceName,providerEventKey,eventName,occurredAt,rawHash,message:hasMessage?{providerMessageId,remoteJid:key.remoteJid?String(key.remoteJid):null,fromMe:typeof key.fromMe==='boolean'?key.fromMe:null,participant:key.participant?String(key.participant):null,text:textOf(message),messageType:data.messageType?String(data.messageType):null}:null};
}
export class WhatsAppWebhookIngestionService{
 constructor(private readonly repo:WhatsAppProviderEventRepository){}
 async ingestEvolution(payload:unknown){const event=normalizeEvolutionWebhook(payload);const instance=await this.repo.resolveInstance(event.provider,event.providerInstanceName);if(!instance)throw new WhatsAppWebhookError('Unknown provider instance','unknown_instance');const stored=await this.repo.ingest(instance,event,payload);return{...stored,event};}
}
