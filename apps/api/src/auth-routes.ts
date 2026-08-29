import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthenticationService, type AuthenticatedActor, type AuthenticationRepository, type GoogleIdentity } from '@wsadmin-business/auth';
import { readRuntimeSecret } from './runtime-secrets.js';

const SESSION_COOKIE='wsadmin_session',STATE_COOKIE='wsadmin_oauth_state',VERIFIER_COOKIE='wsadmin_oauth_verifier';
export type AuthenticationMode='UAT'|'GOOGLE';
export type AuthenticationConfig={mode:AuthenticationMode;appUrl:string;clientId:string;clientSecret:string;redirectUri:string;secureCookies:boolean;sessionTtlMs:number};
export interface GoogleOAuthClient{authorizationUrl(input:{state:string;codeChallenge:string}):string;exchangeCode(code:string,codeVerifier:string):Promise<string>;getIdentity(accessToken:string):Promise<GoogleIdentity>;}

const cookies=(request:FastifyRequest)=>Object.fromEntries(String(request.headers.cookie??'').split(';').map(part=>part.trim()).filter(Boolean).map(part=>{const index=part.indexOf('=');return index<0?[part,'']:[part.slice(0,index),decodeURIComponent(part.slice(index+1))];}));
const cookie=(name:string,value:string,options:{maxAge?:number;secure:boolean;path?:string})=>`${name}=${encodeURIComponent(value)}; Path=${options.path??'/'}; HttpOnly; SameSite=Lax${options.secure?'; Secure':''}${options.maxAge===undefined?'':`; Max-Age=${options.maxAge}`}`;
const safeTextEqual=(a:string,b:string)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);};
const clearActorHeaders=(request:FastifyRequest)=>{for(const name of ['x-wsadmin-role','x-wsadmin-user-id','x-wsadmin-tenant-id','x-wsadmin-user-email'])delete request.headers[name];};
const isProtected=(url:string)=>{const path=url.split('?')[0]??url;return path.startsWith('/api/v1/tenants/')||path.startsWith('/api/v1/system/');};

export function authenticationConfigFromEnv():AuthenticationConfig{
  const raw=String(process.env.WSADMIN_AUTH_MODE??(process.env.NODE_ENV==='production'?'GOOGLE':'UAT')).toUpperCase();
  if(raw!=='UAT'&&raw!=='GOOGLE')throw new Error('WSADMIN_AUTH_MODE must be UAT or GOOGLE');
  const appUrl=String(process.env.WSADMIN_APP_URL??process.env.WSADMIN_PUBLIC_WEB_URL??'https://wsadmin-biz.imai.my').replace(/\/$/,'');
  return{mode:raw,appUrl,clientId:String(process.env.GOOGLE_CLIENT_ID??'').trim(),clientSecret:readRuntimeSecret('GOOGLE_CLIENT_SECRET','GOOGLE_CLIENT_SECRET_FILE'),redirectUri:String(process.env.GOOGLE_REDIRECT_URI??`${appUrl}/api/v1/auth/google/callback`).trim(),secureCookies:appUrl.startsWith('https://'),sessionTtlMs:Math.max(1,Number(process.env.AUTH_SESSION_TTL_DAYS??30))*24*60*60_000};
}

