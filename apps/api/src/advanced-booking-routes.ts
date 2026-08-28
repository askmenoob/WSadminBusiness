import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AccessDeniedError, ROLES, authorize, type Actor, type Capability, type Role } from '@wsadmin-business/auth';
import { AdvancedBookingError, MembershipService, TentativeBookingService, WebBookingService, type AdvancedBookingRepository } from '@wsadmin-business/advanced-booking';
import { AvailabilityValidationError, type AvailabilityCandidate } from '@wsadmin-business/availability';
import { BookingConflictError, BookingUnavailableError, BookingValidationError, type BookingService } from '@wsadmin-business/booking';

type PublicService = { id: string; name: string; description: string | null; durationMinutes: number; priceMinor: number; currency: string };
type PublicStaff = { id: string; displayName: string; photoUrl: string | null };
type PublicPaymentResult = { payment: unknown; link: { paymentId: string; url: string; expiresAt: Date | null } };

export type PublicBookingOptions = {
  listServices(tenantId: string): Promise<PublicService[]>;
  listStaff(tenantId: string, serviceId: string): Promise<PublicStaff[]>;
  findSlots(input: { tenantId: string; serviceId: string; localDate: string; staffId?: string; limit?: number }): Promise<{ timezone: string; slots: AvailabilityCandidate[] }>;
  payment?: {
    provider: string;
    create(input: { tenantId: string; bookingId: string; customerId: string | null; amountMinor: number; currency: string }): Promise<PublicPaymentResult>;
  };
};

function actor(request: FastifyRequest): Actor | null {
  const role = String(request.headers['x-wsadmin-role'] ?? '') as Role;
  if (!ROLES.includes(role)) return null;
  const tenantId = String(request.headers['x-wsadmin-tenant-id'] ?? '');
  return { userId: String(request.headers['x-wsadmin-user-id'] ?? 'dev-user'), role, ...(tenantId ? { tenantId } : {}) };
}

function guard(request: FastifyRequest, reply: FastifyReply, tenantId: string, capability: Capability) {
  const current = actor(request);
  if (!current) { reply.code(401).send({ error: 'authentication_required' }); return null; }
  try { authorize(current, tenantId, capability); return current; }
  catch (error) { if (error instanceof AccessDeniedError) { reply.code(403).send({ error: 'access_denied' }); return null; } throw error; }
}

function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof AdvancedBookingError) {
    const status = error.code === 'not_found' ? 404 : error.code === 'invalid_state' ? 409 : error.code === 'payment_unavailable' ? 503 : 400;
    return reply.code(status).send({ error: error.code, message: error.message });
  }
  if (error instanceof AvailabilityValidationError || error instanceof BookingValidationError) return reply.code(400).send({ error: 'booking_validation', message: error.message });
  if (error instanceof BookingUnavailableError || error instanceof BookingConflictError) return reply.code(409).send({ error: 'booking_unavailable', message: error.message });
  throw error;
}

