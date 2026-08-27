import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceCatalog, ServiceValidationError, type Service, type ServiceCategory, type ServiceRepository } from './index.js';
class Repo implements ServiceRepository {
  categories:ServiceCategory[]=[];services:Service[]=[];
  async createCategory(t:string,i:any){const r:ServiceCategory={id:`cat${this.categories.length+1}`,tenantId:t,name:i.name,sortOrder:i.sortOrder??0,active:i.active??true,createdAt:new Date(),updatedAt:new Date()};this.categories.push(r);return r;}
  async listCategories(t:string,inc=false){return this.categories.filter(r=>r.tenantId===t&&(inc||r.active));}
  async updateCategory(t:string,id:string,i:any){const r=this.categories.find(x=>x.tenantId===t&&x.id===id);if(!r)return null;Object.assign(r,i,{updatedAt:new Date()});return r;}
  async createService(t:string,i:any){const r:Service={id:`svc${this.services.length+1}`,tenantId:t,categoryId:i.categoryId??null,name:i.name,description:i.description??null,durationMinutes:i.durationMinutes,bufferBeforeMinutes:i.bufferBeforeMinutes??0,bufferAfterMinutes:i.bufferAfterMinutes??0,priceMinor:i.priceMinor??0,currency:i.currency??'MYR',active:i.active??true,sortOrder:i.sortOrder??0,createdAt:new Date(),updatedAt:new Date()};this.services.push(r);return r;}
  async getService(t:string,id:string){return this.services.find(r=>r.tenantId===t&&r.id===id)??null;}
  async searchServices(t:string,q:any){return this.services.filter(r=>r.tenantId===t&&(q.active===undefined||r.active===q.active)&&(!q.categoryId||r.categoryId===q.categoryId)&&(!q.q||r.name.toLowerCase().includes(String(q.q).toLowerCase()))).slice(q.offset??0,(q.offset??0)+(q.limit??50));}
  async updateService(t:string,id:string,i:any){const r=await this.getService(t,id);if(!r)return null;Object.assign(r,i,{updatedAt:new Date()});return r;}
}
test('service catalog validates duration, buffers and MYR price',async()=>{const repo=new Repo(),svc=new ServiceCatalog(repo);const cat=await svc.createCategory('t1',{name:'Facial'});const row=await svc.createService('t1',{categoryId:cat.id,name:'Glow Facial',durationMinutes:60,bufferAfterMinutes:15,priceMinor:15000});assert.equal(row.currency,'MYR');assert.equal(row.bufferAfterMinutes,15);assert.throws(()=>svc.createService('t1',{name:'Bad',durationMinutes:0}),ServiceValidationError);});
test('service search is tenant scoped and active-aware',async()=>{const repo=new Repo(),svc=new ServiceCatalog(repo);const a=await svc.createService('ta',{name:'Massage',durationMinutes:60});await svc.createService('tb',{name:'Massage B',durationMinutes:60});await svc.updateService('ta',a.id,{active:false});assert.equal((await svc.searchServices('ta',{active:true})).length,0);assert.equal((await svc.searchServices('ta',{active:false})).length,1);});
