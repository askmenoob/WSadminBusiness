export type CustomerRestrictionState={customerId:string;blacklisted:boolean;reason:string|null;blacklistedAt:Date|null;mergedIntoCustomerId:string|null;mergedAt:Date|null};
export type CustomerMergeResult={sourceCustomerId:string;targetCustomerId:string;moved:{bookings:number;conversations:number;notes:number;events:number;tags:number;customFields:number};mergedAt:Date};
export interface CustomerControlRepository{
 getRestriction(tenantId:string,customerId:string):Promise<CustomerRestrictionState|null>;
 setBlacklist(tenantId:string,customerId:string,input:{blacklisted:boolean;reason:string|null;actorUserId:string|null}):Promise<CustomerRestrictionState|null>;
 merge(tenantId:string,targetCustomerId:string,sourceCustomerId:string,actorUserId:string|null):Promise<CustomerMergeResult>;
}
export class CustomerControlError extends Error{constructor(message:string,public readonly code='customer_control_error'){super(message);this.name='CustomerControlError';}}
function reasonOf(v:unknown){if(v===null||v===undefined)return null;if(typeof v!=='string')throw new CustomerControlError('reason must be text','validation');const x=v.trim();return x?x.slice(0,500):null;}
export class CustomerControlService{
 constructor(private readonly repo:CustomerControlRepository){}
 async get(t:string,c:string){const r=await this.repo.getRestriction(t,c);if(!r)throw new CustomerControlError('Customer not found','not_found');return r;}
 async blacklist(t:string,c:string,input:{blacklisted:boolean;reason?:string|null;actorUserId?:string|null}){if(typeof input.blacklisted!=='boolean')throw new CustomerControlError('blacklisted must be boolean','validation');const r=await this.repo.setBlacklist(t,c,{blacklisted:input.blacklisted,reason:reasonOf(input.reason),actorUserId:input.actorUserId??null});if(!r)throw new CustomerControlError('Customer not found','not_found');return r;}
 async merge(t:string,target:string,source:string,actor:string|null){if(!target||!source||target===source)throw new CustomerControlError('source and target customers must differ','validation');try{return await this.repo.merge(t,target,source,actor);}catch(e){if(e instanceof CustomerControlError)throw e;if(e instanceof Error&&e.message==='customer_not_found')throw new CustomerControlError('Customer not found','not_found');if(e instanceof Error&&e.message==='customer_already_merged')throw new CustomerControlError('Source customer already merged','conflict');throw e;}}
}
