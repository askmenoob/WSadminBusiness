import type { Pool, PoolClient } from 'pg';
import type { OnboardingState, Plan, SaasRepository, Subscription, TenantBusinessContext } from '@wsadmin-business/saas';
import { getBusinessTypeDefinition } from '@wsadmin-business/verticals';

const onboarding = (row: any): OnboardingState => ({ tenantId: row.tenant_id, currentStep: row.current_step, completed: row.completed, data: row.data ?? {}, updatedAt: row.updated_at });
const plan = (row: any): Plan => ({ id: row.id, code: row.code, name: row.name, monthlyPriceMinor: Number(row.monthly_price_minor), currency: row.currency, entitlements: row.entitlements ?? {}, active: row.active });
const sub = (row: any): Subscription => ({ tenantId: row.tenant_id, planCode: row.plan_code, status: row.status, trialEndsAt: row.trial_ends_at, currentPeriodEndsAt: row.current_period_ends_at, cancelAtPeriodEnd: row.cancel_at_period_end, updatedAt: row.updated_at });
const minute = (value: string) => { const [hour, minutes] = value.split(':').map(Number); return hour! * 60 + minutes!; };

async function primaryBusiness(client: PoolClient, tenantId: string, lock = false) {
  const result = await client.query(`SELECT * FROM businesses WHERE tenant_id=$1 ORDER BY created_at,id LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [tenantId]);
  return result.rows[0] ?? null;
}

async function projectBusinessProfile(client: PoolClient, tenantId: string, payload: any) {
  await client.query('UPDATE tenants SET name=$2,default_timezone=$3,updated_at=now() WHERE id=$1', [tenantId, payload.businessName, payload.timezone]);
  let business = await primaryBusiness(client, tenantId, true);
  if (business) {
    const updated = await client.query(`UPDATE businesses SET name=$2,registration_number=$3,contact_email=$4,phone_e164=$5,website_url=$6,address_line_1=$7,address_line_2=$8,city=$9,state=$10,postcode=$11,country_code=$12,updated_at=now() WHERE id=$1 RETURNING *`, [business.id, payload.businessName, payload.registrationNumber || null, payload.contactEmail, payload.phoneE164, payload.websiteUrl || null, payload.addressLine1 || null, payload.addressLine2 || null, payload.city || null, payload.state || null, payload.postcode || null, payload.countryCode]);
    business = updated.rows[0];
  } else {
    const inserted = await client.query(`INSERT INTO businesses(tenant_id,name,registration_number,contact_email,phone_e164,website_url,address_line_1,address_line_2,city,state,postcode,country_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [tenantId, payload.businessName, payload.registrationNumber || null, payload.contactEmail, payload.phoneE164, payload.websiteUrl || null, payload.addressLine1 || null, payload.addressLine2 || null, payload.city || null, payload.state || null, payload.postcode || null, payload.countryCode]);
    business = inserted.rows[0];
  }
  const address = [payload.addressLine1, payload.addressLine2, payload.postcode, payload.city, payload.state, payload.countryCode].filter(Boolean).join(', ') || null;
  await client.query(`INSERT INTO locations(tenant_id,business_id,name,code,timezone,address) VALUES($1,$2,$3,'MAIN',$4,$5) ON CONFLICT(tenant_id,code) DO UPDATE SET business_id=excluded.business_id,name=excluded.name,timezone=excluded.timezone,address=excluded.address,active=true,updated_at=now()`, [tenantId, business.id, payload.businessName, payload.timezone, address]);
}

async function projectBusinessType(client: PoolClient, tenantId: string, payload: any) {
  const definition = getBusinessTypeDefinition(payload.businessType);
  await client.query(`UPDATE businesses SET vertical=$2,business_type=$2,offering_kind=$3,workflow_kind=$4,setup_config=setup_config||jsonb_build_object('businessType',$2),updated_at=now() WHERE id=(SELECT id FROM businesses WHERE tenant_id=$1 ORDER BY created_at,id LIMIT 1)`, [tenantId, definition.key, definition.offeringKind, definition.defaultWorkflow]);
}

