export type Location={id:string;tenantId:string;businessId:string;name:string;code:string;timezone:string|null;address:string|null;active:boolean;sortOrder:number;createdAt:Date;updatedAt:Date};
export type CreateLocationInput={businessId?:string;name:string;code:string;timezone?:string|null;address?:string|null;active?:boolean;sortOrder?:number};
export type UpdateLocationInput=Partial<Omit<CreateLocationInput,'businessId'>>;
export interface LocationRepository{
 create(tenantId:string,input:CreateLocationInput):Promise<Location>;
 get(tenantId:string,id:string):Promise<Location|null>;
 list(tenantId:string,includeInactive?:boolean):Promise<Location[]>;
 update(tenantId:string,id:string,input:UpdateLocationInput):Promise<Location|null>;
 setStaff(tenantId:string,locationId:string,staffIds:string[]):Promise<string[]>;
 setServices(tenantId:string,locationId:string,serviceIds:string[]):Promise<string[]>;
 getStaff(tenantId:string,locationId:string):Promise<string[]>;
 getServices(tenantId:string,locationId:string):Promise<string[]>;
}
export class LocationValidationError extends Error{constructor(message:string){super(message);this.name='LocationValidationError';}}
export class LocationNotFoundError extends Error{constructor(){super('Location not found');this.name='LocationNotFoundError';}}
function text(v:string|null|undefined){const x=v?.trim();return x?x:null;}
function nameOf(v:string){const x=text(v);if(!x)throw new LocationValidationError('name is required');if(x.length>160)throw new LocationValidationError('name too long');return x;}
function codeOf(v:string){const x=text(v)?.toUpperCase();if(!x||!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(x))throw new LocationValidationError('code must be 2-32 letters/numbers/_/-');return x;}
function timezoneOf(v:string|null|undefined){const x=text(v);if(!x)return null;try{new Intl.DateTimeFormat('en-US',{timeZone:x}).format(new Date());}catch{throw new LocationValidationError('invalid timezone');}return x;}
function order(v:number|undefined){const n=v??0;if(!Number.isInteger(n)||n<0)throw new LocationValidationError('sortOrder must be non-negative');return n;}
export class LocationDirectory{
 constructor(private readonly repo:LocationRepository){}
 create(t:string,i:CreateLocationInput){return this.repo.create(t,{...i,businessId:text(i.businessId)??undefined,name:nameOf(i.name),code:codeOf(i.code),timezone:timezoneOf(i.timezone),address:text(i.address),active:i.active??true,sortOrder:order(i.sortOrder)});}
 async get(t:string,id:string){const r=await this.repo.get(t,id);if(!r)throw new LocationNotFoundError();return r;}
 list(t:string,inc=false){return this.repo.list(t,inc);}
 async update(t:string,id:string,i:UpdateLocationInput){const next={...i};if('name'in i&&i.name!==undefined)next.name=nameOf(i.name);if('code'in i&&i.code!==undefined)next.code=codeOf(i.code);if('timezone'in i)next.timezone=timezoneOf(i.timezone);if('address'in i)next.address=text(i.address);if('sortOrder'in i)next.sortOrder=order(i.sortOrder);const r=await this.repo.update(t,id,next);if(!r)throw new LocationNotFoundError();return r;}
 async setStaff(t:string,id:string,ids:string[]){await this.get(t,id);return this.repo.setStaff(t,id,[...new Set(ids)]);}
 async setServices(t:string,id:string,ids:string[]){await this.get(t,id);return this.repo.setServices(t,id,[...new Set(ids)]);}
 async assignments(t:string,id:string){await this.get(t,id);return{staffIds:await this.repo.getStaff(t,id),serviceIds:await this.repo.getServices(t,id)};}
}
