import type{FastifyInstance,FastifyReply,FastifyRequest}from'fastify';
import{AccessDeniedError,ROLES,authorize,type Actor,type Capability,type Role}from'@wsadmin-business/auth';
import{BookingPolicyService,BookingPolicyValidationError,type BookingPolicyRepository}from'@wsadmin-business/booking-policy';
function actorFrom(r:FastifyRequest):Actor|null{const role=String(r.headers['x-wsadmin-role']??'') as Role;if(!ROLES.includes(role))return null;const tenantId=String(r.headers['x-wsadmin-tenant-id']??'');return{userId:String(r.headers['x-wsadmin-user-id']??'dev-user'),role,...(tenantId?{tenantId}:{})};}
function guard(r:FastifyRequest,reply:FastifyReply,t:string,c:Capability){const a=actorFrom(r);if(!a){reply.code(401).send({error:'authentication_required'});return null;}try{authorize(a,t,c);return a;}catch(e){if(e instanceof AccessDeniedError){reply.code(403).send({error:'access_denied',message:e.message});return null;}throw e;}}
export function registerBookingPolicyRoutes(app:FastifyInstance,repo:BookingPolicyRepository){const service=new BookingPolicyService(repo);
  app.get('/api/v1/tenants/:tenantId/booking-policy',async(r,reply)=>{const{tenantId}=r.params as any;if(!guard(r,reply,tenantId,'TENANT_READ'))return reply;return service.get(tenantId);});
  app.patch('/api/v1/tenants/:tenantId/booking-policy',async(r,reply)=>{const{tenantId}=r.params as any;if(!guard(r,reply,tenantId,'SETTINGS_WRITE'))return reply;try{return await service.update(tenantId,(r.body??{}) as any);}catch(e){if(e instanceof BookingPolicyValidationError)return reply.code(400).send({error:'booking_policy_validation',message:e.message});throw e;}});
}
