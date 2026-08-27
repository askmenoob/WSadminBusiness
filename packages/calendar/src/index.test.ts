import test from 'node:test';import assert from 'node:assert/strict';
import { CalendarService,CalendarValidationError,type CalendarRepository } from './index.js';
class Repo implements CalendarRepository{async snapshot(t:string,v:any,f:Date,to:Date){return{tenantId:t,view:v,from:f,to,rows:[],bookings:[],blocks:[]};}}
test('calendar supports day/week staff or resource views',async()=>{const svc=new CalendarService(new Repo());const staff=await svc.get('t',{view:'staff',from:'2026-08-31T00:00:00Z',to:'2026-09-01T00:00:00Z'});assert.equal(staff.view,'staff');const resource=await svc.get('t',{view:'resource',from:'2026-08-31T00:00:00Z',to:'2026-09-07T00:00:00Z'});assert.equal(resource.view,'resource');});
test('calendar rejects excessive range',()=>{const svc=new CalendarService(new Repo());assert.throws(()=>svc.get('t',{from:'2026-08-01T00:00:00Z',to:'2026-08-20T00:00:00Z'}),CalendarValidationError);});
