export type CalendarView='staff'|'resource';
export type CalendarRow={id:string;name:string;kind:'STAFF'|'RESOURCE';capacity:number;photoUrl:string|null;resourceType:string|null};
export type CalendarBookingItem={id:string;rowId:string|null;status:string;startsAt:Date;endsAt:Date;customerId:string|null;customerName:string|null;serviceId:string;serviceName:string;staffId:string;staffName:string;resourceId:string|null;resourceName:string|null};
export type CalendarBlockItem={id:string;rowId:string;type:'LEAVE'|'BLOCKED';startsAt:Date;endsAt:Date;reason:string|null};
export type CalendarSnapshot={tenantId:string;view:CalendarView;from:Date;to:Date;rows:CalendarRow[];bookings:CalendarBookingItem[];blocks:CalendarBlockItem[]};
export interface CalendarRepository{snapshot(tenantId:string,view:CalendarView,from:Date,to:Date):Promise<CalendarSnapshot>;}
export class CalendarValidationError extends Error{constructor(message:string){super(message);this.name='CalendarValidationError';}}
export class CalendarService{
  constructor(private readonly repo:CalendarRepository){}
  get(tenantId:string,input:{view?:CalendarView;from:Date|string;to:Date|string}){
    const view=input.view??'staff';if(!['staff','resource'].includes(view))throw new CalendarValidationError('view must be staff or resource');
    const from=input.from instanceof Date?input.from:new Date(input.from),to=input.to instanceof Date?input.to:new Date(input.to);
    if(Number.isNaN(from.valueOf())||Number.isNaN(to.valueOf())||from>=to)throw new CalendarValidationError('from/to must be a valid increasing range');
    if(to.getTime()-from.getTime()>8*24*60*60*1000)throw new CalendarValidationError('calendar range cannot exceed 8 days');
    return this.repo.snapshot(tenantId,view,from,to);
  }
}
