import { createHash, randomBytes } from 'node:crypto';

export const ROLES = ['SYSTEM_OWNER','TENANT_OWNER','ADMIN','MANAGER','STAFF','VIEWER'] as const;
export type Role = (typeof ROLES)[number];
export const CAPABILITIES = ['TENANT_READ','TENANT_MANAGE','CUSTOMER_WRITE','SERVICE_WRITE','STAFF_WRITE','RESOURCE_WRITE','BOOKING_WRITE','SETTINGS_WRITE','TREATMENT_SHARE_WRITE','SYSTEM_ADMIN'] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type Actor = { userId:string; role:Role; tenantId?:string };
const grants: Record<Role, ReadonlySet<Capability>> = {
  SYSTEM_OWNER: new Set(CAPABILITIES),
  TENANT_OWNER: new Set(['TENANT_READ','TENANT_MANAGE','CUSTOMER_WRITE','SERVICE_WRITE','STAFF_WRITE','RESOURCE_WRITE','BOOKING_WRITE','SETTINGS_WRITE','TREATMENT_SHARE_WRITE']),
  ADMIN: new Set(['TENANT_READ','TENANT_MANAGE','CUSTOMER_WRITE','SERVICE_WRITE','STAFF_WRITE','RESOURCE_WRITE','BOOKING_WRITE','SETTINGS_WRITE','TREATMENT_SHARE_WRITE']),
  MANAGER: new Set(['TENANT_READ','CUSTOMER_WRITE','SERVICE_WRITE','STAFF_WRITE','RESOURCE_WRITE','BOOKING_WRITE','TREATMENT_SHARE_WRITE']),
  STAFF: new Set(['TENANT_READ','CUSTOMER_WRITE','BOOKING_WRITE']),
  VIEWER: new Set(['TENANT_READ'])
};
export class AccessDeniedError extends Error { constructor(message='Access denied'){ super(message); this.name='AccessDeniedError'; } }
export function authorize(actor:Actor, targetTenantId:string, capability:Capability) {
  if (actor.role !== 'SYSTEM_OWNER' && actor.tenantId !== targetTenantId) throw new AccessDeniedError('Cross-tenant access denied');
  if (!grants[actor.role].has(capability)) throw new AccessDeniedError(`Role ${actor.role} lacks ${capability}`);
  return true;
}

export type GoogleIdentity={subject:string;email:string;emailVerified:boolean;displayName:string|null;avatarUrl:string|null};
export type AuthenticatedActor={userId:string;email:string;displayName:string|null;role:Role;tenantId?:string;tenantName?:string;onboardingCompleted:boolean};
export interface AuthenticationRepository{
  provisionGoogleIdentity(identity:GoogleIdentity):Promise<AuthenticatedActor>;
  createSession(input:{userId:string;tenantId:string|null;tokenHash:string;expiresAt:Date}):Promise<void>;
  resolveSession(tokenHash:string):Promise<AuthenticatedActor|null>;
  deleteSession(tokenHash:string):Promise<void>;
}
export class AuthError extends Error{constructor(message:string,public readonly code='authentication_error'){super(message);this.name='AuthError';}}
export function hashSessionToken(token:string){return createHash('sha256').update(token).digest('hex');}
export class AuthenticationService{
  private readonly sessionTtlMs:number;
  private readonly tokenFactory:()=>string;
  private readonly now:()=>Date;
  constructor(private readonly repo:AuthenticationRepository,options:{sessionTtlMs?:number;tokenFactory?:()=>string;now?:()=>Date}={}){
    this.sessionTtlMs=options.sessionTtlMs??30*24*60*60_000;
    this.tokenFactory=options.tokenFactory??(()=>randomBytes(32).toString('base64url'));
    this.now=options.now??(()=>new Date());
  }
  async loginWithGoogle(identity:GoogleIdentity){
    const email=identity.email.trim().toLowerCase();
    if(!identity.emailVerified)throw new AuthError('Google email is not verified','email_not_verified');
    if(!identity.subject.trim()||!email||!email.includes('@'))throw new AuthError('Google identity is incomplete','invalid_google_identity');
    const actor=await this.repo.provisionGoogleIdentity({...identity,email,displayName:identity.displayName?.trim()||null});
    const token=this.tokenFactory();
    if(token.length<32)throw new AuthError('Session token generator returned an unsafe token','unsafe_session_token');
    const expiresAt=new Date(this.now().getTime()+this.sessionTtlMs);
    await this.repo.createSession({userId:actor.userId,tenantId:actor.tenantId??null,tokenHash:hashSessionToken(token),expiresAt});
    return{actor,token,expiresAt};
  }
  resolve(token:string){if(!token)return Promise.resolve(null);return this.repo.resolveSession(hashSessionToken(token));}
  async logout(token:string){if(token)await this.repo.deleteSession(hashSessionToken(token));}
}
