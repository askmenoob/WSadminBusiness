import { Pool } from 'pg';
export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  return new Pool({ connectionString, max: 5 });
}
export async function probeDatabase(pool: Pool) {
  const result = await pool.query<{database:string}>('select current_database() as database');
  return { status:'ok' as const, database: result.rows[0]?.database ?? 'unknown' };
}
export { createCustomerRepository } from './customers.js';
export { createServiceRepository } from './services.js';
export { createStaffRepository } from './staff.js';
export { createStaffScheduleRepository } from './staff-schedule.js';
export { createResourceRepository } from './resources.js';
