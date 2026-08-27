import { resolveOptionSelection,ServiceOptionValidationError,type ServiceOption,type ServiceOptionGroup } from '@wsadmin-business/services';
import { evaluateBookingStart,type BookingPolicy } from '@wsadmin-business/booking-policy';
export type AvailabilityService={id:string;active:boolean;durationMinutes:number;bufferBeforeMinutes:number;bufferAfterMinutes:number;priceMinor:number;currency:string};
export type AvailabilityStaff={id:string;active:boolean;bookingCapacity:number;sortOrder:number;displayName:string;photoUrl:string|null};
export type AvailabilityResource={id:string;active:boolean;capacity:number;type:string;allocationPriority:number};
export type WeeklyHours={weekday:number;startMinute:number;endMinute:number};
export type ShiftOverride={localDate:string;startMinute:number|null;endMinute:number|null;isOff:boolean};
export type TimeBlock={startsAt:Date;endsAt:Date};
export type AvailabilityControlBlock={startsAt:Date;endsAt:Date;type:'STOP_SALE'|'BLOCKED'};
export type BusyCountQuery={tenantId:string;staffId?:string;resourceId?:string;startsAt:Date;endsAt:Date;excludeBookingId?:string};
export interface AvailabilityRepository{
  getTenantTimezone(tenantId:string):Promise<string>;
  getLocation(tenantId:string,locationId:string):Promise<{id:string;timezone:string|null;active:boolean}|null>;
  isServiceAtLocation(tenantId:string,serviceId:string,locationId:string):Promise<boolean>;
  getBookingPolicy(tenantId:string):Promise<BookingPolicy>;
  getService(tenantId:string,serviceId:string):Promise<AvailabilityService|null>;
  getServiceOptionConfiguration(tenantId:string,serviceId:string):Promise<{groups:ServiceOptionGroup[];options:ServiceOption[]}>;
  listEligibleStaff(tenantId:string,serviceId:string,staffId?:string,locationId?:string):Promise<AvailabilityStaff[]>;
  getWeeklyHours(tenantId:string,staffId:string):Promise<WeeklyHours[]>;
  getShiftOverrides(tenantId:string,staffId:string,localDate:string):Promise<ShiftOverride[]>;
  getTimeBlocks(tenantId:string,staffId:string,startsAt:Date,endsAt:Date):Promise<TimeBlock[]>;
  getCalendarBlocks(tenantId:string,staffId:string,resourceId:string|null,startsAt:Date,endsAt:Date):Promise<AvailabilityControlBlock[]>;
  listCompatibleResources(tenantId:string,serviceId:string,resourceId?:string,requiredResourceType?:string|null,locationId?:string):Promise<AvailabilityResource[]>;
  countBusyBookings(query:BusyCountQuery):Promise<number>;
}
export type AvailabilityRequest={tenantId:string;locationId?:string;serviceId:string;startsAt:Date|string;staffId?:string;resourceId?:string;optionIds?:string[];excludeBookingId?:string};
export type AvailabilityCandidate={locationId:string|null;staffId:string;staffDisplayName:string;staffPhotoUrl:string|null;staffSortOrder:number;staffBusy:number;staffCapacity:number;resourceId:string|null;resourceAllocationPriority:number|null;optionIds:string[];durationMinutes:number;basePriceMinor:number;optionPriceMinor:number;priceMinor:number;currency:string;startsAt:Date;endsAt:Date;effectiveStartsAt:Date;effectiveEndsAt:Date};
export type AvailabilityResult={available:boolean;reason?:string;candidates:AvailabilityCandidate[]};
export class AvailabilityValidationError extends Error{constructor(message:string){super(message);this.name='AvailabilityValidationError';}}
function overlap(aStart:Date,aEnd:Date,bStart:Date,bEnd:Date){return aStart<bEnd&&bStart<aEnd;}
function localParts(date:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const val=(type:string)=>parts.find(p=>p.type===type)?.value??'';
  const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return{localDate:`${val('year')}-${val('month')}-${val('day')}`,weekday:weekdays.indexOf(val('weekday')),minute:Number(val('hour'))*60+Number(val('minute'))};
}
function windowFits(start:Date,end:Date,timeZone:string,intervals:{startMinute:number;endMinute:number}[]){
  const a=localParts(start,timeZone),b=localParts(new Date(end.getTime()-1),timeZone);
  if(a.localDate!==b.localDate)return false;
  return intervals.some(x=>a.minute>=x.startMinute&&(b.minute+1)<=x.endMinute);
}
export class AvailabilityEngine{
  constructor(private readonly repo:AvailabilityRepository,private readonly clock:()=>Date=()=>new Date()){}
  async check(input:AvailabilityRequest):Promise<AvailabilityResult>{
    const startsAt=input.startsAt instanceof Date?input.startsAt:new Date(input.startsAt);
    if(Number.isNaN(startsAt.valueOf()))throw new AvailabilityValidationError('startsAt must be a valid date-time');
    const tenantTimezone=await this.repo.getTenantTimezone(input.tenantId);
    let timeZone=tenantTimezone;
    if(input.locationId){const location=await this.repo.getLocation(input.tenantId,input.locationId);if(!location||!location.active)return{available:false,reason:'location_unavailable',candidates:[]};timeZone=location.timezone??tenantTimezone;if(!(await this.repo.isServiceAtLocation(input.tenantId,input.serviceId,input.locationId)))return{available:false,reason:'location_service_unavailable',candidates:[]};}
    const policy=await this.repo.getBookingPolicy(input.tenantId);
    const policyDecision=evaluateBookingStart({startsAt,now:this.clock(),timeZone,policy});
    if(!policyDecision.allowed)return{available:false,reason:`policy_${policyDecision.reason}`,candidates:[]};
    const service=await this.repo.getService(input.tenantId,input.serviceId);
    if(!service||!service.active)return{available:false,reason:'service_unavailable',candidates:[]};
    const config=await this.repo.getServiceOptionConfiguration(input.tenantId,input.serviceId);
    let selected;
    try{selected=resolveOptionSelection(config.groups,config.options,input.optionIds??[]);}catch(error){if(error instanceof ServiceOptionValidationError)return{available:false,reason:'option_selection_invalid',candidates:[]};throw error;}
    const durationMinutes=service.durationMinutes+selected.durationDeltaMinutes;
    const optionPriceMinor=selected.priceDeltaMinor;
    const priceMinor=service.priceMinor+optionPriceMinor;
    const endsAt=new Date(startsAt.getTime()+durationMinutes*60000);
    const effectiveStartsAt=new Date(startsAt.getTime()-service.bufferBeforeMinutes*60000);
    const effectiveEndsAt=new Date(endsAt.getTime()+service.bufferAfterMinutes*60000);
    const local=localParts(startsAt,timeZone);
    const staff=await this.repo.listEligibleStaff(input.tenantId,input.serviceId,input.staffId,input.locationId);
    if(!staff.length)return{available:false,reason:'no_eligible_staff',candidates:[]};
    const compatible=await this.repo.listCompatibleResources(input.tenantId,input.serviceId,input.resourceId,selected.requiredResourceType,input.locationId);
    if(input.resourceId&&compatible.length===0)return{available:false,reason:'resource_incompatible',candidates:[]};
    const resources:AvailabilityResource[]|[null]=compatible.length?compatible:[null];
    const candidates:AvailabilityCandidate[]=[];
    for(const person of staff){
      if(!person.active)continue;
      const overrides=await this.repo.getShiftOverrides(input.tenantId,person.id,local.localDate);
      let within=false;
      if(overrides.length){
        if(overrides.some(x=>x.isOff))continue;
        within=windowFits(effectiveStartsAt,effectiveEndsAt,timeZone,overrides.filter(x=>!x.isOff&&x.startMinute!==null&&x.endMinute!==null).map(x=>({startMinute:x.startMinute!,endMinute:x.endMinute!})));
      }else{
        const weekly=await this.repo.getWeeklyHours(input.tenantId,person.id);
        within=windowFits(effectiveStartsAt,effectiveEndsAt,timeZone,weekly.filter(x=>x.weekday===local.weekday));
      }
      if(!within)continue;
      const blocks=await this.repo.getTimeBlocks(input.tenantId,person.id,effectiveStartsAt,effectiveEndsAt);
      if(blocks.some(b=>overlap(effectiveStartsAt,effectiveEndsAt,b.startsAt,b.endsAt)))continue;
      const staffBusy=await this.repo.countBusyBookings({tenantId:input.tenantId,staffId:person.id,startsAt:effectiveStartsAt,endsAt:effectiveEndsAt,excludeBookingId:input.excludeBookingId});
      if(staffBusy>=person.bookingCapacity)continue;
      for(const resource of resources){
        const controlBlocks=await this.repo.getCalendarBlocks(input.tenantId,person.id,resource?.id??null,effectiveStartsAt,effectiveEndsAt);
        if(controlBlocks.some(b=>overlap(effectiveStartsAt,effectiveEndsAt,b.startsAt,b.endsAt)))continue;
        if(resource){
          if(!resource.active)continue;
          const resourceBusy=await this.repo.countBusyBookings({tenantId:input.tenantId,resourceId:resource.id,startsAt:effectiveStartsAt,endsAt:effectiveEndsAt,excludeBookingId:input.excludeBookingId});
          if(resourceBusy>=resource.capacity)continue;
        }
        candidates.push({locationId:input.locationId??null,staffId:person.id,staffDisplayName:person.displayName,staffPhotoUrl:person.photoUrl,staffSortOrder:person.sortOrder,staffBusy,staffCapacity:person.bookingCapacity,resourceId:resource?.id??null,resourceAllocationPriority:resource?.allocationPriority??null,optionIds:selected.optionIds,durationMinutes,basePriceMinor:service.priceMinor,optionPriceMinor,priceMinor,currency:service.currency,startsAt,endsAt,effectiveStartsAt,effectiveEndsAt});
      }
    }
    return candidates.length?{available:true,candidates}:{available:false,reason:'no_capacity',candidates:[]};
  }
}

