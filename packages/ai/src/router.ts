export type AiProviderName='OPENAI'|'GROQ';
export type AiMessage={role:'system'|'user'|'assistant';content:string};
export type AiGenerateInput={tenantId:string;operation:string;messages:AiMessage[];conversationId?:string|null};
export type AiProviderResult={text:string;provider:AiProviderName;model:string;inputTokens:number;outputTokens:number;latencyMs:number};
export interface AiProvider{readonly name:AiProviderName;generate(input:{model:string;messages:AiMessage[];timeoutMs:number}):Promise<Omit<AiProviderResult,'provider'>>;}
export type AiSettings={enabled:boolean;primaryProvider:AiProviderName;primaryModel:string;fallbackProvider:AiProviderName|null;fallbackModel:string|null;timeoutMs:number};
export interface AiSettingsRepository{get(tenantId:string):Promise<AiSettings>;update(tenantId:string,input:Partial<AiSettings>):Promise<AiSettings>;}
export interface AiUsageRepository{record(input:{tenantId:string;conversationId?:string|null;provider:AiProviderName;model:string;operation:string;inputTokens:number;outputTokens:number;latencyMs:number;success:boolean;errorCode?:string|null}):Promise<void>;}
export class AiRouterError extends Error{constructor(message:string,public readonly code='ai_router_error'){super(message);this.name='AiRouterError';}}
export class AiProviderRegistry{
 private readonly providers=new Map<AiProviderName,AiProvider>();
 register(provider:AiProvider){this.providers.set(provider.name,provider);return this;}
 get(name:AiProviderName){const p=this.providers.get(name);if(!p)throw new AiRouterError(`AI provider ${name} unavailable`,'provider_unavailable');return p;}
}
export class AiRouter{
 constructor(private readonly settings:AiSettingsRepository,private readonly usage:AiUsageRepository,private readonly registry:AiProviderRegistry){}
 async generate(input:AiGenerateInput){const cfg=await this.settings.get(input.tenantId);if(!cfg.enabled)throw new AiRouterError('AI disabled for tenant','ai_disabled');const attempts:[AiProviderName,string][]=[[cfg.primaryProvider,cfg.primaryModel]];if(cfg.fallbackProvider&&cfg.fallbackModel&&!(cfg.fallbackProvider===cfg.primaryProvider&&cfg.fallbackModel===cfg.primaryModel))attempts.push([cfg.fallbackProvider,cfg.fallbackModel]);let last:unknown;for(const[providerName,model]of attempts){const started=Date.now();try{const result=await this.registry.get(providerName).generate({model,messages:input.messages,timeoutMs:cfg.timeoutMs});await this.usage.record({tenantId:input.tenantId,conversationId:input.conversationId,provider:providerName,model,operation:input.operation,inputTokens:result.inputTokens,outputTokens:result.outputTokens,latencyMs:result.latencyMs,success:true});return{...result,provider:providerName};}catch(error){last=error;await this.usage.record({tenantId:input.tenantId,conversationId:input.conversationId,provider:providerName,model,operation:input.operation,inputTokens:0,outputTokens:0,latencyMs:Date.now()-started,success:false,errorCode:error instanceof AiRouterError?error.code:'provider_error'});}}throw new AiRouterError(last instanceof Error?last.message:'All AI providers failed','all_providers_failed');}
}