async function projectBusinessSubtype(client: PoolClient, tenantId: string, payload: any) {
  await client.query(`UPDATE businesses SET business_type=$2,business_subtype=$3,setup_config=setup_config||jsonb_build_object('businessSubtype',$3),updated_at=now() WHERE id=(SELECT id FROM businesses WHERE tenant_id=$1 ORDER BY created_at,id LIMIT 1)`, [tenantId, payload.businessType, payload.businessSubtype]);
}

async function upsertService(client: PoolClient, tenantId: string, item: any, existingSourceId: string | null) {
  let found = existingSourceId ? await client.query('SELECT id FROM services WHERE tenant_id=$1 AND id=$2', [tenantId, existingSourceId]) : await client.query('SELECT id FROM services WHERE tenant_id=$1 AND lower(name)=lower($2) LIMIT 1', [tenantId, item.name]);
  const duration = Number(item.durationMinutes ?? item.preparationMinutes ?? 60);
  if (found.rowCount) {
    const updated = await client.query(`UPDATE services SET name=$3,description=$4,duration_minutes=$5,price_minor=$6,currency='MYR',active=$7,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id`, [tenantId, found.rows[0].id, item.name, item.description || null, duration, item.priceMinor, item.active]);
    return updated.rows[0].id as string;
  }
  const inserted = await client.query(`INSERT INTO services(tenant_id,name,description,duration_minutes,price_minor,currency,active) VALUES($1,$2,$3,$4,$5,'MYR',$6) RETURNING id`, [tenantId, item.name, item.description || null, duration, item.priceMinor, item.active]);
  return inserted.rows[0].id as string;
}

