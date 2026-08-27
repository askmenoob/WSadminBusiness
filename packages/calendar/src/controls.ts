export type CalendarBlockScope='TENANT'|'STAFF'|'RESOURCE';
export type CalendarRecurrence='NONE'|'DAILY'|'WEEKLY';
export type CalendarControlBlock={id:string;tenantId:string;scope:CalendarBlockScope;staffId:string|null;resourceId:string|null;type:'STOP_SALE'|'BLOCKED';startsAt:Date;endsAt:Date;recurrence:CalendarRecurrence;recurrenceUntil:Date|null;reason:string|null;createdByUserId:string|null;createdAt:Date};
export type CreateCalendarBlockInput={scope:CalendarBlockScope;staffId?:string|null;resourceId?:string|null;type?:'STOP_SALE'|'BLOCKED';startsAt:Date|string;endsAt:Date|string;recurrence?:CalendarRecurrence;recurrenceUntil?:Date|string|null;reason?:string|null;createdByUserId?:string|null};
export interface CalendarControlRepository{create(tenantId:string,input:Omit<CreateCalendarBlockInput,'startsAt'|'endsAt'|'recurrenceUntil'> & {startsAt:Date;endsAt:Date;recurrenceUntil:Date|null}):Promise<CalendarControlBlock>;remove(tenantId:string,id:string):Promise<boolean>;list(tenantId:string,from:Date,to:Date):Promise<CalendarControlBlock[]>;}
export class CalendarControlValidationError extends Error{constructor(message:string){super(message);this.name='CalendarControlValidationError';}}
function dateOf(v:Date|string,name:string){const d=v instanceof Date?v:new Date(v);if(Number.isNaN(d.valueOf()))throw new CalendarControlValidationError(`${name} must be valid date-time`);return d;}
export class CalendarControlService{
  constructor(private readonly repo:CalendarControlRepository){}
  create(tenantId:string,input:CreateCalendarBlockInput){
    if(!['TENANT','STAFF','RESOURCE'].includes(input.scope))throw new CalendarControlValidationError('invalid scope');
    if(input.scope==='STAFF'&&!input.staffId)throw new CalendarControlValidationError('staffId required for STAFF scope');
    if(input.scope==='RESOURCE'&&!input.resourceId)throw new CalendarControlValidationError('resourceId required for RESOURCE scope');
    if(input.scope==='TENANT'&&(input.staffId||input.resourceId))throw new CalendarControlValidationError('TENANT scope cannot target staff/resource');
    const startsAt=dateOf(input.startsAt,'startsAt'),endsAt=dateOf(input.endsAt,'endsAt');if(startsAt>=endsAt)throw new CalendarControlValidationError('startsAt must be before endsAt');
    const recurrence=input.recurrence??'NONE';if(!['NONE','DAILY','WEEKLY'].includes(recurrence))throw new CalendarControlValidationError('invalid recurrence');
    const recurrenceUntil=input.recurrenceUntil?dateOf(input.recurrenceUntil,'recurrenceUntil'):null;if(recurrenceUntil&&recurrenceUntil<startsAt)throw new CalendarControlValidationError('recurrenceUntil cannot be before startsAt');
    return this.repo.create(tenantId,{...input,type:input.type??'STOP_SALE',startsAt,endsAt,recurrence,recurrenceUntil,reason:input.reason?.trim()||null,createdByUserId:input.createdByUserId??null});
  }
  remove(tenantId:string,id:string){return this.repo.remove(tenantId,id);}
  list(tenantId:string,from:Date|string,to:Date|string){const a=dateOf(from,'from'),b=dateOf(to,'to');if(a>=b)throw new CalendarControlValidationError('from must be before to');return this.repo.list(tenantId,a,b);}
}
