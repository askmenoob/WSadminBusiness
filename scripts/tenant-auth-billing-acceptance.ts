import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { AuthenticationService } from '@wsadmin-business/auth';
import { HitPayRecurringGateway, SaasBillingService, SaasError } from '@wsadmin-business/saas';
import { createAuthenticationRepository, createPool, createSaasBillingRepository } from '@wsadmin-business/database';

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
         (SELECT token_hash FROM auth_sessions WHERE tenant_id=$1 AND user_id=$2) token_hash`,
      [tenantId, userId],
    );
    assert.equal(provisioned.rows[0].business_count, 1);
    assert.equal(provisioned.rows[0].owner_count, 1);
    assert.notEqual(provisioned.rows[0].token_hash, sessionToken);
    assert.match(provisioned.rows[0].token_hash, /^[0-9a-f]{64}$/);
    assert.equal((await auth.resolve(sessionToken))?.tenantId, tenantId);

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
