import test from 'node:test';
import assert from 'node:assert/strict';
import { AccessDeniedError, AuthError, AuthenticationService, authorize, hashSessionToken } from './index.js';

test('system owner may cross tenant boundary',()=>assert.equal(authorize({userId:'sys',role:'SYSTEM_OWNER'},'tenant-b','SYSTEM_ADMIN'),true));
test('tenant owner may manage own tenant',()=>assert.equal(authorize({userId:'o',role:'TENANT_OWNER',tenantId:'tenant-a'},'tenant-a','SETTINGS_WRITE'),true));
test('staff cannot cross tenant boundary',()=>assert.throws(()=>authorize({userId:'s',role:'STAFF',tenantId:'tenant-a'},'tenant-b','BOOKING_WRITE'),AccessDeniedError));
test('viewer cannot mutate bookings',()=>assert.throws(()=>authorize({userId:'v',role:'VIEWER',tenantId:'tenant-a'},'tenant-a','BOOKING_WRITE'),AccessDeniedError));

test('staff cannot manage service catalog',()=>{assert.throws(()=>authorize({userId:'u',role:'STAFF',tenantId:'ta'},'ta','SERVICE_WRITE'),AccessDeniedError);});

test('staff cannot manage staff directory',()=>{assert.throws(()=>authorize({userId:'u',role:'STAFF',tenantId:'ta'},'ta','STAFF_WRITE'),AccessDeniedError);});

test('staff cannot manage resources',()=>{assert.throws(()=>authorize({userId:'u',role:'STAFF',tenantId:'ta'},'ta','RESOURCE_WRITE'),AccessDeniedError);});

test('manager may share treatment records',()=>assert.equal(authorize({userId:'m',role:'MANAGER',tenantId:'tenant-a'},'tenant-a','TREATMENT_SHARE_WRITE'),true));
test('staff cannot share treatment records',()=>assert.throws(()=>authorize({userId:'s',role:'STAFF',tenantId:'tenant-a'},'tenant-a','TREATMENT_SHARE_WRITE'),AccessDeniedError));

test('Google login provisions a tenant owner and stores only a session hash',async()=>{
  const writes:any[]=[];
  const repo:any={
    async provisionGoogleIdentity(identity:any){return{userId:'u1',email:identity.email,displayName:identity.displayName,role:'TENANT_OWNER',tenantId:'t1',tenantName:'Business One',onboardingCompleted:false};},
    async createSession(input:any){writes.push(input);},
    async resolveSession(hash:string){return hash===hashSessionToken('x'.repeat(43))?{userId:'u1',email:'owner@example.com',displayName:'Owner',role:'TENANT_OWNER',tenantId:'t1',tenantName:'Business One',onboardingCompleted:false}:null;},
    async deleteSession(){},
  };
  const service=new AuthenticationService(repo,{sessionTtlMs:60_000,tokenFactory:()=> 'x'.repeat(43),now:()=>new Date('2026-08-29T00:00:00Z')});
  const result=await service.loginWithGoogle({subject:'google-1',email:'Owner@Example.com',emailVerified:true,displayName:'Owner',avatarUrl:null});
  assert.equal(result.actor.tenantId,'t1');
  assert.equal(result.token,'x'.repeat(43));
  assert.equal(writes[0].tokenHash,hashSessionToken(result.token));
  assert.notEqual(writes[0].tokenHash,result.token);
  assert.equal((await service.resolve(result.token))?.email,'owner@example.com');
});

test('Google login rejects an unverified email',async()=>{
  const service=new AuthenticationService({} as any,{tokenFactory:()=> 'x'.repeat(43)});
  await assert.rejects(()=>service.loginWithGoogle({subject:'google-1',email:'owner@example.com',emailVerified:false,displayName:'Owner',avatarUrl:null}),(error:any)=>error instanceof AuthError&&error.code==='email_not_verified');
});