export function registerAdvancedBookingRoutes(app: FastifyInstance, repo: AdvancedBookingRepository, booking: BookingService, publicOptions?: PublicBookingOptions) {
  const tentative = new TentativeBookingService(repo, input => booking.create(input as any));
  const members = new MembershipService(repo);
  const web = new WebBookingService(repo, input => booking.create(input));

  app.post('/api/v1/tenants/:tenantId/tentative-bookings', async (request, reply) => {
    const { tenantId } = request.params as any;
    if (!guard(request, reply, tenantId, 'BOOKING_WRITE')) return reply;
    try { return reply.code(201).send(await tentative.create({ tenantId, ...((request.body ?? {}) as any) })); }
    catch (error) { return fail(reply, error); }
  });
  app.post('/api/v1/tenants/:tenantId/tentative-bookings/:id/approve', async (request, reply) => {
    const { tenantId, id } = request.params as any;
    if (!guard(request, reply, tenantId, 'BOOKING_WRITE')) return reply;
    try { return tentative.approve(tenantId, id, Number((request.body as any)?.candidateIndex ?? 0)); }
    catch (error) { return fail(reply, error); }
  });
  app.post('/api/v1/tenants/:tenantId/memberships', async (request, reply) => {
    const { tenantId } = request.params as any;
    if (!guard(request, reply, tenantId, 'CUSTOMER_WRITE')) return reply;
    try { return reply.code(201).send(await members.create({ tenantId, ...((request.body ?? {}) as any) })); }
    catch (error) { return fail(reply, error); }
  });
  app.get('/api/v1/tenants/:tenantId/customers/:customerId/memberships', async (request, reply) => {
    const { tenantId, customerId } = request.params as any;
    if (!guard(request, reply, tenantId, 'TENANT_READ')) return reply;
    return members.list(tenantId, customerId);
  });
  app.post('/api/v1/tenants/:tenantId/memberships/:id/consume', async (request, reply) => {
    const { tenantId, id } = request.params as any;
    if (!guard(request, reply, tenantId, 'BOOKING_WRITE')) return reply;
    try { return members.consume(tenantId, id, String((request.body as any)?.bookingId ?? '')); }
    catch (error) { return fail(reply, error); }
  });

  if (publicOptions) {
    app.get('/api/v1/public/:tenantId/catalog', async request => {
      const { tenantId } = request.params as { tenantId: string };
      return { services: await publicOptions.listServices(tenantId), payment: { payNowAvailable: Boolean(publicOptions.payment) } };
    });
    app.get('/api/v1/public/:tenantId/staff', async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      const serviceId = String((request.query as any)?.serviceId ?? '');
      if (!serviceId) return reply.code(400).send({ error: 'serviceId_required' });
      return publicOptions.listStaff(tenantId, serviceId);
    });
    app.get('/api/v1/public/:tenantId/availability', async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string };
      const query = request.query as Record<string, string | undefined>;
      if (!query.serviceId || !query.localDate) return reply.code(400).send({ error: 'serviceId_and_localDate_required' });
      try {
        const result = await publicOptions.findSlots({ tenantId, serviceId: query.serviceId, localDate: query.localDate, ...(query.staffId ? { staffId: query.staffId } : {}), limit: 24 });
        return { localDate: query.localDate, timezone: result.timezone, slots: result.slots.map(slot => ({ staffId: slot.staffId, staffDisplayName: slot.staffDisplayName, staffPhotoUrl: slot.staffPhotoUrl, resourceId: slot.resourceId, startsAt: slot.startsAt, endsAt: slot.endsAt, durationMinutes: slot.durationMinutes, priceMinor: slot.priceMinor, currency: slot.currency })) };
      } catch (error) { return fail(reply, error); }
    });
  }

  app.post('/api/v1/public/:tenantId/book', async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const body = (request.body ?? {}) as any;
    const paymentChoice = String(body.paymentChoice ?? 'PAY_LATER').toUpperCase();
    if (!['PAY_NOW', 'PAY_LATER'].includes(paymentChoice)) return reply.code(400).send({ error: 'paymentChoice_invalid' });
    if (paymentChoice === 'PAY_NOW' && !publicOptions?.payment) return fail(reply, new AdvancedBookingError('online payment is not configured', 'payment_unavailable'));
    try {
      const created = await web.book({ tenantId, name: body.name, phone: body.phone, serviceId: body.serviceId, startsAt: body.startsAt, ...(body.staffId ? { staffId: body.staffId } : {}), ...(body.resourceId ? { resourceId: body.resourceId } : {}), ...(Array.isArray(body.optionIds) ? { optionIds: body.optionIds } : {}) });
      let payment: PublicPaymentResult | null = null;
      let paymentError: string | null = null;
      if (paymentChoice === 'PAY_NOW' && publicOptions?.payment) {
        try { payment = await publicOptions.payment.create({ tenantId, bookingId: created.id, customerId: created.customerId, amountMinor: created.priceMinor, currency: created.currency }); }
        catch { paymentError = 'payment_start_failed'; }
      }
      return reply.code(201).send({ booking: created, paymentChoice, payment, paymentError });
    } catch (error) { return fail(reply, error); }
  });
}
