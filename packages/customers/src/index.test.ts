import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerService, CustomerValidationError, type Customer, type CustomerRepository } from './index.js';
class MemoryRepo implements CustomerRepository {
  rows:Customer[]=[];
  async create(tenantId:string,input:any){const row:Customer={id:`c${this.rows.length+1}`,tenantId,name:input.name??null,phone:input.phone??null,email:input.email??null,locale:input.locale,status:'ACTIVE',createdAt:new Date(),updatedAt:new Date()};this.rows.push(row);return row;}
  async getById(tenantId:string,id:string){return this.rows.find(r=>r.tenantId===tenantId&&r.id===id)??null;}
  async search(tenantId:string,{q='',limit=50,offset=0,includeArchived=false}:any){const term=String(q).toLowerCase();return this.rows.filter(r=>r.tenantId===tenantId&&(includeArchived||r.status!=='ARCHIVED')&&(!term||[r.name,r.phone,r.email].some(v=>v?.toLowerCase().includes(term)))).slice(offset,offset+limit);}
  async update(tenantId:string,id:string,input:any){const row=await this.getById(tenantId,id);if(!row)return null;Object.assign(row,input,{updatedAt:new Date()});return row;}
}
test('customer service always scopes by tenant',async()=>{const repo=new MemoryRepo(),svc=new CustomerService(repo);const a=await svc.create('ta',{name:'Aina',phone:'+60 12-345 6789'});await svc.create('tb',{name:'Aina B',phone:'+60 11-111 1111'});assert.equal(a.phone,'+60123456789');assert.equal((await svc.search('ta')).length,1);await assert.rejects(()=>svc.get('tb',a.id));});
test('customer requires at least one identity field',async()=>{const svc=new CustomerService(new MemoryRepo());assert.throws(()=>svc.create('ta',{}),CustomerValidationError);});
test('archive hides customer from normal search',async()=>{const repo=new MemoryRepo(),svc=new CustomerService(repo);const row=await svc.create('ta',{email:'A@Example.com'});await svc.archive('ta',row.id);assert.equal((await svc.search('ta')).length,0);assert.equal((await svc.search('ta',{includeArchived:true})).length,1);});
