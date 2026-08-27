import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => ({
  service: 'wsadmin-business-api',
  status: 'ok',
  product: 'WSadmin Business',
  isolation: 'mvoc-separate'
}));

app.get('/api/v1', async () => ({
  name: 'WSadmin Business API',
  version: '0.1.0',
  phase: 'P0-isolation'
}));

const port = Number(process.env.PORT ?? 15280);
const host = process.env.HOST ?? '127.0.0.1';

await app.listen({ port, host });
