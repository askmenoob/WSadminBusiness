export type AvailabilityService={id:string;active:boolean;durationMinutes:number;bufferBeforeMinutes:number;bufferAfterMinutes:number};
export type AvailabilityStaff={id:string;active:boolean;bookingCapacity:number};
export type AvailabilityResource={id:string;active:boolean;capacity:number};
export type WeeklyHours={weekday:number;startMinute:number;endMinute:number};
export type ShiftOverride={localDate:string;startMinute:number|null;endMinute:number|null;isOff:boolean};
export type TimeBlock={startsAt:Date;endsAt:Date};
export type BusyCountQuery={tenantId:string;staffId?:string;resourceId?:string;startsAt:Date;endsAt:Date};
export interface AvailabilityRepository{
  getTenantTimezone(tenantId:string):Promise<string>;
  getService(tenantId:string,serviceId:string):Promise<AvailabilityService|null>;
  listEligibleStaff(tenantId:string,serviceId:string,staffId?:string):Promise<AvailabilityStaff[]>;
  getWeeklyHours(tenantId:string,staffId:string):Promise<WeeklyHours[]>;
  getShiftOverrides(tenantId:string,staffId:string,localDate:string):Promise<ShiftOverride[]>;
  getTimeBlocks(tenantId:string,staffId:string,startsAt:Date,endsAt:Date):Promise<TimeBlock[]>;
  listCompatibleResources(tenantId:string,serviceId:string,resourceId?:string):Promise<AvailabilityResource[]>;
  countBusyBookings(query:BusyCountQuery):Promise<number>;
}
export type AvailabilityRequest={tenantId:string;serviceId:string;startsAt:Date|string;staffId?:string;resourceId?:string};
export type AvailabilityCandidate={staffId:string;resourceId:string|null;startsAt:Date;endsAt:Date;effectiveStartsAt:Date;effectiveEndsAt:Date};
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
  constructor(private readonly repo:AvailabilityRepository){}
  async check(input:AvailabilityRequest):Promise<AvailabilityResult>{
    const startsAt=input.startsAt instanceof Date?input.startsAt:new Date(input.startsAt);
    if(Number.isNaN(startsAt.valueOf()))throw new AvailabilityValidationError('startsAt must be a valid date-time');
    const service=await this.repo.getService(input.tenantId,input.serviceId);
    if(!service||!service.active)return{available:false,reason:'service_unavailable',candidates:[]};
    const endsAt=new Date(startsAt.getTime()+service.durationMinutes*60000);
    const effectiveStartsAt=new Date(startsAt.getTime()-service.bufferBeforeMinutes*60000);
    const effectiveEndsAt=new Date(endsAt.getTime()+service.bufferAfterMinutes*60000);
    const timeZone=await this.repo.getTenantTimezone(input.tenantId);
    const local=localParts(startsAt,timeZone);
    const staff=await this.repo.listEligibleStaff(input.tenantId,input.serviceId,input.staffId);
    if(!staff.length)return{available:false,reason:'no_eligible_staff',candidates:[]};
    const compatible=await this.repo.listCompatibleResources(input.tenantId,input.serviceId,input.resourceId);
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
      const staffBusy=await this.repo.countBusyBookings({tenantId:input.tenantId,staffId:person.id,startsAt:effectiveStartsAt,endsAt:effectiveEndsAt});
      if(staffBusy>=person.bookingCapacity)continue;
      for(const resource of resources){
        if(resource){
          if(!resource.active)continue;
          const resourceBusy=await this.repo.countBusyBookings({tenantId:input.tenantId,resourceId:resource.id,startsAt:effectiveStartsAt,endsAt:effectiveEndsAt});
          if(resourceBusy>=resource.capacity)continue;
        }
        candidates.push({staffId:person.id,resourceId:resource?.id??null,startsAt,endsAt,effectiveStartsAt,effectiveEndsAt});
      }
    }
    return candidates.length?{available:true,candidates}:{available:false,reason:'no_capacity',candidates:[]};
  }
}