export class GoogleOAuthHttpClient implements GoogleOAuthClient{
  constructor(private readonly config:AuthenticationConfig,private readonly fetcher:typeof fetch=fetch){}
  authorizationUrl(input:{state:string;codeChallenge:string}){const query=new URLSearchParams({client_id:this.config.clientId,redirect_uri:this.config.redirectUri,response_type:'code',scope:'openid email profile',access_type:'offline',prompt:'select_account',state:input.state,code_challenge:input.codeChallenge,code_challenge_method:'S256'});return`https://accounts.google.com/o/oauth2/v2/auth?${query}`;}
  async exchangeCode(code:string,codeVerifier:string){const response=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.config.clientId,client_secret:this.config.clientSecret,code,code_verifier:codeVerifier,grant_type:'authorization_code',redirect_uri:this.config.redirectUri})});if(!response.ok)throw new Error(`Google token exchange failed (${response.status})`);const body=await response.json() as any;if(!body.access_token)throw new Error('Google token response is incomplete');return String(body.access_token);}
  async getIdentity(accessToken:string){const response=await this.fetcher('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{authorization:`Bearer ${accessToken}`}});if(!response.ok)throw new Error(`Google profile request failed (${response.status})`);const body=await response.json() as any;return{subject:String(body.sub??''),email:String(body.email??''),emailVerified:body.email_verified===true,displayName:typeof body.name==='string'?body.name:null,avatarUrl:typeof body.picture==='string'?body.picture:null};}
}

export function registerAuthentication(app:FastifyInstance,repo:AuthenticationRepository,config:AuthenticationConfig=authenticationConfigFromEnv(),google:GoogleOAuthClient=new GoogleOAuthHttpClient(config)){
  const service=new AuthenticationService(repo,{sessionTtlMs:config.sessionTtlMs});
  app.addHook('onRequest',async(request,reply)=>{
    if(config.mode!=='GOOGLE')return;
    clearActorHeaders(request);
    if(!isProtected(request.url))return;
    const actor=await service.resolve(cookies(request)[SESSION_COOKIE]??'');
    if(!actor){return reply.code(401).send({error:'authentication_required'});}
    (request as any).wsadminAuth=actor;
    request.headers['x-wsadmin-role']=actor.role;
    request.headers['x-wsadmin-user-id']=actor.userId;
    request.headers['x-wsadmin-user-email']=actor.email;
    if(actor.tenantId)request.headers['x-wsadmin-tenant-id']=actor.tenantId;
  });
  app.get('/api/v1/auth/config',async()=>({mode:config.mode,googleConfigured:Boolean(config.clientId&&config.clientSecret),provider:config.mode==='GOOGLE'?'GOOGLE':null}));
  app.get('/api/v1/auth/google/start',async(_request,reply)=>{
    if(config.mode!=='GOOGLE'||!config.clientId||!config.clientSecret)return reply.code(503).send({error:'google_auth_not_configured'});
    const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
    reply.header('set-cookie',[cookie(STATE_COOKIE,state,{secure:config.secureCookies,maxAge:600,path:'/api/v1/auth/google/callback'}),cookie(VERIFIER_COOKIE,verifier,{secure:config.secureCookies,maxAge:600,path:'/api/v1/auth/google/callback'})]);
    return reply.redirect(google.authorizationUrl({state,codeChallenge:challenge}));
  });
  app.get('/api/v1/auth/google/callback',async(request,reply)=>{
    const query=request.query as {code?:string;state?:string;error?:string};const stored=cookies(request);
    const clear=[cookie(STATE_COOKIE,'',{secure:config.secureCookies,maxAge:0,path:'/api/v1/auth/google/callback'}),cookie(VERIFIER_COOKIE,'',{secure:config.secureCookies,maxAge:0,path:'/api/v1/auth/google/callback'})];
    if(query.error)return reply.header('set-cookie',clear).redirect(`${config.appUrl}/?auth=cancelled`);
    if(!query.code||!query.state||!stored[STATE_COOKIE]||!stored[VERIFIER_COOKIE]||!safeTextEqual(query.state,stored[STATE_COOKIE]))return reply.header('set-cookie',clear).code(401).send({error:'invalid_oauth_state'});
    try{const accessToken=await google.exchangeCode(query.code,stored[VERIFIER_COOKIE]);const identity=await google.getIdentity(accessToken);const session=await service.loginWithGoogle(identity);const maxAge=Math.floor((session.expiresAt.getTime()-Date.now())/1000);return reply.header('set-cookie',[...clear,cookie(SESSION_COOKIE,session.token,{secure:config.secureCookies,maxAge})]).redirect(`${config.appUrl}/?auth=success`);}catch{return reply.header('set-cookie',clear).redirect(`${config.appUrl}/?auth=failed`);}
  });
  app.get('/api/v1/auth/session',async(request,reply)=>{if(config.mode!=='GOOGLE')return{mode:'UAT',authenticated:false};const actor=await service.resolve(cookies(request)[SESSION_COOKIE]??'');if(!actor)return reply.code(401).send({error:'authentication_required'});return{mode:'GOOGLE',authenticated:true,user:{id:actor.userId,email:actor.email,displayName:actor.displayName},tenant:actor.tenantId?{id:actor.tenantId,name:actor.tenantName}:null,role:actor.role,onboardingCompleted:actor.onboardingCompleted};});
  app.post('/api/v1/auth/logout',async(request,reply)=>{await service.logout(cookies(request)[SESSION_COOKIE]??'');reply.header('set-cookie',cookie(SESSION_COOKIE,'',{secure:config.secureCookies,maxAge:0}));return reply.code(204).send();});
  return{config,service};
}

export function authenticatedActor(request:FastifyRequest):AuthenticatedActor|null{return((request as any).wsadminAuth??null) as AuthenticatedActor|null;}
