import type { FastifyInstance,FastifyReply,FastifyRequest } from 'fastify';
import { AccessDeniedError,ROLES,authorize,type Actor,type Role } from '@wsadmin-business/auth';
import { BookingConflictError,BookingService,BookingUnavailableError,BookingValidationError,type BookingRepository } from '@wsadmin-business/booking';
import type { AvailabilityRepository } from '@wsadmin-business/availability';
function actorFrom(r:FastifyRequest):Actor|null{const role=String(r.headers['x-wsadmin-role']??'') as Role;if(!ROLES.includes(role))return null;const tenantId=String(r.headers['x-wsadmin-tenant-id']??'');return{userId:String(r.headers['x-wsadmin-user-id']??'dev-user'),role,...(tenantId?{tenantId}:{})};}
function guard(r:FastifyRequest,reply:FastifyReply,t:string){const a=actorFrom(r);if(!a){reply.code(401).send({error:'authentication_required'});return null;}try{authorize(a,t,'BOOKING_WRITE');return a;}catch(e){if(e instanceof AccessDeniedError){reply.code(403).send({error:'access_denied',message:e.message});return null;}throw e;}}
function fail(reply:FastifyReply,e:unknown){if(e instanceof BookingValidationError)return reply.code(400).send({error:'booking_validation',message:e.message});if(e instanceof BookingUnavailableError)return reply.code(409).send({error:'booking_unavailable',reason:e.reason});if(e instanceof BookingConflictError)return reply.code(409).send({error:'booking_conflict',message:e.message});throw e;}
export function registerBookingRoutes(app:FastifyInstance,availabilityRepo:AvailabilityRepository,bookingRepo:BookingRepository){const service=new BookingService(availabilityRepo,bookingRepo);
  app.post('/api/v1/tenants/:tenantId/bookings',async(r,reply)=>{const{tenantId}=r.params as {tenantId:string};if(!guard(r,reply,tenantId))return reply;try{return reply.code(201).send(await service.create({tenantId,...((r.body??{}) as any)}));}catch(e){return fail(reply,e);}});
}
