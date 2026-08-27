import Fastify from 'fastify';
import { Redis } from 'ioredis';
import { CAPABILITIES, ROLES, AccessDeniedError, authorize, type Actor, type Capability, type Role } from '@wsadmin-business/auth';
import { createCustomerRepository, createPool, createServiceRepository, probeDatabase } from '@wsadmin-business/database';
import { registerCustomerRoutes } from './customer-routes.js';
import { registerServiceRoutes } from './service-routes.js';
export function buildApp(options:{enableDevRbacProbe?:boolean;customerRepository?:import('@wsadmin-business/customers').CustomerRepository;serviceRepository?:import('@wsadmin-business/services').ServiceRepository}={}) {
  const app = Fastify({ logger: false });
  const pool = createPool();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:56379/0',{lazyConnect:true,maxRetriesPerRequest:2});
  async function probeRedis(){if(redis.status==='wait')await redis.connect();const pong=await redis.ping();return {status:pong==='PONG'?'ok':'error',namespace:'wsb:'};}
  app.get('/health',async(_request,reply)=>{try{const[database,cache]=await Promise.all([probeDatabase(pool),probeRedis()]);return{service:'wsadmin-business-api',status:'ok',product:'WSadmin Business',isolation:'mvoc-separate',database,cache,timezone:'Asia/Kuala_Lumpur'};}catch(error){reply.code(503);return{service:'wsadmin-business-api',status:'error',error:error instanceof Error?error.message:'health probe failed'};}});
  app.get('/api/v1',async()=>({name:'WSadmin Business API',version:'0.1.0',phase:'P1-booking-core',aiPolicy:'NO_DIRECT_DATABASE_WRITES'}));
  registerCustomerRoutes(app,options.customerRepository??createCustomerRepository(pool));
  registerServiceRoutes(app,options.serviceRepository??createServiceRepository(pool));
  if(options.enableDevRbacProbe){app.get('/api/v1/dev/rbac',async(request,reply)=>{const headers=request.headers;const role=String(headers['x-wsadmin-role']??'') as Role;const tenantId=String(headers['x-wsadmin-tenant-id']??'');const targetTenantId=String(headers['x-wsadmin-target-tenant-id']??tenantId);const capability=String(headers['x-wsadmin-capability']??'TENANT_READ') as Capability;if(!ROLES.includes(role)||!CAPABILITIES.includes(capability)||(!tenantId&&role!=='SYSTEM_OWNER'))return reply.code(400).send({error:'invalid_dev_actor'});const actor:Actor={userId:String(headers['x-wsadmin-user-id']??'dev-user'),role,...(tenantId?{tenantId}:{})};try{authorize(actor,targetTenantId,capability);return{allowed:true,role,tenantId:targetTenantId,capability};}catch(error){if(error instanceof AccessDeniedError)return reply.code(403).send({allowed:false,error:error.message});throw error;}});}
  app.addHook('onClose',async()=>{await pool.end();redis.disconnect();});
  return app;
}
