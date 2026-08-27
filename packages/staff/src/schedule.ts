export type WeeklyHours={weekday:number;startMinute:number;endMinute:number};
export type ShiftOverride={id:string;tenantId:string;staffId:string;localDate:string;startMinute:number|null;endMinute:number|null;isOff:boolean;createdAt:Date};
export type StaffTimeBlockType='LEAVE'|'BLOCKED';
export type StaffTimeBlock={id:string;tenantId:string;staffId:string;type:StaffTimeBlockType;startsAt:Date;endsAt:Date;reason:string|null;createdAt:Date};
export interface StaffScheduleRepository{
  setWeeklyHours(tenantId:string,staffId:string,intervals:WeeklyHours[]):Promise<WeeklyHours[]>;
  getWeeklyHours(tenantId:string,staffId:string):Promise<WeeklyHours[]>;
  addShiftOverride(tenantId:string,staffId:string,input:Omit<ShiftOverride,'id'|'tenantId'|'staffId'|'createdAt'>):Promise<ShiftOverride>;
  listShiftOverrides(tenantId:string,staffId:string,from?:string,to?:string):Promise<ShiftOverride[]>;
  addTimeBlock(tenantId:string,staffId:string,input:{type:StaffTimeBlockType;startsAt:Date;endsAt:Date;reason?:string|null}):Promise<StaffTimeBlock>;
  listTimeBlocks(tenantId:string,staffId:string,from?:Date,to?:Date):Promise<StaffTimeBlock[]>;
}
export class StaffScheduleValidationError extends Error{constructor(message:string){super(message);this.name='StaffScheduleValidationError';}}
function minute(v:number,name:string){if(!Number.isInteger(v)||v<0||v>1440)throw new StaffScheduleValidationError(`${name} must be between 0 and 1440`);return v;}
function isoDate(v:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(`${v}T00:00:00Z`)))throw new StaffScheduleValidationError('localDate must be YYYY-MM-DD');return v;}
function validateWeekly(intervals:WeeklyHours[]){
  const out=intervals.map(x=>{if(!Number.isInteger(x.weekday)||x.weekday<0||x.weekday>6)throw new StaffScheduleValidationError('weekday must be 0 to 6');const startMinute=minute(x.startMinute,'startMinute'),endMinute=minute(x.endMinute,'endMinute');if(startMinute>=endMinute)throw new StaffScheduleValidationError('working interval start must be before end');return{weekday:x.weekday,startMinute,endMinute};}).sort((a,b)=>a.weekday-b.weekday||a.startMinute-b.startMinute);
  for(let i=1;i<out.length;i++){const a=out[i-1]!,b=out[i]!;if(a.weekday===b.weekday&&b.startMinute<a.endMinute)throw new StaffScheduleValidationError('working intervals cannot overlap');}
  return out;
}
export class StaffScheduleService{
  constructor(private readonly repo:StaffScheduleRepository){}
  setWeeklyHours(t:string,s:string,intervals:WeeklyHours[]){return this.repo.setWeeklyHours(t,s,validateWeekly(intervals));}
  getWeeklyHours(t:string,s:string){return this.repo.getWeeklyHours(t,s);}
  addShiftOverride(t:string,s:string,input:{localDate:string;startMinute?:number|null;endMinute?:number|null;isOff?:boolean}){
    const localDate=isoDate(input.localDate),isOff=input.isOff??false;
    if(isOff)return this.repo.addShiftOverride(t,s,{localDate,startMinute:null,endMinute:null,isOff:true});
    if(input.startMinute===null||input.startMinute===undefined||input.endMinute===null||input.endMinute===undefined)throw new StaffScheduleValidationError('shift override requires startMinute and endMinute');
    const startMinute=minute(input.startMinute,'startMinute'),endMinute=minute(input.endMinute,'endMinute');if(startMinute>=endMinute)throw new StaffScheduleValidationError('shift override start must be before end');
    return this.repo.addShiftOverride(t,s,{localDate,startMinute,endMinute,isOff:false});
  }
  listShiftOverrides(t:string,s:string,from?:string,to?:string){return this.repo.listShiftOverrides(t,s,from?isoDate(from):undefined,to?isoDate(to):undefined);}
  addTimeBlock(t:string,s:string,input:{type:StaffTimeBlockType;startsAt:string|Date;endsAt:string|Date;reason?:string|null}){
    if(!['LEAVE','BLOCKED'].includes(input.type))throw new StaffScheduleValidationError('invalid time block type');
    const startsAt=new Date(input.startsAt),endsAt=new Date(input.endsAt);if(Number.isNaN(startsAt.valueOf())||Number.isNaN(endsAt.valueOf())||startsAt>=endsAt)throw new StaffScheduleValidationError('time block requires valid startsAt before endsAt');
    return this.repo.addTimeBlock(t,s,{type:input.type,startsAt,endsAt,reason:input.reason?.trim()||null});
  }
  listTimeBlocks(t:string,s:string,from?:string,to?:string){const f=from?new Date(from):undefined,tt=to?new Date(to):undefined;if(f&&Number.isNaN(f.valueOf()))throw new StaffScheduleValidationError('invalid from');if(tt&&Number.isNaN(tt.valueOf()))throw new StaffScheduleValidationError('invalid to');return this.repo.listTimeBlocks(t,s,f,tt);}
}
