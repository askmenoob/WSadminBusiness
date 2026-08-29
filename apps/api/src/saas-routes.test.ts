import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerSaasRoutes } from './saas-routes.js';

const tenantHeaders = (tenant = 'tenant-a') => ({
  'x-wsadmin-role': 'TENANT_OWNER',
  'x-wsadmin-tenant-id': tenant,
  'x-wsadmin-user-id': 'owner',
});

const systemHeaders = { 'x-wsadmin-role': 'SYSTEM_OWNER', 'x-wsadmin-user-id': 'system-owner' };

const repo: any = {
  async getSubscription(tenantId: string) {
    return { tenantId, planCode: 'GROWTH', status: 'ACTIVE', trialEndsAt: null, currentPeriodEndsAt: null, cancelAtPeriodEnd: false, updatedAt: new Date() };
  },
  async getPlan() {
    return { id: 'plan-1', code: 'GROWTH', name: 'Growth', monthlyPriceMinor: 19900, currency: 'MYR', active: true, entitlements: { ai_requests: 1000, marketing: true } };
  },
  async getUsage(_tenantId: string, key: string) { return key === 'ai_requests' ? 125 : 0; },
  async systemDashboard() {
    return { tenants: 1, subscriptions: { ACTIVE: 1 }, whatsapp: { CONNECTED: 1 }, automation: { QUEUED: 2 }, ai: { requests: 30, inputTokens: 400, outputTokens: 200, latencyAvgMs: 350, estimatedCostMicrousd: 2400 }, tenantHealth: [{ tenantId: 'tenant-a', name: 'Tenant A', subscriptionStatus: 'ACTIVE', planCode: 'GROWTH', whatsappStatus: 'CONNECTED', openJobs: 2, aiRequests: 30, aiCostMicrousd: 2400 }] };
  },
  async listPlans() { return []; },
  async getBusinessContext(tenantId:string){return{tenantId,businessId:'business-1',name:'Villa Mawar',businessType:'PROPERTY',businessSubtype:'HOMESTAY',offeringKind:'PROPERTY',workflowKind:'BOOKING',setupConfig:{},labels:{offeringSingular:'Property',offeringPlural:'Properties',transactionSingular:'Booking',transactionPlural:'Bookings',customerSingular:'Guest',staffSingular:'Host'},offerings:[]};},
};

test('tenant business context exposes wizard-driven terminology',async()=>{const app=Fastify();registerSaasRoutes(app,repo);const response=await app.inject({method:'GET',url:'/api/v1/tenants/tenant-a/business-context',headers:tenantHeaders()});assert.equal(response.statusCode,200);assert.equal(response.json().labels.offeringSingular,'Property');assert.equal(response.json().workflowKind,'BOOKING');await app.close();});

test('tenant plan and quota overview is tenant scoped', async () => {
  const app = Fastify();
  registerSaasRoutes(app, repo);
  let response = await app.inject({ method: 'GET', url: '/api/v1/tenants/tenant-a/subscription?period=2026-08', headers: tenantHeaders() });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().quotas[0].used, 125);
  response = await app.inject({ method: 'GET', url: '/api/v1/tenants/tenant-b/subscription?period=2026-08', headers: tenantHeaders() });
  assert.equal(response.statusCode, 403);
  await app.close();
});

test('system dashboard is visible only to System Owner', async () => {
  const app = Fastify();
  registerSaasRoutes(app, repo);
  let response = await app.inject({ method: 'GET', url: '/api/v1/system/dashboard', headers: systemHeaders });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().tenantHealth[0].aiCostMicrousd, 2400);
  response = await app.inject({ method: 'GET', url: '/api/v1/system/dashboard', headers: tenantHeaders() });
  assert.equal(response.statusCode, 403);
  await app.close();
});

test('tenant owner cannot activate its own subscription',async()=>{
  const app=Fastify();registerSaasRoutes(app,repo);
  const response=await app.inject({method:'PUT',url:'/api/v1/tenants/tenant-a/subscription',headers:tenantHeaders(),payload:{planCode:'GROWTH',status:'ACTIVE'}});
  assert.equal(response.statusCode,403);
  assert.equal(response.json().error,'provider_or_system_owner_required');
  await app.close();
});
