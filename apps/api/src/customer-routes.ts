import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AccessDeniedError, ROLES, authorize, type Actor, type Capability, type Role } from '@wsadmin-business/auth';
import { CustomerConflictError, CustomerNotFoundError, CustomerService, CustomerValidationError, type CustomerRepository } from '@wsadmin-business/customers';
function actorFrom(request:FastifyRequest):Actor|null{
  const role=String(request.headers['x-wsadmin-role']??'') as Role;
  if(!ROLES.includes(role))return null;
  const tenantId=String(request.headers['x-wsadmin-tenant-id']??'');
  return{userId:String(request.headers['x-wsadmin-user-id']??'dev-user'),role,...(tenantId?{tenantId}:{})};
}
function guard(request:FastifyRequest,reply:FastifyReply,targetTenantId:string,capability:Capability){
  const actor=actorFrom(request);
  if(!actor){reply.code(401).send({error:'authentication_required'});return null;}
  try{authorize(actor,targetTenantId,capability);return actor;}
  catch(e){if(e instanceof AccessDeniedError){reply.code(403).send({error:'access_denied',message:e.message});return null;}throw e;}
}
function failure(reply:FastifyReply,error:unknown){
  if(error instanceof CustomerValidationError)return reply.code(400).send({error:'customer_validation',message:error.message});
  if(error instanceof CustomerNotFoundError)return reply.code(404).send({error:'customer_not_found'});
  if(error instanceof CustomerConflictError)return reply.code(409).send({error:'customer_conflict',message:error.message});
  throw error;
}
export function registerCustomerRoutes(app:FastifyInstance,repo:CustomerRepository){const svc=new CustomerService(repo);
  app.post('/api/v1/tenants/:tenantId/customers',async(request,reply)=>{const {tenantId}=request.params as {tenantId:string};if(!guard(request,reply,tenantId,'CUSTOMER_WRITE'))return reply;try{const row=await svc.create(tenantId,(request.body??{}) as any);return reply.code(201).send(row);}catch(e){return failure(reply,e);}});
  app.get('/api/v1/tenants/:tenantId/customers',async(request,reply)=>{const {tenantId}=request.params as {tenantId:string};if(!guard(request,reply,tenantId,'TENANT_READ'))return reply;const q=request.query as Record<string,string|undefined>;return svc.search(tenantId,{q:q.q,limit:q.limit?Number(q.limit):undefined,offset:q.offset?Number(q.offset):undefined,includeArchived:q.includeArchived==='true'});});
  app.get('/api/v1/tenants/:tenantId/customers/:customerId',async(request,reply)=>{const {tenantId,customerId}=request.params as {tenantId:string;customerId:string};if(!guard(request,reply,tenantId,'TENANT_READ'))return reply;try{return await svc.get(tenantId,customerId);}catch(e){return failure(reply,e);}});
  app.patch('/api/v1/tenants/:tenantId/customers/:customerId',async(request,reply)=>{const {tenantId,customerId}=request.params as {tenantId:string;customerId:string};if(!guard(request,reply,tenantId,'CUSTOMER_WRITE'))return reply;try{return await svc.update(tenantId,customerId,(request.body??{}) as any);}catch(e){return failure(reply,e);}});
  app.delete('/api/v1/tenants/:tenantId/customers/:customerId',async(request,reply)=>{const {tenantId,customerId}=request.params as {tenantId:string;customerId:string};if(!guard(request,reply,tenantId,'CUSTOMER_WRITE'))return reply;try{await svc.archive(tenantId,customerId);return reply.code(204).send();}catch(e){return failure(reply,e);}});
}
