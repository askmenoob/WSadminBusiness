export type OptionSelectionMode='SINGLE'|'MULTIPLE';
export type ServiceOptionGroup={id:string;tenantId:string;serviceId:string;name:string;selectionMode:OptionSelectionMode;required:boolean;active:boolean;sortOrder:number;createdAt:Date;updatedAt:Date};
export type ServiceOption={id:string;tenantId:string;groupId:string;name:string;durationDeltaMinutes:number;priceDeltaMinor:number;requiredResourceType:string|null;active:boolean;sortOrder:number;createdAt:Date;updatedAt:Date};
export type CreateOptionGroupInput={name:string;selectionMode?:OptionSelectionMode;required?:boolean;active?:boolean;sortOrder?:number};
export type CreateServiceOptionInput={name:string;durationDeltaMinutes?:number;priceDeltaMinor?:number;requiredResourceType?:string|null;active?:boolean;sortOrder?:number};
export type UpdateServiceOptionInput=Partial<CreateServiceOptionInput>;
export interface ServiceOptionRepository{
 createGroup(tenantId:string,serviceId:string,input:CreateOptionGroupInput):Promise<ServiceOptionGroup>;
 listGroups(tenantId:string,serviceId:string,includeInactive?:boolean):Promise<ServiceOptionGroup[]>;
 createOption(tenantId:string,groupId:string,input:CreateServiceOptionInput):Promise<ServiceOption>;
 updateOption(tenantId:string,optionId:string,input:UpdateServiceOptionInput):Promise<ServiceOption|null>;
 listOptions(tenantId:string,serviceId:string,includeInactive?:boolean):Promise<ServiceOption[]>;
}
export class ServiceOptionValidationError extends Error{constructor(message:string){super(message);this.name='ServiceOptionValidationError';}}
function cleanName(v:string){const x=v?.trim();if(!x)throw new ServiceOptionValidationError('name is required');if(x.length>160)throw new ServiceOptionValidationError('name is too long');return x;}
function nonNegative(v:number|undefined,name:string,max=100000000){const n=v??0;if(!Number.isInteger(n)||n<0||n>max)throw new ServiceOptionValidationError(`${name} must be a valid non-negative integer`);return n;}
function mode(v:OptionSelectionMode|undefined){const x=v??'SINGLE';if(!['SINGLE','MULTIPLE'].includes(x))throw new ServiceOptionValidationError('invalid selectionMode');return x;}
export type ResolvedOptionSelection={optionIds:string[];durationDeltaMinutes:number;priceDeltaMinor:number;requiredResourceType:string|null};
export function resolveOptionSelection(groups:ServiceOptionGroup[],options:ServiceOption[],selectedIds:string[]):ResolvedOptionSelection{
 const ids=[...new Set(selectedIds??[])];const activeGroups=groups.filter(g=>g.active);const activeOptions=options.filter(o=>o.active);const selected=ids.map(id=>activeOptions.find(o=>o.id===id));
 if(selected.some(x=>!x))throw new ServiceOptionValidationError('selected option is unavailable');
 for(const group of activeGroups){const count=selected.filter(o=>o?.groupId===group.id).length;if(group.required&&count===0)throw new ServiceOptionValidationError(`option group ${group.name} requires a selection`);if(group.selectionMode==='SINGLE'&&count>1)throw new ServiceOptionValidationError(`option group ${group.name} allows one selection`);}
 const types=[...new Set(selected.map(o=>o?.requiredResourceType).filter((x):x is string=>Boolean(x)))];if(types.length>1)throw new ServiceOptionValidationError('selected options require conflicting resource types');
 return{optionIds:ids,durationDeltaMinutes:selected.reduce((n,o)=>n+(o?.durationDeltaMinutes??0),0),priceDeltaMinor:selected.reduce((n,o)=>n+(o?.priceDeltaMinor??0),0),requiredResourceType:types[0]??null};
}
export class ServiceOptions{
 constructor(private readonly repo:ServiceOptionRepository){}
 createGroup(t:string,s:string,i:CreateOptionGroupInput){return this.repo.createGroup(t,s,{...i,name:cleanName(i.name),selectionMode:mode(i.selectionMode),required:i.required??false,active:i.active??true,sortOrder:nonNegative(i.sortOrder,'sortOrder')});}
 listGroups(t:string,s:string,includeInactive=false){return this.repo.listGroups(t,s,includeInactive);}
 createOption(t:string,g:string,i:CreateServiceOptionInput){return this.repo.createOption(t,g,{...i,name:cleanName(i.name),durationDeltaMinutes:nonNegative(i.durationDeltaMinutes,'durationDeltaMinutes',1440),priceDeltaMinor:nonNegative(i.priceDeltaMinor,'priceDeltaMinor'),requiredResourceType:i.requiredResourceType?.trim().toUpperCase()||null,active:i.active??true,sortOrder:nonNegative(i.sortOrder,'sortOrder')});}
 async updateOption(t:string,id:string,i:UpdateServiceOptionInput){const next={...i};if('name'in i&&i.name!==undefined)next.name=cleanName(i.name);if('durationDeltaMinutes'in i)next.durationDeltaMinutes=nonNegative(i.durationDeltaMinutes,'durationDeltaMinutes',1440);if('priceDeltaMinor'in i)next.priceDeltaMinor=nonNegative(i.priceDeltaMinor,'priceDeltaMinor');if('requiredResourceType'in i)next.requiredResourceType=i.requiredResourceType?.trim().toUpperCase()||null;if('sortOrder'in i)next.sortOrder=nonNegative(i.sortOrder,'sortOrder');const row=await this.repo.updateOption(t,id,next);if(!row)throw new ServiceOptionValidationError('option not found');return row;}
 listOptions(t:string,s:string,includeInactive=false){return this.repo.listOptions(t,s,includeInactive);}
}
