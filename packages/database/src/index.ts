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
export { createAvailabilityRepository } from './availability.js';
export { createBookingRepository } from './bookings.js';
export { createCalendarRepository } from './calendar.js';
export { createDashboardRepository } from './dashboard.js';
export { createBookingPolicyRepository } from './booking-policy.js';
export { createCalendarControlRepository } from './calendar-controls.js';
export { createServiceOptionRepository } from './service-options.js';
export { createLocationRepository } from './locations.js';
export { createWhatsAppInstanceRepository } from './whatsapp-instances.js';
export { createWhatsAppProviderEventRepository } from './whatsapp-provider-events.js';
export { createInboxRepository } from './inbox.js';
export { createWhatsAppBookingFlowRepository } from './whatsapp-booking-flow.js';
export { createWhatsAppBookingManagementRepository } from './whatsapp-booking-management.js';
export { createDeliveryRepository } from './whatsapp-delivery.js';
export { createAiSettingsRepository,createAiUsageRepository } from './ai.js';
export { createAiBusinessTools } from './ai-business-tools.js';
export { createAiKnowledgeRepository } from './ai-knowledge.js';
export { createAiMemoryRepository } from './ai-memory.js';
export { createCustomerCrmRepository } from './customer-crm.js';
export { createCustomerControlRepository } from './customer-controls.js';
export { createTreatmentRepository } from './treatments.js';
export { createTreatmentSharingRepository } from './treatment-sharing.js';
export { createAutomationRepository } from './automation.js';
export { createLifecycleRepository } from './automation-lifecycle.js';
export { createMarketingRepository } from './marketing.js';
export { createMessagingPolicyRepository } from './messaging-policy.js';
export { createPaymentRepository } from './payments.js';
export { createAdvancedBookingRepository } from './advanced-booking.js';
export { createPropertyRepository } from './vertical-properties.js';
