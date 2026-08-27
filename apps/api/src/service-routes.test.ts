import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';
import type { Service, ServiceCategory, ServiceRepository } from '@wsadmin-business/services';
process.env.DATABASE_URL ??= 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
class Repo implements ServiceRepository {
  categories:ServiceCategory[]=[]; services:Service[]=[];
  async createCategory(t:string,i:any){const r:any={id:`cat${this.categories.length+1}`,tenantId:t,name:i.name,sortOrder:i.sortOrder??0,active:i.active??true,createdAt:new Date(),updatedAt:new Date()};this.categories.push(r);return r;}
  async listCategories(t:string,inc=false){return this.categories.filter(r=>r.tenantId===t&&(inc||r.active));}
  async updateCategory(t:string,id:string,i:any){const r=this.categories.find(x=>x.tenantId===t&&x.id===id);if(!r)return null;Object.assign(r,i);return r;}
  async createService(t:string,i:any){const r:any={id:`svc${this.services.length+1}`,tenantId:t,categoryId:i.categoryId??null,name:i.name,description:i.description??null,durationMinutes:i.durationMinutes,bufferBeforeMinutes:i.bufferBeforeMinutes??0,bufferAfterMinutes:i.bufferAfterMinutes??0,priceMinor:i.priceMinor??0,currency:i.currency??'MYR',active:i.active??true,sortOrder:i.sortOrder??0,createdAt:new Date(),updatedAt:new Date()};this.services.push(r);return r;}
  async getService(t:string,id:string){return this.services.find(r=>r.tenantId===t&&r.id===id)??null;}
  async searchServices(t:string,q:any){return this.services.filter(r=>r.tenantId===t&&(q.active===undefined||r.active===q.active)&&(!q.q||r.name.toLowerCase().includes(String(q.q).toLowerCase())));}
  async updateService(t:string,id:string,i:any){const r=await this.getService(t,id);if(!r)return null;Object.assign(r,i);return r;}
}
const h=(role='TENANT_OWNER',tenant='ta')=>({'x-wsadmin-role':role,'x-wsadmin-tenant-id':tenant});
test('service catalog CRUD validates operational fields',async()=>{
  const repo=new Repo(),app=buildApp({serviceRepository:repo});
  const cat=await app.inject({method:'POST',url:'/api/v1/tenants/ta/service-categories',headers:h(),payload:{name:'Facial'}});assert.equal(cat.statusCode,201);
  const svc=await app.inject({method:'POST',url:'/api/v1/tenants/ta/services',headers:h(),payload:{categoryId:cat.json().id,name:'Glow Facial',durationMinutes:60,bufferAfterMinutes:15,priceMinor:15000}});assert.equal(svc.statusCode,201);assert.equal(svc.json().currency,'MYR');
  const id=svc.json().id;assert.equal((await app.inject({method:'GET',url:'/api/v1/tenants/ta/services?q=glow',headers:h()})).json().length,1);
  assert.equal((await app.inject({method:'PATCH',url:`/api/v1/tenants/ta/services/${id}`,headers:h(),payload:{active:false}})).json().active,false);
  await app.close();
});
test('service API rejects invalid duration',async()=>{const app=buildApp({serviceRepository:new Repo()});const res=await app.inject({method:'POST',url:'/api/v1/tenants/ta/services',headers:h(),payload:{name:'Bad',durationMinutes:0}});assert.equal(res.statusCode,400);await app.close();});
test('staff cannot manage service catalog',async()=>{const app=buildApp({serviceRepository:new Repo()});const res=await app.inject({method:'POST',url:'/api/v1/tenants/ta/services',headers:h('STAFF'),payload:{name:'Massage',durationMinutes:60}});assert.equal(res.statusCode,403);await app.close();});
test('service reads are tenant scoped',async()=>{const repo=new Repo();await repo.createService('tb',{name:'Other',durationMinutes:30});const app=buildApp({serviceRepository:repo});const res=await app.inject({method:'GET',url:'/api/v1/tenants/tb/services',headers:h('STAFF','ta')});assert.equal(res.statusCode,403);await app.close();});
