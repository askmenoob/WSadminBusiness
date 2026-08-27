export type StaffProfile={
  id:string;tenantId:string;userId:string|null;displayName:string;phone:string|null;email:string|null;
  photoUrl:string|null;active:boolean;bookingCapacity:number;sortOrder:number;createdAt:Date;updatedAt:Date;
};
export type Skill={id:string;tenantId:string;name:string;createdAt:Date};
export type CreateStaffInput={userId?:string|null;displayName:string;phone?:string|null;email?:string|null;photoUrl?:string|null;active?:boolean;bookingCapacity?:number;sortOrder?:number};
export type UpdateStaffInput=Partial<CreateStaffInput>;
export interface StaffRepository{
  createStaff(tenantId:string,input:CreateStaffInput):Promise<StaffProfile>;
  getStaff(tenantId:string,id:string):Promise<StaffProfile|null>;
  listStaff(tenantId:string,includeInactive?:boolean):Promise<StaffProfile[]>;
  updateStaff(tenantId:string,id:string,input:UpdateStaffInput):Promise<StaffProfile|null>;
  createSkill(tenantId:string,name:string):Promise<Skill>;
  listSkills(tenantId:string):Promise<Skill[]>;
  setStaffSkills(tenantId:string,staffId:string,skillIds:string[]):Promise<string[]>;
  setStaffServices(tenantId:string,staffId:string,serviceIds:string[]):Promise<string[]>;
  getStaffServices(tenantId:string,staffId:string):Promise<string[]>;
  isEligibleForService(tenantId:string,staffId:string,serviceId:string):Promise<boolean>;
}
export class StaffValidationError extends Error{constructor(message:string){super(message);this.name='StaffValidationError';}}
export class StaffNotFoundError extends Error{constructor(){super('Staff not found');this.name='StaffNotFoundError';}}
export class StaffConflictError extends Error{constructor(message='Staff conflict'){super(message);this.name='StaffConflictError';}}
function text(v:string|null|undefined){const x=v?.trim();return x?x:null;}
function name(v:string){const x=text(v);if(!x)throw new StaffValidationError('displayName is required');if(x.length>160)throw new StaffValidationError('displayName is too long');return x;}
function capacity(v:number|undefined){const n=v??1;if(!Number.isInteger(n)||n<1||n>20)throw new StaffValidationError('bookingCapacity must be 1 to 20');return n;}
function order(v:number|undefined){const n=v??0;if(!Number.isInteger(n)||n<0)throw new StaffValidationError('sortOrder must be non-negative');return n;}
export class StaffDirectory{
  constructor(private readonly repo:StaffRepository){}
  createStaff(tenantId:string,input:CreateStaffInput){return this.repo.createStaff(tenantId,{...input,displayName:name(input.displayName),phone:text(input.phone),email:text(input.email)?.toLowerCase()??null,photoUrl:text(input.photoUrl),bookingCapacity:capacity(input.bookingCapacity),sortOrder:order(input.sortOrder),active:input.active??true});}
  async getStaff(tenantId:string,id:string){const r=await this.repo.getStaff(tenantId,id);if(!r)throw new StaffNotFoundError();return r;}
  listStaff(tenantId:string,includeInactive=false){return this.repo.listStaff(tenantId,includeInactive);}
  async updateStaff(tenantId:string,id:string,input:UpdateStaffInput){const next={...input};if('displayName'in input&&input.displayName!==undefined)next.displayName=name(input.displayName);if('phone'in input)next.phone=text(input.phone);if('email'in input)next.email=text(input.email)?.toLowerCase()??null;if('photoUrl'in input)next.photoUrl=text(input.photoUrl);if('bookingCapacity'in input)next.bookingCapacity=capacity(input.bookingCapacity);if('sortOrder'in input)next.sortOrder=order(input.sortOrder);const r=await this.repo.updateStaff(tenantId,id,next);if(!r)throw new StaffNotFoundError();return r;}
  createSkill(tenantId:string,nameValue:string){const n=text(nameValue);if(!n)throw new StaffValidationError('skill name is required');return this.repo.createSkill(tenantId,n);}
  listSkills(tenantId:string){return this.repo.listSkills(tenantId);}
  async setSkills(tenantId:string,staffId:string,skillIds:string[]){await this.getStaff(tenantId,staffId);return this.repo.setStaffSkills(tenantId,staffId,[...new Set(skillIds)]);}
  async setServices(tenantId:string,staffId:string,serviceIds:string[]){await this.getStaff(tenantId,staffId);return this.repo.setStaffServices(tenantId,staffId,[...new Set(serviceIds)]);}
  async assertEligible(tenantId:string,staffId:string,serviceId:string){if(!(await this.repo.isEligibleForService(tenantId,staffId,serviceId)))throw new StaffConflictError('staff is not assigned to this service');return true;}
}
