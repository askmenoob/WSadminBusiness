export type BookingPolicy={
  bookingHorizonDays:number;
  slotIntervalMinutes:number;
  minimumLeadMinutes:number;
  sameDayCutoffMinute:number|null;
  cancellationDeadlineMinutes:number;
};
export type BookingPolicyUpdate=Partial<BookingPolicy>;
export interface BookingPolicyRepository{
  get(tenantId:string):Promise<BookingPolicy>;
  upsert(tenantId:string,policy:BookingPolicy):Promise<BookingPolicy>;
}
export const DEFAULT_BOOKING_POLICY:BookingPolicy={
  bookingHorizonDays:90,
  slotIntervalMinutes:15,
  minimumLeadMinutes:60,
  sameDayCutoffMinute:null,
  cancellationDeadlineMinutes:120
};
export class BookingPolicyValidationError extends Error{
  constructor(message:string){super(message);this.name='BookingPolicyValidationError';}
}
function intRange(value:number,name:string,min:number,max:number){
  if(!Number.isInteger(value)||value<min||value>max)throw new BookingPolicyValidationError(`${name} must be an integer between ${min} and ${max}`);
  return value;
}
export function validateBookingPolicy(policy:BookingPolicy):BookingPolicy{
  const bookingHorizonDays=intRange(policy.bookingHorizonDays,'bookingHorizonDays',1,730);
  const slotIntervalMinutes=intRange(policy.slotIntervalMinutes,'slotIntervalMinutes',5,720);
  if(slotIntervalMinutes%5!==0)throw new BookingPolicyValidationError('slotIntervalMinutes must be a multiple of 5');
  const minimumLeadMinutes=intRange(policy.minimumLeadMinutes,'minimumLeadMinutes',0,10080);
  const cancellationDeadlineMinutes=intRange(policy.cancellationDeadlineMinutes,'cancellationDeadlineMinutes',0,43200);
  const sameDayCutoffMinute=policy.sameDayCutoffMinute===null?null:intRange(policy.sameDayCutoffMinute,'sameDayCutoffMinute',0,1439);
  return{bookingHorizonDays,slotIntervalMinutes,minimumLeadMinutes,sameDayCutoffMinute,cancellationDeadlineMinutes};
}
export function mergeBookingPolicy(current:BookingPolicy,update:BookingPolicyUpdate){
  return validateBookingPolicy({...current,...update});
}
function localParts(date:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value??'';
  return{date:`${get('year')}-${get('month')}-${get('day')}`,minute:Number(get('hour'))*60+Number(get('minute'))};
}
export type BookingStartDecision={allowed:boolean;reason?:'lead_time'|'horizon'|'slot_interval'|'same_day_cutoff'};
export function evaluateBookingStart(args:{startsAt:Date;now:Date;timeZone:string;policy:BookingPolicy}):BookingStartDecision{
  const{startsAt,now,timeZone}=args,policy=validateBookingPolicy(args.policy);
  if(startsAt.getTime()<now.getTime()+policy.minimumLeadMinutes*60000)return{allowed:false,reason:'lead_time'};
  if(startsAt.getTime()>now.getTime()+policy.bookingHorizonDays*86400000)return{allowed:false,reason:'horizon'};
  const startLocal=localParts(startsAt,timeZone),nowLocal=localParts(now,timeZone);
  if(startLocal.minute%policy.slotIntervalMinutes!==0)return{allowed:false,reason:'slot_interval'};
  if(policy.sameDayCutoffMinute!==null&&startLocal.date===nowLocal.date&&nowLocal.minute>=policy.sameDayCutoffMinute)return{allowed:false,reason:'same_day_cutoff'};
  return{allowed:true};
}
export function cancellationAllowed(args:{startsAt:Date;now:Date;policy:BookingPolicy}){
  const policy=validateBookingPolicy(args.policy);
  return args.startsAt.getTime()-args.now.getTime()>=policy.cancellationDeadlineMinutes*60000;
}
export class BookingPolicyService{
  constructor(private readonly repo:BookingPolicyRepository){}
  get(tenantId:string){return this.repo.get(tenantId);}
  async update(tenantId:string,update:BookingPolicyUpdate){
    const current=await this.repo.get(tenantId);
    return this.repo.upsert(tenantId,mergeBookingPolicy(current,update));
  }
}
