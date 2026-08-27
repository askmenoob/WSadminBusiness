import type{WhatsAppProviderName}from'./connections.js';
export type ProviderSendTextInput={tenantId:string;providerInstanceName:string;to:string;text:string;idempotencyKey:string};
export type ProviderSendTextResult={providerMessageId:string;provider:WhatsAppProviderName};
export interface WhatsAppMessageProvider{readonly providerName:WhatsAppProviderName;sendText(input:ProviderSendTextInput):Promise<ProviderSendTextResult>;}
export interface WhatsAppInboundAdapter{readonly providerName:WhatsAppProviderName;normalize(payload:unknown):import('./webhooks.js').NormalizedWhatsAppEvent;}
export class WhatsAppProviderRegistry{
 private readonly message=new Map<WhatsAppProviderName,WhatsAppMessageProvider>();
 private readonly inbound=new Map<WhatsAppProviderName,WhatsAppInboundAdapter>();
 registerMessage(provider:WhatsAppMessageProvider){this.message.set(provider.providerName,provider);return this;}
 registerInbound(adapter:WhatsAppInboundAdapter){this.inbound.set(adapter.providerName,adapter);return this;}
 messageProvider(name:WhatsAppProviderName){const p=this.message.get(name);if(!p)throw new Error(`message provider not registered: ${name}`);return p;}
 inboundAdapter(name:WhatsAppProviderName){const p=this.inbound.get(name);if(!p)throw new Error(`inbound adapter not registered: ${name}`);return p;}
}