function zonedLocalToUtc(localDate:string,minute:number,timeZone:string){
  const [y,m,d]=localDate.split('-').map(Number);if(!y||!m||!d||minute<0||minute>=1440)throw new AvailabilityValidationError('invalid local date/slot minute');
  const hour=Math.floor(minute/60),min=minute%60,target=Date.UTC(y,m-1,d,hour,min);let guess=target;
  for(let i=0;i<4;i++){const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));const get=(t:string)=>Number(parts.find(p=>p.type===t)?.value??0);const represented=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'));const delta=target-represented;if(delta===0)break;guess+=delta;}
  return new Date(guess);
}
export async function findAvailabilitySlots(repo:AvailabilityRepository,input:{tenantId:string;locationId?:string;serviceId:string;localDate:string;staffId?:string;resourceId?:string;optionIds?:string[];excludeBookingId?:string;limit?:number},clock:()=>Date=()=>new Date()){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate))throw new AvailabilityValidationError('localDate must be YYYY-MM-DD');
  const tenantTimezone=await repo.getTenantTimezone(input.tenantId);let timeZone=tenantTimezone;if(input.locationId){const location=await repo.getLocation(input.tenantId,input.locationId);if(!location||!location.active)return[];timeZone=location.timezone??tenantTimezone;}
  const policy=await repo.getBookingPolicy(input.tenantId),limit=Math.min(Math.max(input.limit??12,1),48),engine=new AvailabilityEngine(repo,clock),slots:AvailabilityCandidate[]=[];
  for(let minute=0;minute<1440&&slots.length<limit;minute+=policy.slotIntervalMinutes){const startsAt=zonedLocalToUtc(input.localDate,minute,timeZone);const result=await engine.check({...input,startsAt});if(result.available&&result.candidates[0])slots.push(result.candidates[0]);}
  return slots;
}
