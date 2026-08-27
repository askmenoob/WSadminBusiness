import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';
import type { Customer, CustomerRepository } from '@wsadmin-business/customers';
process.env.DATABASE_URL ??= 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
class Repo implements CustomerRepository {
  rows:Customer[]=[];
  async create(tenantId:string,input:any){const row:Customer={id:`c${this.rows.length+1}`,tenantId,name:input.name??null,phone:input.phone??null,email:input.email??null,locale:input.locale,status:'ACTIVE',createdAt:new Date(),updatedAt:new Date()};this.rows.push(row);return row;}
  async getById(t:string,id:string){return this.rows.find(r=>r.tenantId===t&&r.id===id)??null;}
  async search(t:string,{q='',includeArchived=false}:any){const term=String(q).toLowerCase();return this.rows.filter(r=>r.tenantId===t&&(includeArchived||r.status==='ACTIVE')&&(!term||[r.name,r.phone,r.email].some(v=>v?.toLowerCase().includes(term))));}
  async update(t:string,id:string,input:any){const row=await this.getById(t,id);if(!row)return null;Object.assign(row,input,{updatedAt:new Date()});return row;}
}
const h=(role='TENANT_OWNER',tenant='tenant-a')=>({'x-wsadmin-role':role,'x-wsadmin-tenant-id':tenant});
test('customer CRUD is tenant scoped',async()=>{
  const repo=new Repo(),app=buildApp({customerRepository:repo});
  const created=await app.inject({method:'POST',url:'/api/v1/tenants/tenant-a/customers',headers:h(),payload:{name:'Aina',phone:'+60 12-345 6789'}});
  assert.equal(created.statusCode,201);const id=created.json().id;
  assert.equal((await app.inject({method:'GET',url:'/api/v1/tenants/tenant-a/customers?q=ain',headers:h()})).json().length,1);
  assert.equal((await app.inject({method:'GET',url:`/api/v1/tenants/tenant-a/customers/${id}`,headers:h()})).statusCode,200);
  assert.equal((await app.inject({method:'PATCH',url:`/api/v1/tenants/tenant-a/customers/${id}`,headers:h(),payload:{name:'Aina Updated'}})).json().name,'Aina Updated');
  assert.equal((await app.inject({method:'DELETE',url:`/api/v1/tenants/tenant-a/customers/${id}`,headers:h()})).statusCode,204);
  assert.equal((await app.inject({method:'GET',url:'/api/v1/tenants/tenant-a/customers',headers:h()})).json().length,0);
  await app.close();
});
test('customer API blocks cross tenant access',async()=>{const app=buildApp({customerRepository:new Repo()});const res=await app.inject({method:'GET',url:'/api/v1/tenants/tenant-b/customers',headers:h('STAFF','tenant-a')});assert.equal(res.statusCode,403);await app.close();});
test('viewer cannot mutate customers',async()=>{const app=buildApp({customerRepository:new Repo()});const res=await app.inject({method:'POST',url:'/api/v1/tenants/tenant-a/customers',headers:h('VIEWER'),payload:{name:'A'}});assert.equal(res.statusCode,403);await app.close();});
