import type { FastifyInstance,FastifyReply,FastifyRequest } from 'fastify';
import { AccessDeniedError,ROLES,authorize,type Actor,type Role } from '@wsadmin-business/auth';
import { CalendarService,CalendarValidationError,type CalendarRepository,type CalendarView } from '@wsadmin-business/calendar';
function actorFrom(r:FastifyRequest):Actor|null{const role=String(r.headers['x-wsadmin-role']??'') as Role;if(!ROLES.includes(role))return null;const tenantId=String(r.headers['x-wsadmin-tenant-id']??'');return{userId:String(r.headers['x-wsadmin-user-id']??'dev-user'),role,...(tenantId?{tenantId}:{})};}
function guard(r:FastifyRequest,reply:FastifyReply,t:string){const a=actorFrom(r);if(!a){reply.code(401).send({error:'authentication_required'});return null;}try{authorize(a,t,'TENANT_READ');return a;}catch(e){if(e instanceof AccessDeniedError){reply.code(403).send({error:'access_denied',message:e.message});return null;}throw e;}}
export function registerCalendarRoutes(app:FastifyInstance,repo:CalendarRepository){const service=new CalendarService(repo);
  app.get('/api/v1/tenants/:tenantId/calendar',async(r,reply)=>{const{tenantId}=r.params as {tenantId:string};if(!guard(r,reply,tenantId))return reply;const q=r.query as Record<string,string|undefined>;try{return await service.get(tenantId,{view:q.view as CalendarView|undefined,from:q.from??'',to:q.to??''});}catch(e){if(e instanceof CalendarValidationError)return reply.code(400).send({error:'calendar_validation',message:e.message});throw e;}});
}
