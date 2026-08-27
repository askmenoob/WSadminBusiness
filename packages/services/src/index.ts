export type ServiceCategory = {
  id:string; tenantId:string; name:string; sortOrder:number; active:boolean; createdAt:Date; updatedAt:Date;
};
export type Service = {
  id:string; tenantId:string; categoryId:string|null; name:string; description:string|null;
  durationMinutes:number; bufferBeforeMinutes:number; bufferAfterMinutes:number;
  priceMinor:number; currency:string; active:boolean; sortOrder:number; createdAt:Date; updatedAt:Date;
};
export type CreateCategoryInput={name:string;sortOrder?:number;active?:boolean};
export type UpdateCategoryInput=Partial<CreateCategoryInput>;
export type CreateServiceInput={categoryId?:string|null;name:string;description?:string|null;durationMinutes:number;bufferBeforeMinutes?:number;bufferAfterMinutes?:number;priceMinor?:number;currency?:string;active?:boolean;sortOrder?:number};
export type UpdateServiceInput=Partial<CreateServiceInput>;
export type ServiceSearch={q?:string;active?:boolean;categoryId?:string;limit?:number;offset?:number};
export interface ServiceRepository {
  createCategory(tenantId:string,input:CreateCategoryInput):Promise<ServiceCategory>;
  listCategories(tenantId:string,includeInactive?:boolean):Promise<ServiceCategory[]>;
  updateCategory(tenantId:string,id:string,input:UpdateCategoryInput):Promise<ServiceCategory|null>;
  createService(tenantId:string,input:CreateServiceInput):Promise<Service>;
  getService(tenantId:string,id:string):Promise<Service|null>;
  searchServices(tenantId:string,query:ServiceSearch):Promise<Service[]>;
  updateService(tenantId:string,id:string,input:UpdateServiceInput):Promise<Service|null>;
}
export class ServiceValidationError extends Error{constructor(message:string){super(message);this.name='ServiceValidationError';}}
export class ServiceNotFoundError extends Error{constructor(){super('Service not found');this.name='ServiceNotFoundError';}}
export class ServiceConflictError extends Error{constructor(message='Service conflict'){super(message);this.name='ServiceConflictError';}}
function nameOf(value:string){const v=value?.trim();if(!v)throw new ServiceValidationError('name is required');if(v.length>160)throw new ServiceValidationError('name is too long');return v;}
function nonNegativeInt(value:number|undefined,name:string,defaultValue=0){const v=value??defaultValue;if(!Number.isInteger(v)||v<0)throw new ServiceValidationError(`${name} must be a non-negative integer`);return v;}
function positiveInt(value:number,name:string){if(!Number.isInteger(value)||value<=0)throw new ServiceValidationError(`${name} must be a positive integer`);return value;}
function currencyOf(value:string|undefined){const v=(value??'MYR').trim().toUpperCase();if(!/^[A-Z]{3}$/.test(v))throw new ServiceValidationError('currency must be ISO 4217 code');return v;}
function normalizeCreate(input:CreateServiceInput):CreateServiceInput{return{...input,name:nameOf(input.name),description:input.description?.trim()||null,durationMinutes:positiveInt(input.durationMinutes,'durationMinutes'),bufferBeforeMinutes:nonNegativeInt(input.bufferBeforeMinutes,'bufferBeforeMinutes'),bufferAfterMinutes:nonNegativeInt(input.bufferAfterMinutes,'bufferAfterMinutes'),priceMinor:nonNegativeInt(input.priceMinor,'priceMinor'),currency:currencyOf(input.currency),active:input.active??true,sortOrder:nonNegativeInt(input.sortOrder,'sortOrder')};}
function normalizeCategory(input:CreateCategoryInput):CreateCategoryInput{return{name:nameOf(input.name),sortOrder:nonNegativeInt(input.sortOrder,'sortOrder'),active:input.active??true};}
export class ServiceCatalog {
  constructor(private readonly repo:ServiceRepository){}
  createCategory(tenantId:string,input:CreateCategoryInput){return this.repo.createCategory(tenantId,normalizeCategory(input));}
  listCategories(tenantId:string,includeInactive=false){return this.repo.listCategories(tenantId,includeInactive);}
  async updateCategory(tenantId:string,id:string,input:UpdateCategoryInput){const next={...input};if('name'in input&&input.name!==undefined)next.name=nameOf(input.name);if('sortOrder'in input)next.sortOrder=nonNegativeInt(input.sortOrder,'sortOrder');const row=await this.repo.updateCategory(tenantId,id,next);if(!row)throw new ServiceNotFoundError();return row;}
  createService(tenantId:string,input:CreateServiceInput){return this.repo.createService(tenantId,normalizeCreate(input));}
  async getService(tenantId:string,id:string){const row=await this.repo.getService(tenantId,id);if(!row)throw new ServiceNotFoundError();return row;}
  searchServices(tenantId:string,query:ServiceSearch={}){return this.repo.searchServices(tenantId,{...query,limit:Math.min(Math.max(query.limit??50,1),100),offset:Math.max(query.offset??0,0)});}
  async updateService(tenantId:string,id:string,input:UpdateServiceInput){
    const next={...input};
    if('name'in input&&input.name!==undefined)next.name=nameOf(input.name);
    if('durationMinutes'in input&&input.durationMinutes!==undefined)next.durationMinutes=positiveInt(input.durationMinutes,'durationMinutes');
    if('bufferBeforeMinutes'in input)next.bufferBeforeMinutes=nonNegativeInt(input.bufferBeforeMinutes,'bufferBeforeMinutes');
    if('bufferAfterMinutes'in input)next.bufferAfterMinutes=nonNegativeInt(input.bufferAfterMinutes,'bufferAfterMinutes');
    if('priceMinor'in input)next.priceMinor=nonNegativeInt(input.priceMinor,'priceMinor');
    if('currency'in input)next.currency=currencyOf(input.currency);
    if('sortOrder'in input)next.sortOrder=nonNegativeInt(input.sortOrder,'sortOrder');
    if('description'in input)next.description=input.description?.trim()||null;
    const row=await this.repo.updateService(tenantId,id,next);if(!row)throw new ServiceNotFoundError();return row;
  }
}
export * from './options.js';
