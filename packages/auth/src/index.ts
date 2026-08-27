export const ROLES = ['SYSTEM_OWNER','TENANT_OWNER','ADMIN','MANAGER','STAFF','VIEWER'] as const;
export type Role = (typeof ROLES)[number];
export const CAPABILITIES = ['TENANT_READ','TENANT_MANAGE','CUSTOMER_WRITE','SERVICE_WRITE','STAFF_WRITE','RESOURCE_WRITE','BOOKING_WRITE','SETTINGS_WRITE','SYSTEM_ADMIN'] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type Actor = { userId:string; role:Role; tenantId?:string };
const grants: Record<Role, ReadonlySet<Capability>> = {
  SYSTEM_OWNER: new Set(CAPABILITIES),
  TENANT_OWNER: new Set(['TENANT_READ','TENANT_MANAGE','CUSTOMER_WRITE','SERVICE_WRITE','STAFF_WRITE','RESOURCE_WRITE','BOOKING_WRITE','SETTINGS_WRITE']),
  ADMIN: new Set(['TENANT_READ','TENANT_MANAGE','CUSTOMER_WRITE','SERVICE_WRITE','STAFF_WRITE','RESOURCE_WRITE','BOOKING_WRITE','SETTINGS_WRITE']),
  MANAGER: new Set(['TENANT_READ','CUSTOMER_WRITE','SERVICE_WRITE','STAFF_WRITE','RESOURCE_WRITE','BOOKING_WRITE']),
  STAFF: new Set(['TENANT_READ','CUSTOMER_WRITE','BOOKING_WRITE']),
  VIEWER: new Set(['TENANT_READ'])
};
export class AccessDeniedError extends Error { constructor(message='Access denied'){ super(message); this.name='AccessDeniedError'; } }
export function authorize(actor:Actor, targetTenantId:string, capability:Capability) {
  if (actor.role !== 'SYSTEM_OWNER' && actor.tenantId !== targetTenantId) throw new AccessDeniedError('Cross-tenant access denied');
  if (!grants[actor.role].has(capability)) throw new AccessDeniedError(`Role ${actor.role} lacks ${capability}`);
  return true;
}
