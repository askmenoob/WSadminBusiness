import { AvailabilityEngine,type AvailabilityRepository } from '@wsadmin-business/availability';
import { cancellationAllowed } from '@wsadmin-business/booking-policy';
export type BookingIntent='BOOK'|'RESCHEDULE'|'CANCEL'|'AVAILABILITY';
export const BOOKING_CORE_RULE='deterministic-domain-service' as const;
export type BookingStatus='PENDING'|'CONFIRMED'|'CANCELLED'|'COMPLETED'|'NO_SHOW';
export type BookingSource='ADMIN'|'PHONE'|'WALK_IN'|'WHATSAPP'|'WEB'|'IMPORT';
export type Booking={
  id:string;tenantId:string;customerId:string|null;serviceId:string;staffId:string;resourceId:string|null;
  status:BookingStatus;source:BookingSource;notes:string|null;startsAt:Date;endsAt:Date;effectiveStartsAt:Date;effectiveEndsAt:Date;createdAt:Date;updatedAt:Date;
};
export type BookingAuditEvent={id:string;tenantId:string;bookingId:string;actorUserId:string|null;eventType:string;fromStatus:BookingStatus|null;toStatus:BookingStatus|null;metadata:Record<string,unknown>;createdAt:Date};
export type CreateBookingInput={tenantId:string;customerId?:string|null;serviceId:string;startsAt:Date|string;staffId?:string;resourceId?:string;status?:'PENDING'|'CONFIRMED';source?:BookingSource;notes?:string|null;actorUserId?:string|null};
export type PersistBookingInput=Omit<Booking,'id'|'createdAt'|'updatedAt'> & {actorUserId?:string|null};
export type BookingSearch={from?:Date;to?:Date;status?:BookingStatus;source?:BookingSource;customerId?:string;limit?:number;offset?:number};
export type ManualBookingDate={startsAt:Date|string;staffId?:string;resourceId?:string};
export type BookingTransitionInput={tenantId:string;bookingId:string;toStatus:BookingStatus;allowedFrom:BookingStatus[];actorUserId?:string|null;reason?:string|null};
export type ReschedulePersistInput={tenantId:string;bookingId:string;staffId:string;resourceId:string|null;startsAt:Date;endsAt:Date;effectiveStartsAt:Date;effectiveEndsAt:Date;actorUserId?:string|null};
export interface BookingRepository{
  createWithConflictGuard(input:PersistBookingInput):Promise<Booking>;
  createManyWithConflictGuard(inputs:PersistBookingInput[]):Promise<Booking[]>;
  get(tenantId:string,bookingId:string):Promise<Booking|null>;
  search(tenantId:string,query:BookingSearch):Promise<Booking[]>;
  transitionStatus(input:BookingTransitionInput):Promise<Booking>;
  rescheduleWithConflictGuard(input:ReschedulePersistInput):Promise<Booking>;
  listAudit(tenantId:string,bookingId:string):Promise<BookingAuditEvent[]>;
}
export class BookingValidationError extends Error{constructor(message:string){super(message);this.name='BookingValidationError';}}
export class BookingUnavailableError extends Error{constructor(public readonly reason:string){super(`Booking unavailable: ${reason}`);this.name='BookingUnavailableError';}}
export class BookingConflictError extends Error{constructor(message='Booking slot was taken by another request'){super(message);this.name='BookingConflictError';}}
export class BookingNotFoundError extends Error{constructor(){super('Booking not found');this.name='BookingNotFoundError';}}
export class BookingStateError extends Error{constructor(message:string){super(message);this.name='BookingStateError';}}
export class BookingPolicyError extends Error{constructor(public readonly reason:string){super(`Booking policy blocked action: ${reason}`);this.name='BookingPolicyError';}}
export function assertPositiveMinutes(value:number,name:string){if(!Number.isInteger(value)||value<=0)throw new BookingValidationError(`${name} must be a positive integer`);return value;}
export const BOOKING_SOURCES:BookingSource[]=['ADMIN','PHONE','WALK_IN','WHATSAPP','WEB','IMPORT'];
export const BOOKING_STATUSES:BookingStatus[]=['PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW'];
function assertBookingSource(value:BookingSource|undefined){const source=value??'ADMIN';if(!BOOKING_SOURCES.includes(source))throw new BookingValidationError('invalid booking source');return source;}
function cleanNotes(value:string|null|undefined){const v=value?.trim();return v?v.slice(0,2000):null;}
const allowed={
  CONFIRMED:['PENDING'],
  CANCELLED:['PENDING','CONFIRMED'],
  COMPLETED:['CONFIRMED'],
  NO_SHOW:['CONFIRMED']
} satisfies Record<Exclude<BookingStatus,'PENDING'>,BookingStatus[]>;
export class BookingService{
  private readonly availability:AvailabilityEngine;
  constructor(private readonly availabilityRepo:AvailabilityRepository,private readonly repo:BookingRepository,private readonly clock:()=>Date=()=>new Date()){this.availability=new AvailabilityEngine(availabilityRepo,clock);}
  async create(input:CreateBookingInput){
    if(!input.tenantId?.trim())throw new BookingValidationError('tenantId is required');
    if(!input.serviceId?.trim())throw new BookingValidationError('serviceId is required');
    const startsAt=input.startsAt instanceof Date?input.startsAt:new Date(input.startsAt);
    if(Number.isNaN(startsAt.valueOf()))throw new BookingValidationError('startsAt must be a valid date-time');
    const checked=await this.availability.check({tenantId:input.tenantId,serviceId:input.serviceId,startsAt,staffId:input.staffId,resourceId:input.resourceId});
    if(!checked.available||!checked.candidates.length)throw new BookingUnavailableError(checked.reason??'no_candidate');
    const candidate=checked.candidates[0]!;
    return this.repo.createWithConflictGuard({tenantId:input.tenantId,customerId:input.customerId??null,serviceId:input.serviceId,staffId:candidate.staffId,resourceId:candidate.resourceId,status:input.status??'CONFIRMED',source:assertBookingSource(input.source),notes:cleanNotes(input.notes),startsAt:candidate.startsAt,endsAt:candidate.endsAt,effectiveStartsAt:candidate.effectiveStartsAt,effectiveEndsAt:candidate.effectiveEndsAt,actorUserId:input.actorUserId??null});
  }
  async get(tenantId:string,bookingId:string){const row=await this.repo.get(tenantId,bookingId);if(!row)throw new BookingNotFoundError();return row;}
  search(tenantId:string,query:BookingSearch={}){return this.repo.search(tenantId,{...query,limit:Math.min(Math.max(query.limit??50,1),100),offset:Math.max(query.offset??0,0)});}
  async audit(tenantId:string,bookingId:string){await this.get(tenantId,bookingId);return this.repo.listAudit(tenantId,bookingId);}
  private async transition(tenantId:string,bookingId:string,toStatus:Exclude<BookingStatus,'PENDING'>,actorUserId?:string|null,reason?:string|null){
    const current=await this.get(tenantId,bookingId);
    const from=allowed[toStatus] as BookingStatus[];
    if(!from.includes(current.status))throw new BookingStateError(`cannot transition ${current.status} to ${toStatus}`);
    return this.repo.transitionStatus({tenantId,bookingId,toStatus,allowedFrom:from,actorUserId:actorUserId??null,reason:reason?.trim()||null});
  }
  confirm(tenantId:string,bookingId:string,actorUserId?:string|null){return this.transition(tenantId,bookingId,'CONFIRMED',actorUserId);}
  async cancel(tenantId:string,bookingId:string,actorUserId?:string|null,reason?:string|null){const current=await this.get(tenantId,bookingId);const policy=await this.availabilityRepo.getBookingPolicy(tenantId);if(!cancellationAllowed({startsAt:current.startsAt,now:this.clock(),policy}))throw new BookingPolicyError('cancellation_deadline');return this.transition(tenantId,bookingId,'CANCELLED',actorUserId,reason);}
  complete(tenantId:string,bookingId:string,actorUserId?:string|null){return this.transition(tenantId,bookingId,'COMPLETED',actorUserId);}
  noShow(tenantId:string,bookingId:string,actorUserId?:string|null){return this.transition(tenantId,bookingId,'NO_SHOW',actorUserId);}
  async createManualBatch(input:{tenantId:string;customerId?:string|null;serviceId:string;dates:ManualBookingDate[];source:'ADMIN'|'PHONE'|'WALK_IN';status?:'PENDING'|'CONFIRMED';notes?:string|null;actorUserId?:string|null}){
    if(!Array.isArray(input.dates)||input.dates.length<1||input.dates.length>50)throw new BookingValidationError('manual booking dates must contain 1 to 50 items');
    const source=assertBookingSource(input.source);
    if(!['ADMIN','PHONE','WALK_IN'].includes(source))throw new BookingValidationError('manual booking source must be ADMIN, PHONE or WALK_IN');
    const prepared:PersistBookingInput[]=[];
    for(let index=0;index<input.dates.length;index++){
      const item=input.dates[index]!;
      const startsAt=item.startsAt instanceof Date?item.startsAt:new Date(item.startsAt);
      if(Number.isNaN(startsAt.valueOf()))throw new BookingValidationError(`dates[${index}].startsAt must be valid`);
      const checked=await this.availability.check({tenantId:input.tenantId,serviceId:input.serviceId,startsAt,staffId:item.staffId,resourceId:item.resourceId});
      if(!checked.available||!checked.candidates.length)throw new BookingUnavailableError(`manual_item_${index}:${checked.reason??'no_candidate'}`);
      const c=checked.candidates[0]!;
      prepared.push({tenantId:input.tenantId,customerId:input.customerId??null,serviceId:input.serviceId,staffId:c.staffId,resourceId:c.resourceId,status:input.status??'CONFIRMED',source,notes:cleanNotes(input.notes),startsAt:c.startsAt,endsAt:c.endsAt,effectiveStartsAt:c.effectiveStartsAt,effectiveEndsAt:c.effectiveEndsAt,actorUserId:input.actorUserId??null});
    }
    return this.repo.createManyWithConflictGuard(prepared);
  }
  async reschedule(input:{tenantId:string;bookingId:string;startsAt:Date|string;staffId?:string;resourceId?:string;actorUserId?:string|null}){
    const current=await this.get(input.tenantId,input.bookingId);
    if(!['PENDING','CONFIRMED'].includes(current.status))throw new BookingStateError(`cannot reschedule ${current.status} booking`);
    const startsAt=input.startsAt instanceof Date?input.startsAt:new Date(input.startsAt);
    if(Number.isNaN(startsAt.valueOf()))throw new BookingValidationError('startsAt must be a valid date-time');
    const checked=await this.availability.check({tenantId:input.tenantId,serviceId:current.serviceId,startsAt,staffId:input.staffId??current.staffId,resourceId:input.resourceId??current.resourceId??undefined,excludeBookingId:current.id});
    if(!checked.available||!checked.candidates.length)throw new BookingUnavailableError(checked.reason??'no_candidate');
    const candidate=checked.candidates[0]!;
    return this.repo.rescheduleWithConflictGuard({tenantId:input.tenantId,bookingId:current.id,staffId:candidate.staffId,resourceId:candidate.resourceId,startsAt:candidate.startsAt,endsAt:candidate.endsAt,effectiveStartsAt:candidate.effectiveStartsAt,effectiveEndsAt:candidate.effectiveEndsAt,actorUserId:input.actorUserId??null});
  }
}
