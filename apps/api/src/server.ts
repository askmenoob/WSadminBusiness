import Fastify from 'fastify';
import { Redis } from 'ioredis';
import { createPool, probeDatabase } from '@wsadmin-business/database';
const app = Fastify({ logger: true });
const pool = createPool();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:56379/0', { lazyConnect:true, maxRetriesPerRequest:2 });
async function probeRedis(){if(redis.status==='wait')await redis.connect();const pong=await redis.ping();return {status:pong==='PONG'?'ok':'error',namespace:'wsb:'};}
app.get('/health', async (_request, reply) => { try { const [database,cache]=await Promise.all([probeDatabase(pool),probeRedis()]); return {service:'wsadmin-business-api',status:'ok',product:'WSadmin Business',isolation:'mvoc-separate',database,cache,timezone:'Asia/Kuala_Lumpur'}; } catch(error){reply.code(503);return {service:'wsadmin-business-api',status:'error',error:error instanceof Error?error.message:'health probe failed'};} });
app.get('/api/v1', async () => ({name:'WSadmin Business API',version:'0.1.0',phase:'P0-isolation',aiPolicy:'NO_DIRECT_DATABASE_WRITES'}));
const shutdown=async()=>{await Promise.allSettled([pool.end(),redis.quit()]);await app.close();process.exit(0);};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
await app.listen({port:Number(process.env.PORT??15280),host:process.env.HOST??'127.0.0.1'});
