import test from 'node:test';import assert from 'node:assert/strict';
import{DEFAULT_BOOKING_POLICY,BookingPolicyValidationError,cancellationAllowed,evaluateBookingStart,mergeBookingPolicy}from'./index.js';
const now=new Date('2026-08-28T01:00:00Z');
test('policy requires 5-minute slot multiples',()=>{assert.throws(()=>mergeBookingPolicy(DEFAULT_BOOKING_POLICY,{slotIntervalMinutes:7}),BookingPolicyValidationError);});
test('policy enforces lead, horizon and slot interval',()=>{
  const p={...DEFAULT_BOOKING_POLICY,minimumLeadMinutes:120,bookingHorizonDays:30,slotIntervalMinutes:30};
  assert.equal(evaluateBookingStart({startsAt:new Date('2026-08-28T02:00:00Z'),now,timeZone:'UTC',policy:p}).reason,'lead_time');
  assert.equal(evaluateBookingStart({startsAt:new Date('2026-08-29T02:15:00Z'),now,timeZone:'UTC',policy:p}).reason,'slot_interval');
  assert.equal(evaluateBookingStart({startsAt:new Date('2026-10-01T02:30:00Z'),now,timeZone:'UTC',policy:p}).reason,'horizon');
  assert.equal(evaluateBookingStart({startsAt:new Date('2026-08-29T02:30:00Z'),now,timeZone:'UTC',policy:p}).allowed,true);
});
test('same-day cutoff uses tenant-local clock',()=>{
  const p={...DEFAULT_BOOKING_POLICY,minimumLeadMinutes:0,sameDayCutoffMinute:600};
  const localNow=new Date('2026-08-28T03:00:00Z');
  const result=evaluateBookingStart({startsAt:new Date('2026-08-28T08:00:00Z'),now:localNow,timeZone:'Asia/Kuala_Lumpur',policy:p});
  assert.equal(result.reason,'same_day_cutoff');
});
test('cancellation deadline is deterministic',()=>{
  const p={...DEFAULT_BOOKING_POLICY,cancellationDeadlineMinutes:1440};
  assert.equal(cancellationAllowed({startsAt:new Date('2026-08-29T02:00:00Z'),now,policy:p}),true);
  assert.equal(cancellationAllowed({startsAt:new Date('2026-08-28T12:00:00Z'),now,policy:p}),false);
});