async function linkOfferingStaff(client: PoolClient, tenantId: string, serviceId: string, names: string[]) {
  for (const [index, displayName] of names.entries()) {
    let staff = await client.query('SELECT id FROM staff_profiles WHERE tenant_id=$1 AND lower(display_name)=lower($2) ORDER BY created_at LIMIT 1', [tenantId, displayName]);
    if (!staff.rowCount) staff = await client.query(`INSERT INTO staff_profiles(tenant_id,display_name,active,booking_capacity,sort_order) VALUES($1,$2,true,1,$3) RETURNING id`, [tenantId, displayName, index]);
    await client.query('INSERT INTO staff_services(tenant_id,staff_id,service_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [tenantId, staff.rows[0].id, serviceId]);
  }
}

async function upsertProperty(client: PoolClient, tenantId: string, subtype: string, item: any) {
  const features = [...new Set([...(item.amenities ?? []), ...(item.privatePool ? ['Private pool'] : [])])];
  const result = await client.query(`
    INSERT INTO properties(tenant_id,property_code,name,description,location_name,google_maps_url,property_type,room_type,unit_count,room_count,beds,bathrooms,max_guests,private_pool,features,photos,weekday_price_minor,weekend_price_minor,public_holiday_price_minor,peak_season_price_minor,extra_guest_charge_minor,deposit_minor,cleaning_fee_minor,check_in_time,check_out_time,availability_rules,booking_rules,active)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,'[]'::jsonb,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb,$26::jsonb,$27)
    ON CONFLICT(tenant_id,property_code) DO UPDATE SET name=excluded.name,description=excluded.description,location_name=excluded.location_name,google_maps_url=excluded.google_maps_url,property_type=excluded.property_type,room_type=excluded.room_type,unit_count=excluded.unit_count,room_count=excluded.room_count,beds=excluded.beds,bathrooms=excluded.bathrooms,max_guests=excluded.max_guests,private_pool=excluded.private_pool,features=excluded.features,weekday_price_minor=excluded.weekday_price_minor,weekend_price_minor=excluded.weekend_price_minor,public_holiday_price_minor=excluded.public_holiday_price_minor,peak_season_price_minor=excluded.peak_season_price_minor,extra_guest_charge_minor=excluded.extra_guest_charge_minor,deposit_minor=excluded.deposit_minor,cleaning_fee_minor=excluded.cleaning_fee_minor,check_in_time=excluded.check_in_time,check_out_time=excluded.check_out_time,availability_rules=excluded.availability_rules,booking_rules=excluded.booking_rules,active=excluded.active,updated_at=now()
    RETURNING id`, [tenantId, item.propertyCode, item.name, item.description || null, item.locationName, item.googleMapsUrl || null, subtype || 'OTHER_PROPERTY', item.roomType, item.unitCount, item.roomCount, item.bedrooms, item.bathrooms, item.maxGuests, item.privatePool, JSON.stringify(features), item.weekdayPriceMinor, item.weekendPriceMinor, item.publicHolidayPriceMinor, item.peakSeasonPriceMinor, item.extraGuestChargeMinor, item.depositMinor, item.cleaningFeeMinor, item.checkInTime, item.checkOutTime, JSON.stringify({ text: item.availability }), JSON.stringify({ minimumNights: item.minimumNights, maximumNights: item.maximumNights, sameDayBooking: item.sameDayBooking, earlyCheckInAllowed: item.earlyCheckInAllowed, lateCheckOutAllowed: item.lateCheckOutAllowed, cancellationPolicy: item.cancellationPolicy, text: item.bookingRules }), item.active]);
  return result.rows[0].id as string;
}

async function projectOfferingDetails(client: PoolClient, tenantId: string, payload: any) {
  const business = await primaryBusiness(client, tenantId, true);
  if (!business) throw new Error('primary business is not configured');
  await client.query(`UPDATE services SET active=false,updated_at=now() WHERE tenant_id=$1 AND id IN(SELECT source_id FROM business_offerings WHERE tenant_id=$1 AND business_id=$2 AND source_domain='SERVICE' AND source_id IS NOT NULL)`, [tenantId, business.id]);
  await client.query(`UPDATE properties SET active=false,updated_at=now() WHERE tenant_id=$1 AND id IN(SELECT source_id FROM business_offerings WHERE tenant_id=$1 AND business_id=$2 AND source_domain='PROPERTY' AND source_id IS NOT NULL)`, [tenantId, business.id]);
  await client.query('UPDATE business_offerings SET active=false,updated_at=now() WHERE tenant_id=$1 AND business_id=$2', [tenantId, business.id]);
  for (const item of payload.items) {
    const previous = await client.query('SELECT source_domain,source_id FROM business_offerings WHERE tenant_id=$1 AND business_id=$2 AND source_key=$3', [tenantId, business.id, item.sourceKey]);
    let sourceDomain: string | null = null;
    let sourceId: string | null = null;
    if (payload.offeringKind === 'PROPERTY') {
      sourceDomain = 'PROPERTY';
      sourceId = await upsertProperty(client, tenantId, business.business_subtype, item);
    } else if (['SERVICE','CLASS','PACKAGE'].includes(payload.offeringKind)) {
      sourceDomain = 'SERVICE';
      sourceId = await upsertService(client, tenantId, item, previous.rows[0]?.source_domain === 'SERVICE' ? previous.rows[0].source_id : null);
      await linkOfferingStaff(client, tenantId, sourceId, item.staffNames ?? []);
    }
    const price = payload.offeringKind === 'PROPERTY' ? item.weekdayPriceMinor : item.priceMinor;
    const capacity = payload.offeringKind === 'PROPERTY' ? item.maxGuests : item.capacity;
    const attributes = { ...item, ...(item.attributes ?? {}) };
    delete attributes.attributes;
    await client.query(`
      INSERT INTO business_offerings(tenant_id,business_id,source_key,offering_type,name,description,price_minor,currency,duration_minutes,capacity,deposit_minor,attributes,source_domain,source_id,active)
      VALUES($1,$2,$3,$4,$5,$6,$7,'MYR',$8,$9,$10,$11::jsonb,$12,$13,$14)
      ON CONFLICT(tenant_id,business_id,source_key) DO UPDATE SET offering_type=excluded.offering_type,name=excluded.name,description=excluded.description,price_minor=excluded.price_minor,duration_minutes=excluded.duration_minutes,capacity=excluded.capacity,deposit_minor=excluded.deposit_minor,attributes=excluded.attributes,source_domain=excluded.source_domain,source_id=excluded.source_id,active=excluded.active,updated_at=now()`, [tenantId, business.id, item.sourceKey, payload.offeringKind, item.name, item.description || null, price, item.durationMinutes ?? item.preparationMinutes ?? null, capacity, item.depositMinor ?? 0, JSON.stringify(attributes), sourceDomain, sourceId, item.active]);
  }
}

async function projectWorkflow(client: PoolClient, tenantId: string, payload: any) {
  await client.query(`UPDATE businesses SET workflow_kind=$2,setup_config=setup_config||jsonb_build_object('workflow',$3::jsonb),updated_at=now() WHERE id=(SELECT id FROM businesses WHERE tenant_id=$1 ORDER BY created_at,id LIMIT 1)`, [tenantId, payload.workflowKind, JSON.stringify(payload)]);
  await client.query(`INSERT INTO booking_policies(tenant_id,booking_horizon_days,slot_interval_minutes,minimum_lead_minutes,cancellation_deadline_minutes) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id) DO UPDATE SET booking_horizon_days=excluded.booking_horizon_days,slot_interval_minutes=excluded.slot_interval_minutes,minimum_lead_minutes=excluded.minimum_lead_minutes,cancellation_deadline_minutes=excluded.cancellation_deadline_minutes,updated_at=now()`, [tenantId, payload.bookingHorizonDays, payload.slotIntervalMinutes, payload.minimumLeadMinutes, payload.cancellationDeadlineMinutes]);
  const staff = await client.query('SELECT id FROM staff_profiles WHERE tenant_id=$1 AND active=true', [tenantId]);
  const start = minute(payload.openTime), end = minute(payload.closeTime);
  for (const row of staff.rows) {
    await client.query('DELETE FROM staff_working_hours WHERE tenant_id=$1 AND staff_id=$2', [tenantId, row.id]);
    for (const weekday of payload.workingDays) await client.query('INSERT INTO staff_working_hours(tenant_id,staff_id,weekday,start_minute,end_minute) VALUES($1,$2,$3,$4,$5)', [tenantId, row.id, weekday, start, end]);
  }
}

async function projectConfig(client: PoolClient, tenantId: string, key: 'selectedOffers' | 'payment' | 'whatsappAi', payload: any) {
  await client.query(`UPDATE businesses SET setup_config=setup_config||jsonb_build_object($2,$3::jsonb),updated_at=now() WHERE id=(SELECT id FROM businesses WHERE tenant_id=$1 ORDER BY created_at,id LIMIT 1)`, [tenantId, key, JSON.stringify(payload)]);
}

async function projectOnboarding(client: PoolClient, tenantId: string, step: string, payload: any) {
  if (!payload) return;
  if (step === 'BUSINESS_PROFILE') return projectBusinessProfile(client, tenantId, payload);
  if (step === 'BUSINESS_TYPE') return projectBusinessType(client, tenantId, payload);
  if (step === 'BUSINESS_SUBTYPE') return projectBusinessSubtype(client, tenantId, payload);
  if (step === 'OFFERINGS') return projectConfig(client, tenantId, 'selectedOffers', payload);
  if (step === 'OFFERING_DETAILS') return projectOfferingDetails(client, tenantId, payload);
  if (step === 'WORKFLOW') return projectWorkflow(client, tenantId, payload);
  if (step === 'PAYMENT') return projectConfig(client, tenantId, 'payment', payload);
  if (step === 'WHATSAPP_AI') return projectConfig(client, tenantId, 'whatsappAi', payload);
}

export function createSaasRepository(pool: Pool): SaasRepository {
  return {
    async getOnboarding(tenantId) {
      const result = await pool.query('SELECT * FROM tenant_onboarding WHERE tenant_id=$1', [tenantId]);
      return result.rowCount ? onboarding(result.rows[0]) : { tenantId, currentStep: 'BUSINESS_PROFILE', completed: false, data: {}, updatedAt: new Date(0) };
    },
    async getBusinessContext(tenantId): Promise<TenantBusinessContext | null> {
      const businessResult = await pool.query('SELECT * FROM businesses WHERE tenant_id=$1 ORDER BY created_at,id LIMIT 1', [tenantId]);
      if (!businessResult.rowCount) return null;
      const business = businessResult.rows[0];
      const definition = getBusinessTypeDefinition(business.business_type ?? 'GENERAL');
      const offeringResult = await pool.query('SELECT * FROM business_offerings WHERE tenant_id=$1 AND business_id=$2 ORDER BY active DESC,name,id LIMIT 200', [tenantId, business.id]);
      return {
        tenantId, businessId: business.id, name: business.name, businessType: definition.key,
        businessSubtype: business.business_subtype, offeringKind: business.offering_kind,
        workflowKind: business.workflow_kind, setupConfig: business.setup_config ?? {}, labels: definition.labels,
        offerings: offeringResult.rows.map((row: any) => ({ id: row.id, sourceKey: row.source_key, offeringType: row.offering_type, name: row.name, description: row.description, priceMinor: Number(row.price_minor), currency: row.currency, durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes), capacity: Number(row.capacity), depositMinor: Number(row.deposit_minor), attributes: row.attributes ?? {}, active: row.active })),
      };
    },
    async saveOnboarding(tenantId, step, data, completed) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await projectOnboarding(client, tenantId, step, (data as any)[step]);
        const result = await client.query(`INSERT INTO tenant_onboarding(tenant_id,current_step,completed,data) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(tenant_id) DO UPDATE SET current_step=excluded.current_step,completed=excluded.completed,data=tenant_onboarding.data||excluded.data,updated_at=now() RETURNING *`, [tenantId, step, completed, JSON.stringify(data)]);
        await client.query('COMMIT');
        return onboarding(result.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
    async createPlan(input) {
      const result = await pool.query(`INSERT INTO saas_plans(code,name,monthly_price_minor,currency,entitlements) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(code) DO UPDATE SET name=excluded.name,monthly_price_minor=excluded.monthly_price_minor,currency=excluded.currency,entitlements=excluded.entitlements,active=true,updated_at=now() RETURNING *`, [input.code, input.name, input.monthlyPriceMinor, input.currency ?? 'MYR', JSON.stringify(input.entitlements)]);
      return plan(result.rows[0]);
    },
    async getPlan(code) { const result = await pool.query('SELECT * FROM saas_plans WHERE code=$1', [code]); return result.rowCount ? plan(result.rows[0]) : null; },
    async listPlans() { return (await pool.query('SELECT * FROM saas_plans WHERE active=true ORDER BY monthly_price_minor,code')).rows.map(plan); },
    async setSubscription(tenantId, input) {
      const result = await pool.query(`INSERT INTO tenant_subscriptions(tenant_id,plan_code,status,trial_ends_at,current_period_ends_at,cancel_at_period_end) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id) DO UPDATE SET plan_code=excluded.plan_code,status=excluded.status,trial_ends_at=excluded.trial_ends_at,current_period_ends_at=excluded.current_period_ends_at,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=now() RETURNING *`, [tenantId, input.planCode, input.status, input.trialEndsAt ?? null, input.currentPeriodEndsAt ?? null, input.cancelAtPeriodEnd ?? false]);
      return sub(result.rows[0]);
    },
    async getSubscription(tenantId) { const result = await pool.query('SELECT * FROM tenant_subscriptions WHERE tenant_id=$1', [tenantId]); return result.rowCount ? sub(result.rows[0]) : null; },
    async getUsage(tenantId, key, periodKey) { const result = await pool.query('SELECT amount FROM tenant_usage_counters WHERE tenant_id=$1 AND usage_key=$2 AND period_key=$3', [tenantId, key, periodKey]); return Number(result.rows[0]?.amount ?? 0); },
    async incrementUsage(tenantId, key, periodKey, amount = 1) { const result = await pool.query(`INSERT INTO tenant_usage_counters(tenant_id,usage_key,period_key,amount) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,usage_key,period_key) DO UPDATE SET amount=tenant_usage_counters.amount+$4,updated_at=now() RETURNING amount`, [tenantId, key, periodKey, amount]); return Number(result.rows[0].amount); },
    async upsertAiPrice(provider, model, inputMicrosPerMillion, outputMicrosPerMillion) { await pool.query(`INSERT INTO ai_model_prices(provider,model,input_micros_per_million,output_micros_per_million) VALUES($1,$2,$3,$4) ON CONFLICT(provider,model) DO UPDATE SET input_micros_per_million=excluded.input_micros_per_million,output_micros_per_million=excluded.output_micros_per_million,updated_at=now()`, [provider, model, inputMicrosPerMillion, outputMicrosPerMillion]); },
    async systemDashboard() {
      const [tenants, subscriptions, whatsapp, automation, ai] = await Promise.all([
        pool.query('SELECT count(*)::int n FROM tenants'), pool.query('SELECT status,count(*)::int n FROM tenant_subscriptions GROUP BY status'),
        pool.query('SELECT status,count(*)::int n FROM whatsapp_instances GROUP BY status'), pool.query("SELECT status,count(*)::int n FROM automation_jobs GROUP BY status"),
        pool.query(`SELECT count(*)::int requests,coalesce(sum(u.input_tokens),0)::bigint input_tokens,coalesce(sum(u.output_tokens),0)::bigint output_tokens,coalesce(avg(u.latency_ms),0)::numeric latency,coalesce(sum((u.input_tokens::numeric*p.input_micros_per_million+u.output_tokens::numeric*p.output_micros_per_million)/1000000),0)::bigint cost FROM ai_usage_logs u LEFT JOIN ai_model_prices p ON p.provider=u.provider AND p.model=u.model`),
      ]);
      const toMap = (rows: any[]) => Object.fromEntries(rows.map(row => [row.status, Number(row.n)]));
      const health = await pool.query(`SELECT t.id tenant_id,t.name,s.status subscription_status,s.plan_code,w.status whatsapp_status,coalesce(j.open_jobs,0)::int open_jobs,coalesce(a.requests,0)::int ai_requests,coalesce(a.cost,0)::bigint ai_cost FROM tenants t LEFT JOIN tenant_subscriptions s ON s.tenant_id=t.id LEFT JOIN whatsapp_instances w ON w.tenant_id=t.id LEFT JOIN LATERAL(SELECT count(*)::int open_jobs FROM automation_jobs x WHERE x.tenant_id=t.id AND x.status IN('QUEUED','CLAIMED','DEFERRED')) j ON true LEFT JOIN LATERAL(SELECT count(*)::int requests,coalesce(sum((u.input_tokens::numeric*p.input_micros_per_million+u.output_tokens::numeric*p.output_micros_per_million)/1000000),0)::bigint cost FROM ai_usage_logs u LEFT JOIN ai_model_prices p ON p.provider=u.provider AND p.model=u.model WHERE u.tenant_id=t.id) a ON true ORDER BY t.name`);
      const aiRow = ai.rows[0];
      return { tenants: Number(tenants.rows[0].n), subscriptions: toMap(subscriptions.rows), whatsapp: toMap(whatsapp.rows), automation: toMap(automation.rows), ai: { requests: Number(aiRow.requests), inputTokens: Number(aiRow.input_tokens), outputTokens: Number(aiRow.output_tokens), latencyAvgMs: Number(aiRow.latency), estimatedCostMicrousd: Number(aiRow.cost) }, tenantHealth: health.rows.map((row: any) => ({ tenantId: row.tenant_id, name: row.name, subscriptionStatus: row.subscription_status, planCode: row.plan_code, whatsappStatus: row.whatsapp_status, openJobs: Number(row.open_jobs), aiRequests: Number(row.ai_requests), aiCostMicrousd: Number(row.ai_cost) })) };
    },
  };
}
