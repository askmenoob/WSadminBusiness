import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { integrationConfigurationStatus, registerIntegrationStatusRoutes } from './integration-status-routes.js';

const headers = (tenant = 't1') => ({ 'x-wsadmin-role': 'TENANT_OWNER', 'x-wsadmin-tenant-id': tenant });
const repo = { async get(tenantId: string) { return tenantId === 't1' ? { status: 'CONNECTED', phoneE164: '+60120000000' } : null; } };

test('integration status is tenant scoped and never returns secret values', async () => {
  const app = Fastify();
  const secret = 'super-secret-provider-key';
  const resolve = () => integrationConfigurationStatus({ GROQ_API_KEY: secret, EVOLUTION_BASE_URL: 'http://evolution', EVOLUTION_API_KEY: secret, PAYMENT_PROVIDER_MODE: 'MOCK' });
  registerIntegrationStatusRoutes(app, repo as any, resolve);
  let response = await app.inject({ method: 'GET', url: '/api/v1/tenants/t1/settings/integrations', headers: headers() });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().whatsapp.status, 'CONNECTED');
  assert.equal(response.json().ai.providers[0].configured, true);
  assert.equal(response.body.includes(secret), false);
  response = await app.inject({ method: 'GET', url: '/api/v1/tenants/t2/settings/integrations', headers: headers() });
  assert.equal(response.statusCode, 403);
  await app.close();
});
