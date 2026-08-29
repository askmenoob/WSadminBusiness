import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { AuthError, type AuthenticatedActor, type AuthenticationRepository, type GoogleIdentity, type Role } from '@wsadmin-business/auth';

const slug=(value:string)=>value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'business';

export function createAuthenticationRepository(pool:Pool):AuthenticationRepository{return{
  async provisionGoogleIdentity(identity:GoogleIdentity):Promise<AuthenticatedActor>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const found=await client.query(`SELECT * FROM users WHERE google_subject=$1 OR lower(email)=lower($2) ORDER BY google_subject=$1 DESC LIMIT 1 FOR UPDATE`,[identity.subject,identity.email]);
      let user=found.rows[0];
      if(user?.google_subject&&user.google_subject!==identity.subject)throw new AuthError('This email is already linked to another Google identity','identity_conflict');
      if(user){
        const updated=await client.query(`UPDATE users SET email=lower($2),display_name=coalesce($3,display_name),google_subject=$4,avatar_url=$5,last_login_at=now(),updated_at=now() WHERE id=$1 RETURNING *`,[user.id,identity.email,identity.displayName,identity.subject,identity.avatarUrl]);
        user=updated.rows[0];
      }else{
        const inserted=await client.query(`INSERT INTO users(email,display_name,google_subject,avatar_url,last_login_at) VALUES(lower($1),$2,$3,$4,now()) RETURNING *`,[identity.email,identity.displayName,identity.subject,identity.avatarUrl]);
        user=inserted.rows[0];
      }
      if(user.platform_role==='SYSTEM_OWNER'){
        await client.query('COMMIT');
        return{userId:user.id,email:user.email,displayName:user.display_name,role:'SYSTEM_OWNER',onboardingCompleted:true};
      }
      let membership=(await client.query(`SELECT m.tenant_id,m.role,t.name,coalesce(o.completed,false) onboarding_completed FROM tenant_memberships m JOIN tenants t ON t.id=m.tenant_id LEFT JOIN tenant_onboarding o ON o.tenant_id=t.id WHERE m.user_id=$1 AND t.status='ACTIVE' ORDER BY m.created_at LIMIT 1`,[user.id])).rows[0];
      if(!membership){
        const tenantName=identity.displayName?`${identity.displayName} Business`:`${identity.email.split('@')[0]} Business`;
        const tenant=(await client.query(`INSERT INTO tenants(name,slug) VALUES($1,$2) RETURNING id,name`,[tenantName,`${slug(tenantName)}-${randomUUID().slice(0,8)}`])).rows[0];
        await client.query(`INSERT INTO businesses(tenant_id,name,vertical) VALUES($1,$2,'OTHER')`,[tenant.id,tenantName]);
        await client.query(`INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_OWNER')`,[tenant.id,user.id]);
        membership={tenant_id:tenant.id,role:'TENANT_OWNER',name:tenant.name,onboarding_completed:false};
      }
      await client.query('COMMIT');
      return{userId:user.id,email:user.email,displayName:user.display_name,role:membership.role as Role,tenantId:membership.tenant_id,tenantName:membership.name,onboardingCompleted:Boolean(membership.onboarding_completed)};
    }catch(error){await client.query('ROLLBACK');if((error as any)?.code==='23505')throw new AuthError('Google identity or email is already linked','identity_conflict');throw error;}finally{client.release();}
  },
  async createSession(input){await pool.query(`INSERT INTO auth_sessions(user_id,tenant_id,token_hash,expires_at) VALUES($1,$2,$3,$4)`,[input.userId,input.tenantId,input.tokenHash,input.expiresAt]);},
  async resolveSession(tokenHash){
    const result=await pool.query(`SELECT s.id,u.id user_id,u.email,u.display_name,u.platform_role,s.tenant_id,t.name tenant_name,tm.role tenant_role,coalesce(o.completed,false) onboarding_completed FROM auth_sessions s JOIN users u ON u.id=s.user_id LEFT JOIN tenants t ON t.id=s.tenant_id LEFT JOIN tenant_memberships tm ON tm.user_id=u.id AND tm.tenant_id=s.tenant_id LEFT JOIN tenant_onboarding o ON o.tenant_id=s.tenant_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true AND (u.platform_role='SYSTEM_OWNER' OR (tm.id IS NOT NULL AND t.status='ACTIVE'))`,[tokenHash]);
    if(!result.rowCount)return null;
    const row=result.rows[0];await pool.query('UPDATE auth_sessions SET last_seen_at=now() WHERE id=$1',[row.id]);
    return{userId:row.user_id,email:row.email,displayName:row.display_name,role:(row.platform_role==='SYSTEM_OWNER'?'SYSTEM_OWNER':row.tenant_role) as Role,...(row.tenant_id?{tenantId:row.tenant_id,tenantName:row.tenant_name}:{}),onboardingCompleted:row.platform_role==='SYSTEM_OWNER'||Boolean(row.onboarding_completed)};
  },
  async deleteSession(tokenHash){await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[tokenHash]);},
};}
