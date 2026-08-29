import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AccessDeniedError, ROLES, authorize, type Actor, type Capability, type Role } from '@wsadmin-business/auth';
import { EntitlementService, OnboardingService, SaasError, SubscriptionService, type SaasRepository } from '@wsadmin-business/saas';

function actor(request:FastifyRequest):Actor|null{const role=String(request.headers['x-wsadmin-role']??'') as Role;if(!ROLES.includes(role))return null;const tenantId=String(request.headers['x-wsadmin-tenant-id']??'');return{userId:String(request.headers['x-wsadmin-user-id']??'dev-user'),role,...(tenantId?{tenantId}:{})};}
function guard(request:FastifyRequest,reply:FastifyReply,tenantId:string,capability:Capability){const current=actor(request);if(!current){reply.code(401).send({error:'authentication_required'});return null;}try{authorize(current,tenantId,capability);return current;}catch(error){if(error instanceof AccessDeniedError){reply.code(403).send({error:'access_denied'});return null;}throw error;}}
function system(request:FastifyRequest,reply:FastifyReply){const current=actor(request);if(!current||current.role!=='SYSTEM_OWNER'){reply.code(current?403:401).send({error:current?'system_owner_required':'authentication_required'});return null;}return current;}
function fail(reply:FastifyReply,error:unknown){if(error instanceof SaasError){const status=['quota_exceeded','entitlement_denied','subscription_inactive'].includes(error.code)?402:error.code==='incomplete'?409:400;return reply.code(status).send({error:error.code,message:error.message});}throw error;}

export function registerSaasRoutes(app:FastifyInstance,repo:SaasRepository){
  const onboarding=new OnboardingService(repo),subscriptions=new SubscriptionService(repo),entitlements=new EntitlementService(repo);
  app.get('/api/v1/tenants/:tenantId/onboarding',async(request,reply)=>{const{tenantId}=request.params as any;if(!guard(request,reply,tenantId,'TENANT_READ'))return reply;return onboarding.get(tenantId);});
  app.put('/api/v1/tenants/:tenantId/onboarding/:step',async(request,reply)=>{const{tenantId,step}=request.params as any;if(!guard(request,reply,tenantId,'SETTINGS_WRITE'))return reply;try{return onboarding.save(tenantId,String(step).toUpperCase(),(request.body??{}) as any);}catch(error){return fail(reply,error);}});
  app.get('/api/v1/plans',async()=>repo.listPlans());
  app.get('/api/v1/tenants/:tenantId/subscription',async(request,reply)=>{const{tenantId}=request.params as any;if(!guard(request,reply,tenantId,'TENANT_READ'))return reply;try{return subscriptions.overview(tenantId,String((request.query as any)?.period??new Date().toISOString().slice(0,7)));}catch(error){return fail(reply,error);}});
  app.put('/api/v1/tenants/:tenantId/subscription',async(_request,reply)=>reply.code(403).send({error:'provider_or_system_owner_required'}));
  app.post('/api/v1/tenants/:tenantId/entitlements/:key/consume',async(request,reply)=>{const{tenantId,key}=request.params as any;if(!guard(request,reply,tenantId,'TENANT_MANAGE'))return reply;try{return{amount:await entitlements.consume(tenantId,key,Number((request.body as any)?.amount??1),(request.body as any)?.periodKey)};}catch(error){return fail(reply,error);}});
  app.post('/api/v1/system/plans',async(request,reply)=>{if(!system(request,reply))return reply;try{return reply.code(201).send(await subscriptions.createPlan((request.body??{}) as any));}catch(error){return fail(reply,error);}});
  app.put('/api/v1/system/tenants/:tenantId/subscription',async(request,reply)=>{if(!system(request,reply))return reply;const{tenantId}=request.params as any;try{return subscriptions.set(tenantId,(request.body??{}) as any);}catch(error){return fail(reply,error);}});
  app.get('/api/v1/system/dashboard',async(request,reply)=>{if(!system(request,reply))return reply;return repo.systemDashboard();});
  app.put('/api/v1/system/ai-prices/:provider/:model',async(request,reply)=>{if(!system(request,reply))return reply;const{provider,model}=request.params as any,body=request.body as any;await repo.upsertAiPrice(provider,model,Number(body?.inputMicrosPerMillion??0),Number(body?.outputMicrosPerMillion??0));return{ok:true};});
}
