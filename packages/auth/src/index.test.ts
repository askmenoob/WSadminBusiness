import test from 'node:test';
import assert from 'node:assert/strict';
import { AccessDeniedError, authorize } from './index.js';

test('system owner may cross tenant boundary',()=>assert.equal(authorize({userId:'sys',role:'SYSTEM_OWNER'},'tenant-b','SYSTEM_ADMIN'),true));
test('tenant owner may manage own tenant',()=>assert.equal(authorize({userId:'o',role:'TENANT_OWNER',tenantId:'tenant-a'},'tenant-a','SETTINGS_WRITE'),true));
test('staff cannot cross tenant boundary',()=>assert.throws(()=>authorize({userId:'s',role:'STAFF',tenantId:'tenant-a'},'tenant-b','BOOKING_WRITE'),AccessDeniedError));
test('viewer cannot mutate bookings',()=>assert.throws(()=>authorize({userId:'v',role:'VIEWER',tenantId:'tenant-a'},'tenant-a','BOOKING_WRITE'),AccessDeniedError));

test('staff cannot manage service catalog',()=>{assert.throws(()=>authorize({userId:'u',role:'STAFF',tenantId:'ta'},'ta','SERVICE_WRITE'),AccessDeniedError);});

test('staff cannot manage staff directory',()=>{assert.throws(()=>authorize({userId:'u',role:'STAFF',tenantId:'ta'},'ta','STAFF_WRITE'),AccessDeniedError);});
