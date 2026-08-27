import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.js';
process.env.DATABASE_URL ??= 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
function headers(role:string,tenant='tenant-a',target=tenant,capability='TENANT_READ'){return{'x-wsadmin-role':role,'x-wsadmin-tenant-id':tenant,'x-wsadmin-target-tenant-id':target,'x-wsadmin-capability':capability};}
test('API RBAC allows system owner across tenant boundary',async()=>{const app=buildApp({enableDevRbacProbe:true});const res=await app.inject({method:'GET',url:'/api/v1/dev/rbac',headers:headers('SYSTEM_OWNER','', 'tenant-b','SYSTEM_ADMIN')});assert.equal(res.statusCode,200);await app.close();});
test('API RBAC blocks cross-tenant staff',async()=>{const app=buildApp({enableDevRbacProbe:true});const res=await app.inject({method:'GET',url:'/api/v1/dev/rbac',headers:headers('STAFF','tenant-a','tenant-b','BOOKING_WRITE')});assert.equal(res.statusCode,403);await app.close();});
test('API RBAC keeps viewer read-only',async()=>{const app=buildApp({enableDevRbacProbe:true});const res=await app.inject({method:'GET',url:'/api/v1/dev/rbac',headers:headers('VIEWER','tenant-a','tenant-a','BOOKING_WRITE')});assert.equal(res.statusCode,403);await app.close();});
