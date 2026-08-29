import type { AiRouter } from './router.js';

export const AI_INTENTS = ['BOOK','RESCHEDULE','CANCEL','PRICE','AVAILABILITY','FAQ','HANDOFF'] as const;
export type AiIntent = (typeof AI_INTENTS)[number];
export type AiEntities = { service:string|null;date:string|null;endDate:string|null;time:string|null;pax:number|null;staff:string|null;resource:string|null;location:string|null;budgetMinor:number|null };
export type AiIntentBusinessContext = { businessType:string;businessSubtype:string|null;offeringKind:string;workflowKind:string;offeringSingular:string;offeringPlural:string;transactionSingular:string;customerSingular:string;aiEnabled:boolean };
export type AiIntentResult = { intent:AiIntent;confidence:number;language:'ms'|'en'|'mixed';entities:AiEntities;missing:string[];reason:string };

export class AiIntentValidationError extends Error { constructor(message:string){super(message);this.name='AiIntentValidationError';} }
const blank: AiEntities = { service:null,date:null,endDate:null,time:null,pax:null,staff:null,resource:null,location:null,budgetMinor:null };
const nullableText=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim().slice(0,160):null;
const nullableInt=(value:unknown)=>Number.isInteger(value)&&Number(value)>=0?Number(value):null;

export function validateIntentPayload(raw:unknown):AiIntentResult {
  if(!raw||typeof raw!=='object')throw new AiIntentValidationError('intent payload must be object');
  const value=raw as any;
  if(!AI_INTENTS.includes(value.intent))throw new AiIntentValidationError('unsupported intent');
  const confidence=Number(value.confidence);
  if(!Number.isFinite(confidence)||confidence<0||confidence>1)throw new AiIntentValidationError('confidence must be 0..1');
  const language=['ms','en','mixed'].includes(value.language)?value.language:'mixed',entities=value.entities??{};
  return { intent:value.intent,confidence,language,entities:{...blank,service:nullableText(entities.service),date:nullableText(entities.date),endDate:nullableText(entities.endDate),time:nullableText(entities.time),pax:nullableInt(entities.pax),staff:nullableText(entities.staff),resource:nullableText(entities.resource),location:nullableText(entities.location),budgetMinor:nullableInt(entities.budgetMinor)},missing:Array.isArray(value.missing)?value.missing.filter((item:any)=>typeof item==='string').slice(0,10):[],reason:nullableText(value.reason)??'model_extraction' };
}

export interface IntentGenerator { generate(input:{tenantId:string;operation:string;messages:{role:'system'|'user'|'assistant';content:string}[];conversationId?:string|null;contextSummary?:string|null}):Promise<{text:string}>; }

export class AiIntentInterpreter {
  constructor(private readonly router:Pick<AiRouter,'generate'>|IntentGenerator){}
  async interpret(input:{tenantId:string;text:string;conversationId?:string|null;contextSummary?:string|null;businessContext?:AiIntentBusinessContext|null}) {
    const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const business=input.businessContext,isProperty=business?.offeringKind==='PROPERTY';
    const industry=isProperty
      ? `This tenant is ${business?.businessSubtype??'Property'}. In entities.service extract the exact property, unit or room name; that field is a compatibility key and must never be described to the customer as a service. date is check-in and endDate is check-out. A property booking does not require a time.`
      : `This tenant is ${business?.businessSubtype??'a service business'}. In entities.service extract the exact ${business?.offeringSingular?.toLowerCase()??'service'} name.`;
    const system=`Return JSON only with exactly this top-level schema: {"intent":"BOOK|RESCHEDULE|CANCEL|PRICE|AVAILABILITY|FAQ|HANDOFF","confidence":0.0,"language":"ms|en|mixed","entities":{"service":null,"date":null,"endDate":null,"time":null,"pax":null,"staff":null,"resource":null,"location":null,"budgetMinor":null},"missing":[],"reason":"..."}. Current date in Asia/Kuala_Lumpur is ${localDate}. ${industry} Convert relative dates to YYYY-MM-DD and explicit times to HH:MM. Put every extracted field inside entities. Support Bahasa Melayu, English and mixed language. Never invent unavailable business data or terminology from another industry.`;
    const result=await this.router.generate({tenantId:input.tenantId,conversationId:input.conversationId,operation:'intent_extraction',messages:[{role:'system',content:system},{role:'system',content:`Prior bounded conversation summary (facts only): ${input.contextSummary?.slice(-3000)??'none'}`},{role:'user',content:input.text.slice(0,4000)}]});
    let raw:unknown;try{raw=JSON.parse(result.text);}catch{throw new AiIntentValidationError('model did not return valid JSON');}
    const parsed=validateIntentPayload(raw);
    const required:Record<AiIntent,(keyof AiEntities)[]>=isProperty
      ? {BOOK:['service','date','endDate'],RESCHEDULE:['date','endDate'],CANCEL:[],PRICE:['service'],AVAILABILITY:['service','date','endDate'],FAQ:[],HANDOFF:[]}
      : {BOOK:['service','date','time'],RESCHEDULE:['date','time'],CANCEL:[],PRICE:['service'],AVAILABILITY:['service','date'],FAQ:[],HANDOFF:[]};
    const missing=[...new Set(required[parsed.intent].filter(key=>parsed.entities[key]===null).map(String))];
    return {...parsed,entities:{...parsed.entities,pax:parsed.entities.pax??(parsed.intent==='BOOK'?1:null)},missing};
  }
}
