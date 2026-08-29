import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAuthentication, type AuthenticationConfig, type GoogleOAuthClient } from './auth-routes.js';

const actor={userId:'11111111-1111-4111-8111-111111111111',email:'owner@example.com',displayName:'Owner',role:'TENANT_OWNER' as const,tenantId:'22222222-2222-4222-8222-222222222222',tenantName:'Owner Business',onboardingCompleted:false};
const config:AuthenticationConfig={mode:'GOOGLE',appUrl:'http://localhost:15281',clientId:'client-id',clientSecret:'client-secret',redirectUri:'http://localhost:15280/api/v1/auth/google/callback',secureCookies:false,sessionTtlMs:60_000,trialDays:10,trialPlanCode:'TRIAL'};
const google:GoogleOAuthClient={authorizationUrl({state,codeChallenge}){return`https://accounts.google.test/auth?state=${state}&code_challenge=${codeChallenge}`;},async exchangeCode(){return'access-token';},async getIdentity(){return{subject:'google-1',email:'owner@example.com',emailVerified:true,displayName:'Owner',avatarUrl:null};}};
const setCookies=(header:string|string[]|undefined)=>(Array.isArray(header)?header:[header??'']).flatMap(value=>value.split(/,(?=[^;,]+=)/)).map(value=>value.split(';')[0]??'').filter(Boolean);

test('Google OAuth uses state and PKCE then issues an opaque HttpOnly session',async()=>{
  const sessions=new Map<string,typeof actor>(),repo:any={async provisionGoogleIdentity(){return actor;},async createSession(input:any){sessions.set(input.tokenHash,actor);},async resolveSession(hash:string){return sessions.get(hash)??null;},async deleteSession(hash:string){sessions.delete(hash);}};
  const app=Fastify();registerAuthentication(app,repo,config,google);
  app.get('/api/v1/tenants/:tenantId/protected',async request=>({role:request.headers['x-wsadmin-role'],tenantId:request.headers['x-wsadmin-tenant-id'],email:(request as any).wsadminAuth?.email}));
  const start=await app.inject({method:'GET',url:'/api/v1/auth/google/start'});assert.equal(start.statusCode,302);assert.match(start.headers.location??'',/code_challenge=/);
  const oauthCookies=setCookies(start.headers['set-cookie']);const cookieHeader=oauthCookies.join('; '),state=new URL(start.headers.location!).searchParams.get('state');assert.ok(state);
  const callback=await app.inject({method:'GET',url:`/api/v1/auth/google/callback?code=ok&state=${encodeURIComponent(state!)}`,headers:{cookie:cookieHeader}});assert.equal(callback.statusCode,302);assert.equal(callback.headers.location,'http://localhost:15281/?auth=success');
  const sessionCookie=setCookies(callback.headers['set-cookie']).find(value=>value.startsWith('wsadmin_session='));assert.ok(sessionCookie);assert.match(String(callback.headers['set-cookie']),/HttpOnly/);
  const protectedResponse=await app.inject({method:'GET',url:`/api/v1/tenants/${actor.tenantId}/protected`,headers:{cookie:sessionCookie!,'x-wsadmin-role':'SYSTEM_OWNER','x-wsadmin-tenant-id':'spoofed'}});assert.equal(protectedResponse.statusCode,200);assert.deepEqual(protectedResponse.json(),{role:'TENANT_OWNER',tenantId:actor.tenantId,email:'owner@example.com'});
  await app.close();
});

test('Google callback rejects a mismatched OAuth state and protected routes reject spoofed headers',async()=>{
  const repo:any={async resolveSession(){return null;},async deleteSession(){}};const app=Fastify();registerAuthentication(app,repo,config,google);app.get('/api/v1/tenants/:tenantId/protected',async()=>({ok:true}));
  const callback=await app.inject({method:'GET',url:'/api/v1/auth/google/callback?code=ok&state=attacker',headers:{cookie:'wsadmin_oauth_state=expected; wsadmin_oauth_verifier=verifier'}});assert.equal(callback.statusCode,401);
  const protectedResponse=await app.inject({method:'GET',url:'/api/v1/tenants/t1/protected',headers:{'x-wsadmin-role':'SYSTEM_OWNER','x-wsadmin-tenant-id':'t1'}});assert.equal(protectedResponse.statusCode,401);
  await app.close();
});

test('expired trial blocks operational APIs but preserves subscription recovery access',async()=>{
  const expired={...actor,subscriptionStatus:'TRIAL' as const,trialEndsAt:new Date('2026-08-20T00:00:00Z'),trialExpired:true};
  const repo:any={async resolveSession(){return expired;},async deleteSession(){}};
  const app=Fastify();registerAuthentication(app,repo,config,google);
  app.get('/api/v1/tenants/:tenantId/bookings',async()=>({ok:true}));
  app.get('/api/v1/tenants/:tenantId/subscription',async()=>({status:'TRIAL'}));
  const operational=await app.inject({method:'GET',url:`/api/v1/tenants/${actor.tenantId}/bookings`,headers:{cookie:'wsadmin_session=expired'}});
  assert.equal(operational.statusCode,402);assert.equal(operational.json().error,'trial_expired');
  const recovery=await app.inject({method:'GET',url:`/api/v1/tenants/${actor.tenantId}/subscription`,headers:{cookie:'wsadmin_session=expired'}});
  assert.equal(recovery.statusCode,200);
  await app.close();
});
