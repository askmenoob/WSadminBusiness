import { buildApp } from './app.js';
const app = buildApp({enableDevRbacProbe:process.env.ENABLE_DEV_RBAC_PROBE==='1'});
const shutdown=async()=>{await app.close();process.exit(0);};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
await app.listen({port:Number(process.env.PORT??15280),host:process.env.HOST??'127.0.0.1'});
