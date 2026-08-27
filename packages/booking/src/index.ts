import { AvailabilityEngine,type AvailabilityRepository } from '@wsadmin-business/availability';
export type BookingIntent='BOOK'|'RESCHEDULE'|'CANCEL'|'AVAILABILITY';
export const BOOKING_CORE_RULE='deterministic-domain-service' as const;
export type BookingStatus='PENDING'|'CONFIRMED'|'CANCELLED'|'COMPLETED'|'NO_SHOW';
export type Booking={
  id:string;tenantId:string;customerId:string|null;serviceId:string;staffId:string;resourceId:string|null;
  status:BookingStatus;startsAt:Date;endsAt:Date;effectiveStartsAt:Date;effectiveEndsAt:Date;createdAt:Date;updatedAt:Date;
};
export type CreateBookingInput={tenantId:string;customerId?:string|null;serviceId:string;startsAt:Date|string;staffId?:string;resourceId?:string;status?:'PENDING'|'CONFIRMED'};
export type PersistBookingInput=Omit<Booking,'id'|'createdAt'|'updatedAt'>;
export interface BookingRepository{createWithConflictGuard(input:PersistBookingInput):Promise<Booking>;}
export class BookingValidationError extends Error{constructor(message:string){super(message);this.name='BookingValidationError';}}
export class BookingUnavailableError extends Error{constructor(public readonly reason:string){super(`Booking unavailable: ${reason}`);this.name='BookingUnavailableError';}}
export class BookingConflictError extends Error{constructor(message='Booking slot was taken by another request'){super(message);this.name='BookingConflictError';}}
export function assertPositiveMinutes(value:number,name:string){if(!Number.isInteger(value)||value<=0)throw new BookingValidationError(`${name} must be a positive integer`);return value;}
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
    return this.repo.createWithConflictGuard({
      tenantId:input.tenantId,
      customerId:input.customerId??null,
      serviceId:input.serviceId,
      staffId:candidate.staffId,
      resourceId:candidate.resourceId,
      status:input.status??'CONFIRMED',
      startsAt:candidate.startsAt,
      endsAt:candidate.endsAt,
      effectiveStartsAt:candidate.effectiveStartsAt,
      effectiveEndsAt:candidate.effectiveEndsAt
    });
  }
}
