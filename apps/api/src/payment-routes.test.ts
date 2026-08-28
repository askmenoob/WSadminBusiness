import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerPaymentRoutes } from './payment-routes.js';

const payment = {id:'p1',tenantId:'t1',bookingId:'b1',customerId:'c1',provider:'MOCK',providerPaymentId:'mock-p1',purpose:'FULL',amountMinor:12000,currency:'MYR',status:'PARTIALLY_REFUNDED',paidAt:new Date(),refundedMinor:2000,createdAt:new Date(),updatedAt:new Date()};
const repo = {async list(t:string){return t==='t1'?[payment]:[]}};
const registry = {get(){throw new Error('gateway is not needed for payment reads')}};
const headers = (tenant='t1') => ({'x-wsadmin-role':'TENANT_OWNER','x-wsadmin-tenant-id':tenant});

test('payment history is readable only inside the actor tenant',async()=>{
  const app=Fastify();
  registerPaymentRoutes(app,repo as any,registry as any);
  let response=await app.inject({method:'GET',url:'/api/v1/tenants/t1/payments',headers:headers()});
  assert.equal(response.statusCode,200);
  assert.equal(response.json()[0].refundedMinor,2000);
  response=await app.inject({method:'GET',url:'/api/v1/tenants/t2/payments',headers:headers()});
  assert.equal(response.statusCode,403);
  await app.close();
});
