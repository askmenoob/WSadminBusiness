import test from 'node:test';import assert from 'node:assert/strict';
import { AvailabilityEngine,type AvailabilityRepository } from './index.js';
class Repo implements AvailabilityRepository{
  staffBusy=0;resourceBusy=0;blocks:any[]=[];off=false;
  async getTenantTimezone(){return'Asia/Kuala_Lumpur';}
  async getService(){return{id:'svc',active:true,durationMinutes:60,bufferBeforeMinutes:15,bufferAfterMinutes:15};}
  async listEligibleStaff(){return[{id:'staff',active:true,bookingCapacity:1}];}
  async getWeeklyHours(){return[{weekday:1,startMinute:540,endMinute:1080}];}
  async getShiftOverrides(){return this.off?[{localDate:'2026-08-31',startMinute:null,endMinute:null,isOff:true}]:[];}
  async getTimeBlocks(){return this.blocks;}
  async listCompatibleResources(){return[{id:'room',active:true,capacity:1}];}
  async countBusyBookings(q:any){return q.staffId?this.staffBusy:this.resourceBusy;}
}
test('availability accepts eligible staff/resource within schedule',async()=>{const engine=new AvailabilityEngine(new Repo());const r=await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:00:00Z'});assert.equal(r.available,true);assert.equal(r.candidates[0]?.staffId,'staff');assert.equal(r.candidates[0]?.resourceId,'room');});
test('availability rejects staff leave and booking capacity',async()=>{const repo=new Repo(),engine=new AvailabilityEngine(repo);repo.blocks=[{startsAt:new Date('2026-08-31T01:00:00Z'),endsAt:new Date('2026-08-31T04:00:00Z')}];assert.equal((await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:00:00Z'})).available,false);repo.blocks=[];repo.staffBusy=1;assert.equal((await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:00:00Z'})).available,false);});
test('availability rejects resource capacity and off-day override',async()=>{const repo=new Repo(),engine=new AvailabilityEngine(repo);repo.resourceBusy=1;assert.equal((await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:00:00Z'})).available,false);repo.resourceBusy=0;repo.off=true;assert.equal((await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:00:00Z'})).available,false);});
