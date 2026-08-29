import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AccessDeniedError, ROLES, authorize, type Actor, type Capability, type Role } from '@wsadmin-business/auth';
import { HitPayRecurringGateway, SaasBillingService, SaasError, type RecurringBillingGateway, type SaasBillingRepository } from '@wsadmin-business/saas';
import { authenticatedActor } from './auth-routes.js';
import { readRuntimeSecret } from './runtime-secrets.js';

function actor(request:FastifyRequest):Actor|null{const role=String(request.headers['x-wsadmin-role']??'') as Role;if(!ROLES.includes(role))return null;const tenantId=String(request.headers['x-wsadmin-tenant-id']??'');return{userId:String(request.headers['x-wsadmin-user-id']??''),role,...(tenantId?{tenantId}:{})};}
function guard(request:FastifyRequest,reply:FastifyReply,tenantId:string,capability:Capability){const current=actor(request);if(!current){reply.code(401).send({error:'authentication_required'});return null;}try{authorize(current,tenantId,capability);return current;}catch(error){if(error instanceof AccessDeniedError){reply.code(403).send({error:'access_denied'});return null;}throw error;}}
function system(request:FastifyRequest,reply:FastifyReply){const current=actor(request);if(!current||current.role!=='SYSTEM_OWNER'){reply.code(current?403:401).send({error:current?'system_owner_required':'authentication_required'});return null;}return current;}
function failure(reply:FastifyReply,error:unknown){if(error instanceof SaasError){const status=error.code==='webhook_signature'?401:error.code==='provider_unavailable'?503:error.code==='plan_unavailable'?404:400;return reply.code(status).send({error:error.code,message:error.message});}throw error;}

export function hitPayGatewayFromEnv():RecurringBillingGateway|null{
  const mode=String(process.env.HITPAY_MODE??'DISABLED').toUpperCase();if(mode==='DISABLED')return null;if(mode!=='SANDBOX'&&mode!=='PRODUCTION')throw new Error('HITPAY_MODE must be DISABLED, SANDBOX or PRODUCTION');
  const apiKey=readRuntimeSecret('HITPAY_API_KEY','HITPAY_API_KEY_FILE'),webhookSalt=readRuntimeSecret('HITPAY_WEBHOOK_SALT','HITPAY_WEBHOOK_SALT_FILE');if(!apiKey||!webhookSalt)return null;
  const baseUrl=String(process.env.HITPAY_BASE_URL??(mode==='PRODUCTION'?'https://api.hit-pay.com':'https://api.sandbox.hit-pay.com'));
  const paymentMethods=String(process.env.HITPAY_RECURRING_METHODS??'card').split(',').map(value=>value.trim()).filter(Boolean);
  return new HitPayRecurringGateway({apiKey,webhookSalt,baseUrl,paymentMethods});
}

export function registerSaasBillingRoutes(app:FastifyInstance,repo:SaasBillingRepository,gateway:RecurringBillingGateway|null=hitPayGatewayFromEnv(),appUrl=String(process.env.WSADMIN_APP_URL??'https://wsadmin-biz.imai.my').replace(/\/$/,'')){
  const service=new SaasBillingService(repo,name=>{if(!gateway||gateway.name!==name.toUpperCase())throw new SaasError(`Billing provider ${name} is unavailable`,'provider_unavailable');return gateway;});
  app.get('/api/v1/tenants/:tenantId/billing',async(request,reply)=>{const{tenantId}=request.params as any;if(!guard(request,reply,tenantId,'TENANT_READ'))return reply;return service.overview(tenantId);});
  app.post('/api/v1/tenants/:tenantId/billing/checkout',async(request,reply)=>{const{tenantId}=request.params as any;const current=guard(request,reply,tenantId,'TENANT_MANAGE');if(!current)return reply;const identity=authenticatedActor(request);if(!identity?.email)return reply.code(401).send({error:'authenticated_billing_identity_required'});try{return reply.code(201).send(await service.createCheckout({tenantId,planCode:String((request.body as any)?.planCode??''),provider:'HITPAY',customerEmail:identity.email,customerName:identity.displayName,createdByUserId:current.userId,redirectUrl:`${appUrl}/?billing=return`}));}catch(error){return failure(reply,error);}});
  app.post('/api/v1/webhooks/billing/hitpay',async(request,reply)=>{
    const raw=(request as any).wsadminRawBody as Buffer|undefined;if(!raw)return reply.code(400).send({error:'raw_body_required'});
    const headers=Object.fromEntries(Object.entries(request.headers).map(([key,value])=>[key,Array.isArray(value)?value[0]:value?.toString()]));
    try{return reply.code(202).send(await service.reconcile('HITPAY',raw,headers));}catch(error){return failure(reply,error);}
  });
  app.get('/api/v1/system/billing',async(request,reply)=>{if(!system(request,reply))return reply;return service.summary();});
}
