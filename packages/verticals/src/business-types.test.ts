import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUSINESS_TYPE_KEYS,
  getBusinessTypeDefinition,
  isBusinessSubtype,
} from './index.js';

test('business type registry covers the supported operating models', () => {
  assert.deepEqual(BUSINESS_TYPE_KEYS, [
    'PROPERTY',
    'BEAUTY_WELLNESS',
    'AUTOMOTIVE',
    'FOOD_BEVERAGE',
    'RETAIL',
    'HEALTHCARE',
    'EDUCATION',
    'PROFESSIONAL_SERVICES',
    'HOME_SERVICES',
    'EVENT_BUSINESS',
    'GENERAL',
  ]);
  for (const key of BUSINESS_TYPE_KEYS) {
    const definition = getBusinessTypeDefinition(key);
    assert.ok(definition.subtypes.length > 1, `${key} requires industry sub-types`);
    assert.ok(definition.offeringPresets.length > 1, `${key} requires offering presets`);
    assert.ok(definition.workflows.includes(definition.defaultWorkflow));
    if (key !== 'PROPERTY') assert.ok(definition.customFields.length > 0, `${key} requires industry-specific fields`);
  }
});

test('industry engines expose distinct operational details and customer journeys', () => {
  const expected: Record<string,string[]> = {
    AUTOMOTIVE: ['vehicleInformation','requiredParts','serviceBayRequired'],
    FOOD_BEVERAGE: ['category','variants','addOns','orderChannels'],
    RETAIL: ['sku','category','salePriceMinor','variants'],
    HEALTHCARE: ['appointmentAvailability','patientInformation'],
    EDUCATION: ['subject','level','classSchedule','registrationFeeMinor'],
    PROFESSIONAL_SERVICES: ['pricingMode','qualificationQuestions'],
    HOME_SERVICES: ['serviceAreas','priceCalculation','customerAddressRequired'],
    EVENT_BUSINESS: ['includedItems','optionalAddOns','eventTypes'],
  };
  for (const [type, fields] of Object.entries(expected)) {
    const definition = getBusinessTypeDefinition(type);
    const keys = definition.customFields.map(field => field.key);
    for (const field of fields) assert.ok(keys.includes(field), `${type} must include ${field}`);
  }
  assert.ok(getBusinessTypeDefinition('EVENT_BUSINESS').workflows.includes('QUOTATION'));
  assert.ok(getBusinessTypeDefinition('FOOD_BEVERAGE').workflows.includes('WALK_IN'));
});

test('property setup uses property and booking language, never salon service language', () => {
  const property = getBusinessTypeDefinition('PROPERTY');
  assert.equal(property.offeringKind, 'PROPERTY');
  assert.equal(property.labels.offeringSingular, 'Property');
  assert.equal(property.labels.transactionSingular, 'Booking');
  assert.equal(property.defaultWorkflow, 'BOOKING');
  assert.equal(isBusinessSubtype(property.key, 'HOMESTAY'), true);
  assert.equal(isBusinessSubtype(property.key, 'SALON'), false);
  assert.ok(property.subtypes.some(row => row.key === 'VILLA'));
  assert.ok(property.offeringFields.includes('PUBLIC_HOLIDAY_PRICE'));
  assert.ok(property.offeringFields.includes('BOOKING_RULES'));
});

test('beauty setup exposes the requested services and appointment fields', () => {
  const beauty = getBusinessTypeDefinition('BEAUTY_WELLNESS');
  assert.equal(beauty.offeringKind, 'SERVICE');
  assert.equal(beauty.defaultWorkflow, 'APPOINTMENT');
  assert.deepEqual(beauty.offeringPresets.map(row => row.label), [
    'Haircut',
    'Hair Coloring',
    'Facial',
    'Massage',
    'Manicure / Pedicure',
    'Spa Treatment',
    'Makeup',
    'Other Services',
  ]);
  assert.ok(beauty.offeringFields.includes('DURATION'));
  assert.ok(beauty.offeringFields.includes('STAFF'));
  assert.ok(beauty.offeringFields.includes('DEPOSIT'));
});
