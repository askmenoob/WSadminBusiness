export type BookingIntent = 'BOOK'|'RESCHEDULE'|'CANCEL'|'AVAILABILITY';
export const BOOKING_CORE_RULE = 'deterministic-domain-service' as const;
export function assertPositiveMinutes(value:number,name:string){if(!Number.isInteger(value)||value<=0)throw new Error(`${name} must be a positive integer`);return value;}
