export const RESOURCE_TYPES=['ROOM','PROPERTY','EQUIPMENT','CHAIR','BAY','VEHICLE','OTHER'] as const;
export type ResourceType=(typeof RESOURCE_TYPES)[number];
export type Resource={
  id:string;tenantId:string;name:string;type:ResourceType;capacity:number;active:boolean;sortOrder:number;
  description:string|null;createdAt:Date;updatedAt:Date;
};
export type CreateResourceInput={name:string;type:ResourceType;capacity?:number;active?:boolean;sortOrder?:number;description?:string|null};
export type UpdateResourceInput=Partial<CreateResourceInput>;
export type ResourceSearch={q?:string;type?:ResourceType;active?:boolean;serviceId?:string;limit?:number;offset?:number};
export interface ResourceRepository{
  create(tenantId:string,input:CreateResourceInput):Promise<Resource>;
  get(tenantId:string,id:string):Promise<Resource|null>;
  search(tenantId:string,query:ResourceSearch):Promise<Resource[]>;
  update(tenantId:string,id:string,input:UpdateResourceInput):Promise<Resource|null>;
  setServices(tenantId:string,resourceId:string,serviceIds:string[]):Promise<string[]>;
  getServices(tenantId:string,resourceId:string):Promise<string[]>;
  isCompatible(tenantId:string,resourceId:string,serviceId:string):Promise<boolean>;
}
export class ResourceValidationError extends Error{constructor(message:string){super(message);this.name='ResourceValidationError';}}
export class ResourceNotFoundError extends Error{constructor(){super('Resource not found');this.name='ResourceNotFoundError';}}
export class ResourceConflictError extends Error{constructor(message='Resource conflict'){super(message);this.name='ResourceConflictError';}}
function clean(v:string|null|undefined){const x=v?.trim();return x?x:null;}
function nameOf(v:string){const x=clean(v);if(!x)throw new ResourceValidationError('name is required');if(x.length>160)throw new ResourceValidationError('name is too long');return x;}
function typeOf(v:ResourceType){if(!RESOURCE_TYPES.includes(v))throw new ResourceValidationError('invalid resource type');return v;}
function capacityOf(v:number|undefined){const n=v??1;if(!Number.isInteger(n)||n<1||n>1000)throw new ResourceValidationError('capacity must be 1 to 1000');return n;}
function orderOf(v:number|undefined){const n=v??0;if(!Number.isInteger(n)||n<0)throw new ResourceValidationError('sortOrder must be non-negative');return n;}
export class ResourceDirectory{
  constructor(private readonly repo:ResourceRepository){}
  create(tenantId:string,input:CreateResourceInput){return this.repo.create(tenantId,{...input,name:nameOf(input.name),type:typeOf(input.type),capacity:capacityOf(input.capacity),active:input.active??true,sortOrder:orderOf(input.sortOrder),description:clean(input.description)});}
  async get(tenantId:string,id:string){const row=await this.repo.get(tenantId,id);if(!row)throw new ResourceNotFoundError();return row;}
  search(tenantId:string,query:ResourceSearch={}){if(query.type!==undefined)typeOf(query.type);return this.repo.search(tenantId,{...query,limit:Math.min(Math.max(query.limit??50,1),100),offset:Math.max(query.offset??0,0)});}
  async update(tenantId:string,id:string,input:UpdateResourceInput){const next={...input};if('name'in input&&input.name!==undefined)next.name=nameOf(input.name);if('type'in input&&input.type!==undefined)next.type=typeOf(input.type);if('capacity'in input)next.capacity=capacityOf(input.capacity);if('sortOrder'in input)next.sortOrder=orderOf(input.sortOrder);if('description'in input)next.description=clean(input.description);const row=await this.repo.update(tenantId,id,next);if(!row)throw new ResourceNotFoundError();return row;}
  async setServices(tenantId:string,id:string,serviceIds:string[]){await this.get(tenantId,id);return this.repo.setServices(tenantId,id,[...new Set(serviceIds)]);}
  async getServices(tenantId:string,id:string){await this.get(tenantId,id);return this.repo.getServices(tenantId,id);}
  async assertCompatible(tenantId:string,id:string,serviceId:string){if(!(await this.repo.isCompatible(tenantId,id,serviceId)))throw new ResourceConflictError('resource is not compatible with this service');return true;}
}
