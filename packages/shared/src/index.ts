export const PRODUCT = 'WSadmin Business' as const;
export const DEFAULT_TIMEZONE = 'Asia/Kuala_Lumpur' as const;
export const DEFAULT_CURRENCY = 'MYR' as const;
export const SUPPORTED_LANGUAGES = ['ms', 'en'] as const;
export const TENANT_ROLES = ['SYSTEM_OWNER','TENANT_OWNER','ADMIN','MANAGER','STAFF','VIEWER'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];
