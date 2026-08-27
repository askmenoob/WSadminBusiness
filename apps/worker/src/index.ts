import { Redis } from 'ioredis';
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:56379/0', { maxRetriesPerRequest: 3 });
const key = 'wsb:health:worker';
async function heartbeat() { await redis.set(key, new Date().toISOString(), 'EX', 90); }
await heartbeat();
console.log(JSON.stringify({service:'wsadmin-business-worker',status:'ready',keyPrefix:'wsb:'}));
const timer = setInterval(() => void heartbeat().catch((error)=>console.error('worker heartbeat failed', error)), 30000);
const shutdown = async () => { clearInterval(timer); await redis.quit(); process.exit(0); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
