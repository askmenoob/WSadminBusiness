import { existsSync } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AccessDeniedError, ROLES, authorize, type Actor, type Role } from '@wsadmin-business/auth';
import type { WhatsAppInstanceRepository } from '@wsadmin-business/whatsapp';

type Environment = Record<string, string | undefined>;
const actor = (request: FastifyRequest): Actor | null => {
  const role = String(request.headers['x-wsadmin-role'] ?? '') as Role;
  if (!ROLES.includes(role)) return null;
  const tenantId = String(request.headers['x-wsadmin-tenant-id'] ?? '');
  return { userId: String(request.headers['x-wsadmin-user-id'] ?? 'dev-user'), role, ...(tenantId ? { tenantId } : {}) };
};
function guard(request: FastifyRequest, reply: FastifyReply, tenantId: string) {
  const current = actor(request);
  if (!current) { reply.code(401).send({ error: 'authentication_required' }); return false; }
  try { authorize(current, tenantId, 'TENANT_READ'); return true; }
  catch (error) { if (error instanceof AccessDeniedError) { reply.code(403).send({ error: 'access_denied' }); return false; } throw error; }
}
const secretConfigured = (value: string | undefined, file: string | undefined) => Boolean(value?.trim() || (file && existsSync(file)));

export function integrationConfigurationStatus(env: Environment = process.env) {
  const paymentMode = String(env.PAYMENT_PROVIDER_MODE ?? '').toUpperCase();
  return {
    ai: {
      providers: [
        { provider: 'GROQ', configured: secretConfigured(env.GROQ_API_KEY, env.GROQ_API_KEY_FILE) },
        { provider: 'OPENAI', configured: secretConfigured(env.OPENAI_API_KEY, env.OPENAI_API_KEY_FILE) },
      ],
    },
    payment: { provider: paymentMode === 'MOCK' ? 'MOCK' : null, mode: paymentMode === 'MOCK' ? 'TEST' : 'DISABLED', configured: paymentMode === 'MOCK' },
    calendar: { provider: 'GOOGLE_CALENDAR', configured: Boolean(env.GOOGLE_CALENDAR_ID?.trim()) && secretConfigured(env.GOOGLE_CALENDAR_ACCESS_TOKEN, env.GOOGLE_CALENDAR_ACCESS_TOKEN_FILE) },
    whatsapp: { provider: 'EVOLUTION', configured: Boolean(env.EVOLUTION_BASE_URL?.trim()) && secretConfigured(env.EVOLUTION_API_KEY, env.EVOLUTION_API_KEY_FILE) },
    secretPolicy: 'SERVER_ONLY' as const,
  };
}

export function registerIntegrationStatusRoutes(app: FastifyInstance, whatsapp: WhatsAppInstanceRepository, resolve = () => integrationConfigurationStatus()) {
  app.get('/api/v1/tenants/:tenantId/settings/integrations', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    if (!guard(request, reply, tenantId)) return reply;
    const configuration = resolve(), instance = await whatsapp.get(tenantId);
    return {
      ...configuration,
      whatsapp: {
        ...configuration.whatsapp,
        provisioned: Boolean(instance),
        status: instance?.status ?? 'NOT_PROVISIONED',
        phoneE164: instance?.phoneE164 ?? null,
      },
    };
  });
}
