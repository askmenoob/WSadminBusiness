import { AvailabilityEngine,type AvailabilityRepository } from '@wsadmin-business/availability';
export type BookingIntent='BOOK'|'RESCHEDULE'|'CANCEL'|'AVAILABILITY';
export const BOOKING_CORE_RULE='deterministic-domain-service' as const;
export type BookingStatus='PENDING'|'CONFIRMED'|'CANCELLED'|'COMPLETED'|'NO_SHOW';
export type Booking={
  id:string;tenantId:string;customerId:string|null;serviceId:string;staffId:string;resourceId:string|null;
  status:BookingStatus;startsAt:Date;endsAt:Date;effectiveStartsAt:Date;effectiveEndsAt:Date;createdAt:Date;updatedAt:Date;
};
export type BookingAuditEvent={id:string;tenantId:string;bookingId:string;actorUserId:string|null;eventType:string;fromStatus:BookingStatus|null;toStatus:BookingStatus|null;metadata:Record<string,unknown>;createdAt:Date};
export type CreateBookingInput={tenantId:string;customerId?:string|null;serviceId:string;startsAt:Date|string;staffId?:string;resourceId?:string;status?:'PENDING'|'CONFIRMED';actorUserId?:string|null};
export type PersistBookingInput=Omit<Booking,'id'|'createdAt'|'updatedAt'> & {actorUserId?:string|null};
export type BookingTransitionInput={tenantId:string;bookingId:string;toStatus:BookingStatus;allowedFrom:BookingStatus[];actorUserId?:string|null;reason?:string|null};
export type ReschedulePersistInput={tenantId:string;bookingId:string;staffId:string;resourceId:string|null;startsAt:Date;endsAt:Date;effectiveStartsAt:Date;effectiveEndsAt:Date;actorUserId?:string|null};
export interface BookingRepository{
  createWithConflictGuard(input:PersistBookingInput):Promise<Booking>;
  get(tenantId:string,bookingId:string):Promise<Booking|null>;
  transitionStatus(input:BookingTransitionInput):Promise<Booking>;
  rescheduleWithConflictGuard(input:ReschedulePersistInput):Promise<Booking>;
  listAudit(tenantId:string,bookingId:string):Promise<BookingAuditEvent[]>;
}
export class BookingValidationError extends Error{constructor(message:string){super(message);this.name='BookingValidationError';}}
export class BookingUnavailableError extends Error{constructor(public readonly reason:string){super(`Booking unavailable: ${reason}`);this.name='BookingUnavailableError';}}
export class BookingConflictError extends Error{constructor(message='Booking slot was taken by another request'){super(message);this.name='BookingConflictError';}}
export class BookingNotFoundError extends Error{constructor(){super('Booking not found');this.name='BookingNotFoundError';}}
export class BookingStateError extends Error{constructor(message:string){super(message);this.name='BookingStateError';}}
export function assertPositiveMinutes(value:number,name:string){if(!Number.isInteger(value)||value<=0)throw new BookingValidationError(`${name} must be a positive integer`);return value;}
const allowed={
  CONFIRMED:['PENDING'],
  CANCELLED:['PENDING','CONFIRMED'],
  COMPLETED:['CONFIRMED'],
  NO_SHOW:['CONFIRMED']
} satisfies Record<Exclude<BookingStatus,'PENDING'>,BookingStatus[]>;
export class BookingService{
  private readonly availability:AvailabilityEngine;
  constructor(availabilityRepo:AvailabilityRepository,private readonly repo:BookingRepository){this.availability=new AvailabilityEngine(availabilityRepo);}
  async create(input:CreateBookingInput){
    if(!input.tenantId?.trim())throw new BookingValidationError('tenantId is required');
    if(!input.serviceId?.trim())throw new BookingValidationError('serviceId is required');
    const startsAt=input.startsAt instanceof Date?input.startsAt:new Date(input.startsAt);
    if(Number.isNaN(startsAt.valueOf()))throw new BookingValidationError('startsAt must be a valid date-time');
    const checked=await this.availability.check({tenantId:input.tenantId,serviceId:input.serviceId,startsAt,staffId:input.staffId,resourceId:input.resourceId});
    if(!checked.available||!checked.candidates.length)throw new BookingUnavailableError(checked.reason??'no_candidate');
    const candidate=checked.candidates[0]!;
    return this.repo.createWithConflictGuard({tenantId:input.tenantId,customerId:input.customerId??null,serviceId:input.serviceId,staffId:candidate.staffId,resourceId:candidate.resourceId,status:input.status??'CONFIRMED',startsAt:candidate.startsAt,endsAt:candidate.endsAt,effectiveStartsAt:candidate.effectiveStartsAt,effectiveEndsAt:candidate.effectiveEndsAt,actorUserId:input.actorUserId??null});
  }
  async get(tenantId:string,bookingId:string){const row=await this.repo.get(tenantId,bookingId);if(!row)throw new BookingNotFoundError();return row;}
  async audit(tenantId:string,bookingId:string){await this.get(tenantId,bookingId);return this.repo.listAudit(tenantId,bookingId);}
  private async transition(tenantId:string,bookingId:string,toStatus:Exclude<BookingStatus,'PENDING'>,actorUserId?:string|null,reason?:string|null){
    const current=await this.get(tenantId,bookingId);
    const from=allowed[toStatus] as BookingStatus[];
    if(!from.includes(current.status))throw new BookingStateError(`cannot transition ${current.status} to ${toStatus}`);
    return this.repo.transitionStatus({tenantId,bookingId,toStatus,allowedFrom:from,actorUserId:actorUserId??null,reason:reason?.trim()||null});
  }
  confirm(tenantId:string,bookingId:string,actorUserId?:string|null){return this.transition(tenantId,bookingId,'CONFIRMED',actorUserId);}
  cancel(tenantId:string,bookingId:string,actorUserId?:string|null,reason?:string|null){return this.transition(tenantId,bookingId,'CANCELLED',actorUserId,reason);}
  complete(tenantId:string,bookingId:string,actorUserId?:string|null){return this.transition(tenantId,bookingId,'COMPLETED',actorUserId);}
  noShow(tenantId:string,bookingId:string,actorUserId?:string|null){return this.transition(tenantId,bookingId,'NO_SHOW',actorUserId);}
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
