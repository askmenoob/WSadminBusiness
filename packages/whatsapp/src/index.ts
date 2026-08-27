export interface WhatsAppProvider { readonly providerName:string; sendText(input:{tenantId:string;to:string;text:string;idempotencyKey:string}):Promise<{providerMessageId:string}>; }
export const WHATSAPP_PROVIDER_POLICY = 'provider-neutral-business-services' as const;
