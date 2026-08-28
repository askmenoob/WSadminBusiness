import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAdvancedBookingRoutes, type PublicBookingOptions } from './advanced-booking-routes.js';

const repository: any = {
  async findOrCreateWebCustomer(_tenantId: string, input: { name: string; phone: string }) { return { id: `customer:${input.phone}` }; },
};

function publicOptions(overrides: Partial<PublicBookingOptions> = {}): PublicBookingOptions {
  return {
    async listServices() { return [{ id: 'service-1', name: 'Consultation', description: 'Initial visit', durationMinutes: 60, priceMinor: 12500, currency: 'MYR' }]; },
    async listStaff() { return [{ id: 'staff-1', displayName: 'Aina', photoUrl: null }]; },
    async findSlots() {
      return { timezone: 'Asia/Kuala_Lumpur', slots: [{ staffId: 'staff-1', staffDisplayName: 'Aina', staffPhotoUrl: null, resourceId: null, startsAt: new Date('2026-09-02T02:00:00Z'), endsAt: new Date('2026-09-02T03:00:00Z'), durationMinutes: 60, priceMinor: 12500, currency: 'MYR' } as any] };
    },
    ...overrides,
  };
}

test('public catalog, eligible staff and availability require no login and expose safe fields', async () => {
  const app = Fastify();
  registerAdvancedBookingRoutes(app, repository, { create: async () => ({}) } as any, publicOptions());
  let response = await app.inject({ method: 'GET', url: '/api/v1/public/tenant-a/catalog' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().services[0].name, 'Consultation');
  response = await app.inject({ method: 'GET', url: '/api/v1/public/tenant-a/staff?serviceId=service-1' });
  assert.deepEqual(Object.keys(response.json()[0]).sort(), ['displayName', 'id', 'photoUrl']);
  response = await app.inject({ method: 'GET', url: '/api/v1/public/tenant-a/availability?serviceId=service-1&localDate=2026-09-02&staffId=staff-1' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().timezone, 'Asia/Kuala_Lumpur');
  assert.equal(response.json().slots[0].priceMinor, 12500);
  await app.close();
});

test('public booking reuses WEB booking core price for optional payment', async () => {
  const app = Fastify();
  let bookingInput: any;
  let paymentInput: any;
  const booking = { create: async (input: any) => { bookingInput = input; return { id: 'booking-1', customerId: input.customerId, priceMinor: 12500, currency: 'MYR', status: 'CONFIRMED', startsAt: new Date(input.startsAt), endsAt: new Date('2026-09-02T03:00:00Z') }; } };
  const payment = { provider: 'MOCK', create: async (input: any) => { paymentInput = input; return { payment: { id: 'payment-1', status: 'PENDING' }, link: { paymentId: 'payment-1', url: 'https://pay.example/1', expiresAt: null } }; } };
  registerAdvancedBookingRoutes(app, repository, booking as any, publicOptions({ payment }));
  const response = await app.inject({ method: 'POST', url: '/api/v1/public/tenant-a/book', payload: { name: 'Nur', phone: '+60123456789', serviceId: 'service-1', staffId: 'staff-1', startsAt: '2026-09-02T02:00:00Z', paymentChoice: 'PAY_NOW', amountMinor: 1 } });
  assert.equal(response.statusCode, 201);
  assert.equal(bookingInput.source, 'WEB');
  assert.equal(paymentInput.amountMinor, 12500);
  assert.equal(response.json().payment.link.url, 'https://pay.example/1');
  await app.close();
});

test('public pay-now is rejected before booking when no gateway is configured', async () => {
  const app = Fastify();
  let created = false;
  registerAdvancedBookingRoutes(app, repository, { create: async () => { created = true; return {}; } } as any, publicOptions());
  const response = await app.inject({ method: 'POST', url: '/api/v1/public/tenant-a/book', payload: { name: 'Nur', phone: '+60123456789', serviceId: 'service-1', startsAt: '2026-09-02T02:00:00Z', paymentChoice: 'PAY_NOW' } });
  assert.equal(response.statusCode, 503);
  assert.equal(created, false);
  await app.close();
});
