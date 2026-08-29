import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { AuthenticationService } from '@wsadmin-business/auth';
import { HitPayRecurringGateway, OnboardingService, SaasBillingService, SaasError } from '@wsadmin-business/saas';
import { createAuthenticationRepository, createPool, createSaasBillingRepository, createSaasRepository } from '@wsadmin-business/database';

async function main() {
  const pool = createPool();
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const email = `tenant-auth-${suffix}@example.test`;
  const subject = `google-${suffix}`;
  const planCode = `BILLING_UAT_${suffix.toUpperCase()}`;
  const sessionToken = `session-${randomUUID()}-${randomUUID()}`;
  const webhookSalt = `uat-salt-${suffix}`;
  let userId: string | null = null;
  let tenantId: string | null = null;
  let checkoutId: string | null = null;
  let checkoutReference: string | null = null;

  try {
    const auth = new AuthenticationService(createAuthenticationRepository(pool), {
      tokenFactory: () => sessionToken,
      now: () => new Date('2026-08-29T00:00:00.000Z'),
    });
    const login = await auth.loginWithGoogle({
      subject,
      email,
      emailVerified: true,
      displayName: 'Tenant Billing UAT',
      avatarUrl: null,
    });
    userId = login.actor.userId;
    tenantId = login.actor.tenantId ?? null;
    assert.ok(tenantId);
    assert.equal(login.actor.role, 'TENANT_OWNER');

    const provisioned = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM businesses WHERE tenant_id=$1) business_count,
         (SELECT count(*)::int FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2 AND role='TENANT_OWNER') owner_count,
         (SELECT token_hash FROM auth_sessions WHERE tenant_id=$1 AND user_id=$2) token_hash,
         (SELECT status FROM tenant_subscriptions WHERE tenant_id=$1) subscription_status,
         (SELECT trial_ends_at FROM tenant_subscriptions WHERE tenant_id=$1) trial_ends_at`,
      [tenantId, userId],
    );
    assert.equal(provisioned.rows[0].business_count, 1);
    assert.equal(provisioned.rows[0].owner_count, 1);
    assert.notEqual(provisioned.rows[0].token_hash, sessionToken);
    assert.match(provisioned.rows[0].token_hash, /^[0-9a-f]{64}$/);
    assert.equal(provisioned.rows[0].subscription_status, 'TRIAL');
    assert.equal(new Date(provisioned.rows[0].trial_ends_at).toISOString(), '2026-09-08T00:00:00.000Z');
    assert.equal((await auth.resolve(sessionToken))?.tenantId, tenantId);

    const onboarding = new OnboardingService(createSaasRepository(pool));
    await onboarding.save(tenantId, 'BUSINESS_PROFILE', {
      businessName: 'Klinik Maju Acceptance',
      registrationNumber: '202601234567',
      contactEmail: email,
      phoneE164: '+60123456789',
      websiteUrl: 'https://example.test',
      addressLine1: '12 Jalan Maju',
      addressLine2: '',
      city: 'Shah Alam',
      state: 'Selangor',
      postcode: '40100',
      countryCode: 'MY',
      timezone: 'Asia/Kuala_Lumpur',
    });
    await onboarding.save(tenantId, 'BUSINESS_TYPE', { businessType: 'HEALTHCARE' });
    await onboarding.save(tenantId, 'BUSINESS_SUBTYPE', { businessType: 'HEALTHCARE', businessSubtype: 'GENERAL_CLINIC' });
    await onboarding.save(tenantId, 'OFFERINGS', { businessType: 'HEALTHCARE', selectedOffers: ['CONSULTATION'] });
    await onboarding.save(tenantId, 'OFFERING_DETAILS', { businessType: 'HEALTHCARE', items: [{ sourceKey: 'CONSULTATION', name: 'General Consultation', description: 'Initial doctor consultation', priceMinor: 5000, durationMinutes: 30, capacity: 1, depositMinor: 1000, staffNames: ['Dr Aina'], active: true }] });
    await onboarding.save(tenantId, 'WORKFLOW', { businessType: 'HEALTHCARE', workflowKind: 'APPOINTMENT', workflowKinds: ['APPOINTMENT','ENQUIRY'], slotIntervalMinutes: 15, minimumLeadMinutes: 60, bookingHorizonDays: 90, cancellationDeadlineMinutes: 120, openTime: '09:00', closeTime: '18:00', workingDays: [1,2,3,4,5,6], autoConfirm: true });
    await onboarding.save(tenantId, 'PAYMENT', { businessType: 'HEALTHCARE', paymentTiming: 'DEPOSIT', depositType: 'FIXED', depositValue: 1000, paymentMethods: ['ONLINE_BANKING','CARD'], paymentPolicy: 'RM10 deposit is required before confirmation.' });
    await onboarding.save(tenantId, 'WHATSAPP_AI', { businessType: 'HEALTHCARE', whatsappEnabled: true, aiEnabled: true, tone: 'FRIENDLY', languages: ['ms','en'], handoffMessage: 'Team klinik akan membantu anda.', businessSummary: 'Klinik Maju provides general consultations by appointment. AI must not diagnose patients.', connectionStatus: 'DISCONNECTED' });
    await onboarding.save(tenantId, 'COMPLETE', {});
    const company = await pool.query(`SELECT t.name,t.default_timezone,b.name business_name,b.registration_number,b.contact_email,b.phone_e164,b.city,b.state,b.postcode,b.country_code,b.vertical,b.business_type,b.business_subtype,b.workflow_kind FROM tenants t JOIN businesses b ON b.tenant_id=t.id WHERE t.id=$1`, [tenantId]);
    assert.equal(company.rows[0].name, 'Klinik Maju Acceptance');
    assert.equal(company.rows[0].business_name, 'Klinik Maju Acceptance');
    assert.equal(company.rows[0].registration_number, '202601234567');
    assert.equal(company.rows[0].contact_email, email);
    assert.equal(company.rows[0].phone_e164, '+60123456789');
    assert.equal(company.rows[0].vertical, 'HEALTHCARE');
    assert.equal(company.rows[0].business_type, 'HEALTHCARE');
    assert.equal(company.rows[0].business_subtype, 'GENERAL_CLINIC');
    assert.equal(company.rows[0].workflow_kind, 'APPOINTMENT');
    const projected = await pool.query(`SELECT
      (SELECT count(*)::int FROM business_offerings WHERE tenant_id=$1 AND offering_type='SERVICE' AND active=true) offerings,
      (SELECT count(*)::int FROM services WHERE tenant_id=$1 AND name='General Consultation' AND active=true) services,
      (SELECT count(*)::int FROM staff_profiles WHERE tenant_id=$1 AND display_name='Dr Aina' AND active=true) staff,
      (SELECT count(*)::int FROM staff_working_hours WHERE tenant_id=$1) working_hours,
      (SELECT count(*)::int FROM booking_policies WHERE tenant_id=$1 AND slot_interval_minutes=15) booking_policy`, [tenantId]);
    assert.deepEqual(projected.rows[0], { offerings: 1, services: 1, staff: 1, working_hours: 6, booking_policy: 1 });

    await pool.query(
      `INSERT INTO saas_plans(code,name,monthly_price_minor,currency,entitlements)
       VALUES($1,'Billing UAT',5900,'MYR','{"bookings_monthly":100}'::jsonb)`,
      [planCode],
    );

    const gateway = new HitPayRecurringGateway({
      apiKey: 'uat-api-key',
      webhookSalt,
      baseUrl: 'https://api.sandbox.hit-pay.com',
      fetch: async (_url, init) => {
        const request = JSON.parse(String(init?.body ?? '{}'));
        assert.equal(request.reference.startsWith('wsb:'), true);
        assert.equal(request.amount, 59);
        assert.equal(request.currency, 'MYR');
        assert.equal(request.cycle, 'monthly');
        return new Response(JSON.stringify({ id: `hitpay-sub-${suffix}`, url: `https://secure.example.test/${suffix}` }), { status: 201 });
      },
    });
    const billingRepo = createSaasBillingRepository(pool);
    const billing = new SaasBillingService(billingRepo, () => gateway);
    const checkout = await billing.createCheckout({
      tenantId,
      planCode,
      provider: 'HITPAY',
      customerEmail: email,
      customerName: 'Tenant Billing UAT',
      createdByUserId: userId,
      redirectUrl: 'https://wsadmin-biz.imai.my/?billing=return',
    });
    checkoutId = checkout.id;
    checkoutReference = checkout.reference;
    assert.equal(checkout.status, 'ACTION_REQUIRED');
    assert.equal((await billing.createCheckout({
      tenantId,
      planCode,
      provider: 'HITPAY',
      customerEmail: email,
      customerName: 'Tenant Billing UAT',
      createdByUserId: userId,
      redirectUrl: 'https://wsadmin-biz.imai.my/?billing=return',
    })).id, checkout.id);
    await assert.rejects(
      () => billingRepo.createBillingCheckout({ tenantId, planCode, provider: 'HITPAY', amountMinor: 5900, currency: 'MYR', customerEmail: email, createdByUserId: userId }),
      error => error instanceof SaasError && error.code === 'checkout_in_progress',
    );

    const raw = Buffer.from(JSON.stringify({
      id: `hitpay-charge-${suffix}`,
      recurring_billing_id: checkout.providerSubscriptionId,
      reference: checkout.reference,
      amount: 59,
      currency: 'MYR',
      status: 'succeeded',
      created_at: '2026-08-29T00:05:00.000Z',
    }));
    const signature = createHmac('sha256', webhookSalt).update(raw).digest('hex');
    const headers = {
      'hitpay-signature': signature,
      'hitpay-event-object': 'charge',
      'hitpay-event-type': 'created',
    };
    const first = await billing.reconcile('HITPAY', raw, headers);
    const duplicate = await billing.reconcile('HITPAY', raw, headers);
    assert.deepEqual(first, { accepted: true, duplicate: false, unmatched: false, status: 'ACTIVE' });
    assert.deepEqual(duplicate, { accepted: true, duplicate: true });

    const stored = await pool.query(
      `SELECT s.status subscription_status,c.status checkout_status,
              (SELECT count(*)::int FROM saas_billing_invoices WHERE checkout_id=c.id AND status='PAID') paid_invoices,
              (SELECT count(*)::int FROM saas_billing_events WHERE checkout_id=c.id) event_count
       FROM tenant_subscriptions s
       JOIN saas_billing_checkouts c ON c.tenant_id=s.tenant_id
       WHERE s.tenant_id=$1 AND c.id=$2`,
      [tenantId, checkout.id],
    );
    assert.equal(stored.rows[0].subscription_status, 'ACTIVE');
    assert.equal(stored.rows[0].checkout_status, 'ACTIVE');
    assert.equal(stored.rows[0].paid_invoices, 1);
    assert.equal(stored.rows[0].event_count, 1);

    console.log(JSON.stringify({
      status: 'PASS',
      googleTenantProvisioned: true,
      tenDayTrialProvisioned: true,
      tenantCompanyDetailsPersisted: true,
      dynamicIndustrySetupProjected: true,
      opaqueSessionStoredAsHash: true,
      hitPayRecurringCheckout: true,
      duplicateCheckoutPrevented: true,
      verifiedWebhookActivatedSubscription: true,
      duplicateWebhookIgnored: true,
    }));
  } finally {
    if (checkoutId || checkoutReference) {
      await pool.query('DELETE FROM saas_billing_events WHERE checkout_id=$1 OR reference=$2', [checkoutId, checkoutReference]).catch(() => undefined);
    }
    if (tenantId) await pool.query('DELETE FROM tenants WHERE id=$1', [tenantId]).catch(() => undefined);
    if (userId) await pool.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => undefined);
    await pool.query('DELETE FROM saas_plans WHERE code=$1', [planCode]).catch(() => undefined);
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
