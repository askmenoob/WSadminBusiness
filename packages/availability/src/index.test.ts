import test from 'node:test';import assert from 'node:assert/strict';
import { AvailabilityEngine,type AvailabilityRepository } from './index.js';
import { DEFAULT_BOOKING_POLICY } from '@wsadmin-business/booking-policy';
class Repo implements AvailabilityRepository{
  staffBusy=0;resourceBusy=0;blocks:any[]=[];controlBlocks:any[]=[];off=false;policy={...DEFAULT_BOOKING_POLICY,minimumLeadMinutes:0,bookingHorizonDays:365};
  async getTenantTimezone(){return'Asia/Kuala_Lumpur';}
  async getBookingPolicy(){return this.policy;}
  async getService(){return{id:'svc',active:true,durationMinutes:60,bufferBeforeMinutes:15,bufferAfterMinutes:15};}
  async listEligibleStaff(){return[{id:'staff',active:true,bookingCapacity:1,sortOrder:0,displayName:'Aina',photoUrl:'https://example.test/aina.jpg'}];}
  async getWeeklyHours(){return[{weekday:1,startMinute:540,endMinute:1080}];}
  async getShiftOverrides(){return this.off?[{localDate:'2026-08-31',startMinute:null,endMinute:null,isOff:true}]:[];}
  async getTimeBlocks(){return this.blocks;}async getCalendarBlocks(){return this.controlBlocks;}
  async listCompatibleResources(){return[{id:'room',active:true,capacity:1}];}
  async countBusyBookings(q:any){return q.staffId?this.staffBusy:this.resourceBusy;}
}
test('availability accepts eligible staff/resource within schedule',async()=>{const engine=new AvailabilityEngine(new Repo(),()=>new Date('2026-08-28T00:00:00Z'));const r=await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:00:00Z'});assert.equal(r.available,true);assert.equal(r.candidates[0]?.staffId,'staff');assert.equal(r.candidates[0]?.resourceId,'room');});
test('availability rejects staff leave and booking capacity',async()=>{const repo=new Repo(),engine=new AvailabilityEngine(repo,()=>new Date('2026-08-28T00:00:00Z'));repo.blocks=[{startsAt:new Date('2026-08-31T01:00:00Z'),endsAt:new Date('2026-08-31T04:00:00Z')}];assert.equal((await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:00:00Z'})).available,false);repo.blocks=[];repo.staffBusy=1;assert.equal((await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:00:00Z'})).available,false);});
test('availability rejects resource capacity and off-day override',async()=>{const repo=new Repo(),engine=new AvailabilityEngine(repo,()=>new Date('2026-08-28T00:00:00Z'));repo.resourceBusy=1;assert.equal((await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:00:00Z'})).available,false);repo.resourceBusy=0;repo.off=true;assert.equal((await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:00:00Z'})).available,false);});

test('availability enforces tenant booking policy',async()=>{const repo=new Repo();repo.policy={...repo.policy,slotIntervalMinutes:30,minimumLeadMinutes:120};const engine=new AvailabilityEngine(repo,()=>new Date('2026-08-28T00:00:00Z'));const bad=await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:15:00Z'});assert.equal(bad.reason,'policy_slot_interval');const good=await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:30:00Z'});assert.equal(good.available,true);});
test('availability rejects generic calendar stop-sale blocks',async()=>{const repo=new Repo(),engine=new AvailabilityEngine(repo,()=>new Date('2026-08-28T00:00:00Z'));repo.controlBlocks=[{type:'STOP_SALE',startsAt:new Date('2026-08-31T01:30:00Z'),endsAt:new Date('2026-08-31T03:30:00Z')}];const r=await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:00:00Z'});assert.equal(r.available,false);assert.equal(r.reason,'no_capacity');});

test('availability candidate exposes staff allocation metadata',async()=>{const engine=new AvailabilityEngine(new Repo(),()=>new Date('2026-08-28T00:00:00Z'));const r=await engine.check({tenantId:'t',serviceId:'svc',startsAt:'2026-08-31T02:00:00Z'});assert.equal(r.candidates[0]?.staffDisplayName,'Aina');assert.equal(r.candidates[0]?.staffPhotoUrl,'https://example.test/aina.jpg');assert.equal(r.candidates[0]?.staffSortOrder,0);assert.equal(r.candidates[0]?.staffCapacity,1);});
