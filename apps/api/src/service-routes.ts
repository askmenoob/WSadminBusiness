import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AccessDeniedError, ROLES, authorize, type Actor, type Capability, type Role } from '@wsadmin-business/auth';
import { ServiceCatalog, ServiceConflictError, ServiceNotFoundError, ServiceValidationError, type ServiceRepository } from '@wsadmin-business/services';
function actorFrom(r:FastifyRequest):Actor|null{
  const role=String(r.headers['x-wsadmin-role']??'') as Role;
  if(!ROLES.includes(role))return null;
  const tenantId=String(r.headers['x-wsadmin-tenant-id']??'');
  return{userId:String(r.headers['x-wsadmin-user-id']??'dev-user'),role,...(tenantId?{tenantId}:{})};
}
function guard(r:FastifyRequest,reply:FastifyReply,t:string,c:Capability){
  const a=actorFrom(r);if(!a){reply.code(401).send({error:'authentication_required'});return null;}
  try{authorize(a,t,c);return a;}catch(e){if(e instanceof AccessDeniedError){reply.code(403).send({error:'access_denied',message:e.message});return null;}throw e;}
}
function fail(reply:FastifyReply,e:unknown){
  if(e instanceof ServiceValidationError)return reply.code(400).send({error:'service_validation',message:e.message});
  if(e instanceof ServiceNotFoundError)return reply.code(404).send({error:'service_not_found'});
  if(e instanceof ServiceConflictError)return reply.code(409).send({error:'service_conflict',message:e.message});
  throw e;
}
export function registerServiceRoutes(app:FastifyInstance,repo:ServiceRepository){
  const catalog=new ServiceCatalog(repo);
  app.post('/api/v1/tenants/:tenantId/service-categories',async(r,reply)=>{const{tenantId}=r.params as {tenantId:string};if(!guard(r,reply,tenantId,'SERVICE_WRITE'))return reply;try{return reply.code(201).send(await catalog.createCategory(tenantId,(r.body??{}) as any));}catch(e){return fail(reply,e);}});
  app.get('/api/v1/tenants/:tenantId/service-categories',async(r,reply)=>{const{tenantId}=r.params as {tenantId:string};if(!guard(r,reply,tenantId,'TENANT_READ'))return reply;const q=r.query as Record<string,string|undefined>;return catalog.listCategories(tenantId,q.includeInactive==='true');});
  app.patch('/api/v1/tenants/:tenantId/service-categories/:categoryId',async(r,reply)=>{const{tenantId,categoryId}=r.params as {tenantId:string;categoryId:string};if(!guard(r,reply,tenantId,'SERVICE_WRITE'))return reply;try{return await catalog.updateCategory(tenantId,categoryId,(r.body??{}) as any);}catch(e){return fail(reply,e);}});
  app.post('/api/v1/tenants/:tenantId/services',async(r,reply)=>{const{tenantId}=r.params as {tenantId:string};if(!guard(r,reply,tenantId,'SERVICE_WRITE'))return reply;try{return reply.code(201).send(await catalog.createService(tenantId,(r.body??{}) as any));}catch(e){return fail(reply,e);}});
  app.get('/api/v1/tenants/:tenantId/services',async(r,reply)=>{const{tenantId}=r.params as {tenantId:string};if(!guard(r,reply,tenantId,'TENANT_READ'))return reply;const q=r.query as Record<string,string|undefined>;return catalog.searchServices(tenantId,{q:q.q,active:q.active===undefined?undefined:q.active==='true',categoryId:q.categoryId,limit:q.limit?Number(q.limit):undefined,offset:q.offset?Number(q.offset):undefined});});
  app.get('/api/v1/tenants/:tenantId/services/:serviceId',async(r,reply)=>{const{tenantId,serviceId}=r.params as {tenantId:string;serviceId:string};if(!guard(r,reply,tenantId,'TENANT_READ'))return reply;try{return await catalog.getService(tenantId,serviceId);}catch(e){return fail(reply,e);}});
  app.patch('/api/v1/tenants/:tenantId/services/:serviceId',async(r,reply)=>{const{tenantId,serviceId}=r.params as {tenantId:string;serviceId:string};if(!guard(r,reply,tenantId,'SERVICE_WRITE'))return reply;try{return await catalog.updateService(tenantId,serviceId,(r.body??{}) as any);}catch(e){return fail(reply,e);}});
}
