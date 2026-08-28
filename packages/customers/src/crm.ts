export type CustomerTag={id:string;tenantId:string;name:string;createdAt:Date};
export type CustomerNote={id:string;tenantId:string;customerId:string;actorUserId:string|null;note:string;createdAt:Date;updatedAt:Date};
export type CustomFieldDefinition={id:string;tenantId:string;key:string;label:string;fieldType:'TEXT'|'NUMBER'|'BOOLEAN'|'DATE'|'JSON';active:boolean;sortOrder:number;createdAt:Date;updatedAt:Date};
export type CustomerCustomFieldValue={definitionId:string;key:string;label:string;fieldType:CustomFieldDefinition['fieldType'];value:unknown;updatedAt:Date};
export type CustomerTimelineItem={id:string;type:string;sourceType:string;sourceId:string|null;title:string;detail:Record<string,unknown>;occurredAt:Date};
export type CustomerCrmProfile={tags:CustomerTag[];notes:CustomerNote[];customFields:CustomerCustomFieldValue[];timeline:CustomerTimelineItem[]};
export interface CustomerCrmRepository{
 createTag(tenantId:string,name:string):Promise<CustomerTag>;listTags(tenantId:string):Promise<CustomerTag[]>;setCustomerTags(tenantId:string,customerId:string,tagIds:string[]):Promise<CustomerTag[]>;
 addNote(tenantId:string,customerId:string,actorUserId:string|null,note:string):Promise<CustomerNote>;listNotes(tenantId:string,customerId:string,limit:number):Promise<CustomerNote[]>;
 createField(tenantId:string,input:{key:string;label:string;fieldType:CustomFieldDefinition['fieldType'];active?:boolean;sortOrder?:number}):Promise<CustomFieldDefinition>;listFields(tenantId:string,includeInactive?:boolean):Promise<CustomFieldDefinition[]>;setFieldValue(tenantId:string,customerId:string,definitionId:string,value:unknown):Promise<CustomerCustomFieldValue>;
 timeline(tenantId:string,customerId:string,limit:number,offset:number):Promise<CustomerTimelineItem[]>;profile(tenantId:string,customerId:string):Promise<CustomerCrmProfile>;recordEvent(tenantId:string,customerId:string,input:{eventType:string;sourceType:string;sourceId?:string|null;title:string;detail?:Record<string,unknown>;occurredAt?:Date}):Promise<CustomerTimelineItem>;
}
export class CustomerCrmValidationError extends Error{constructor(message:string){super(message);this.name='CustomerCrmValidationError';}}
function text(v:unknown,name:string,max=500){if(typeof v!=='string'||!v.trim())throw new CustomerCrmValidationError(`${name} is required`);return v.trim().slice(0,max);}
function fieldKey(v:string){const x=v.trim().toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'');if(!x||x.length>80)throw new CustomerCrmValidationError('invalid field key');return x;}
export class CustomerCrmService{
 constructor(private readonly repo:CustomerCrmRepository){}
 createTag(t:string,name:string){return this.repo.createTag(t,text(name,'tag name',100));}
 listTags(t:string){return this.repo.listTags(t);}
 setTags(t:string,c:string,ids:string[]){return this.repo.setCustomerTags(t,c,[...new Set(ids)].slice(0,100));}
 addNote(t:string,c:string,actor:string|null,note:string){return this.repo.addNote(t,c,actor,text(note,'note',4000));}
 listNotes(t:string,c:string,l=50){return this.repo.listNotes(t,c,Math.min(Math.max(l,1),100));}
 createField(t:string,i:{key:string;label:string;fieldType:CustomFieldDefinition['fieldType'];active?:boolean;sortOrder?:number}){if(!['TEXT','NUMBER','BOOLEAN','DATE','JSON'].includes(i.fieldType))throw new CustomerCrmValidationError('invalid field type');return this.repo.createField(t,{...i,key:fieldKey(i.key),label:text(i.label,'label',160),active:i.active??true,sortOrder:Math.max(0,Math.trunc(i.sortOrder??0))});}
 listFields(t:string,inc=false){return this.repo.listFields(t,inc);}
 setField(t:string,c:string,d:string,value:unknown){return this.repo.setFieldValue(t,c,d,value);}
 timeline(t:string,c:string,l=100,o=0){return this.repo.timeline(t,c,Math.min(Math.max(l,1),200),Math.max(o,0));}
 profile(t:string,c:string){return this.repo.profile(t,c);}
 recordEvent(t:string,c:string,i:{eventType:string;sourceType:string;sourceId?:string|null;title:string;detail?:Record<string,unknown>;occurredAt?:Date}){return this.repo.recordEvent(t,c,{...i,eventType:text(i.eventType,'event type',80),sourceType:text(i.sourceType,'source type',80),title:text(i.title,'title',240)});}
}
