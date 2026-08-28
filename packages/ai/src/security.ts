import type{AiIntent}from'./intent.js';
export const AI_TOOLS=['RESOLVE_SERVICE','RESOLVE_LOCATION','CHECK_AVAILABILITY','CREATE_BOOKING','LIST_BOOKINGS','RESCHEDULE_BOOKING','CANCEL_BOOKING','READ_PRICE','READ_FAQ','SEND_REPLY']as const;
export type AiTool=(typeof AI_TOOLS)[number];
const allowed:Record<AiIntent,ReadonlySet<AiTool>>={
 BOOK:new Set(['RESOLVE_SERVICE','RESOLVE_LOCATION','CHECK_AVAILABILITY','CREATE_BOOKING','SEND_REPLY']),
 RESCHEDULE:new Set(['LIST_BOOKINGS','CHECK_AVAILABILITY','RESCHEDULE_BOOKING','SEND_REPLY']),CANCEL:new Set(['LIST_BOOKINGS','CANCEL_BOOKING','SEND_REPLY']),
 PRICE:new Set(['RESOLVE_SERVICE','READ_PRICE','SEND_REPLY']),AVAILABILITY:new Set(['RESOLVE_SERVICE','RESOLVE_LOCATION','CHECK_AVAILABILITY','SEND_REPLY']),FAQ:new Set(['READ_FAQ','SEND_REPLY']),HANDOFF:new Set([])
};
export class AiSecurityError extends Error{constructor(message:string,public readonly code='ai_security_error'){super(message);this.name='AiSecurityError';}}
export function assertAiToolAllowed(intent:AiIntent,tool:AiTool){if(!allowed[intent].has(tool))throw new AiSecurityError(`Tool ${tool} is not allowed for ${intent}`,'tool_not_allowed');return true;}
const injectionPatterns=[/ignore\s+(all\s+)?(previous|system|developer)\s+(instructions?|prompts?)/i,/reveal|show|print.{0,20}(system prompt|developer message|hidden prompt)/i,/bypass.{0,20}(guard|policy|restriction)/i,/(drop|truncate|delete).{0,12}(database|table)/i,/(execute|run).{0,12}(shell|terminal|command)/i,/pretend you are.{0,30}(admin|system|developer)/i];
export function detectPromptInjection(text:string){const clean=text.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,8000);const matched=injectionPatterns.find(p=>p.test(clean));return{blocked:Boolean(matched),reason:matched?'prompt_injection_pattern':null,clean};}
export const AI_SECURITY_POLICY='ALLOWLISTED_TOOLS_NO_DIRECT_DB' as const;
const methodTools:Record<string,AiTool>={resolveService:'RESOLVE_SERVICE',resolveLocation:'RESOLVE_LOCATION',findSlots:'CHECK_AVAILABILITY',createBooking:'CREATE_BOOKING',listUpcoming:'LIST_BOOKINGS',reschedule:'RESCHEDULE_BOOKING',cancel:'CANCEL_BOOKING',answerFaq:'READ_FAQ',enqueueReply:'SEND_REPLY'};
export function guardAiBusinessTools<T extends object>(intent:AiIntent,tools:T):T{return new Proxy(tools,{get(target,prop,receiver){const value=Reflect.get(target,prop,receiver);const tool=methodTools[String(prop)];if(!tool||typeof value!=='function')return value;return(...args:any[])=>{assertAiToolAllowed(intent,tool);return value.apply(target,args);};}});}
