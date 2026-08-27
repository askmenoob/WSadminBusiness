import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AvailabilityEngine } from '@wsadmin-business/availability';
import { BookingService } from '@wsadmin-business/booking';
import { createAvailabilityRepository,createBookingRepository,createPool } from '@wsadmin-business/database';
async function main(){
  const pool=createPool();
  const tenantId=randomUUID();
  const otherTenantId=randomUUID();
  const checks:string[]=[];
  try{
    await pool.query(`INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)`,[tenantId,'Booking Core Acceptance',`accept-${tenantId.slice(0,8)}`]);
    const serviceQ=await pool.query(`INSERT INTO services(tenant_id,name,duration_minutes,buffer_before_minutes,buffer_after_minutes,price_minor,currency) VALUES($1,'Acceptance Massage',60,15,15,12000,'MYR') RETURNING id`,[tenantId]);
    const serviceId=serviceQ.rows[0].id as string;
    const staffQ=await pool.query(`INSERT INTO staff_profiles(tenant_id,display_name,booking_capacity) VALUES($1,'Acceptance Aina',1) RETURNING id`,[tenantId]);
    const staffId=staffQ.rows[0].id as string;
    await pool.query(`INSERT INTO staff_services(tenant_id,staff_id,service_id) VALUES($1,$2,$3)`,[tenantId,staffId,serviceId]);
    await pool.query(`INSERT INTO staff_working_hours(tenant_id,staff_id,weekday,start_minute,end_minute) VALUES($1,$2,1,540,1080)`,[tenantId,staffId]);
    const resourceQ=await pool.query(`INSERT INTO resources(tenant_id,name,type,capacity) VALUES($1,'Acceptance Room','ROOM',1) RETURNING id`,[tenantId]);
    const resourceId=resourceQ.rows[0].id as string;
    await pool.query(`INSERT INTO resource_services(tenant_id,resource_id,service_id) VALUES($1,$2,$3)`,[tenantId,resourceId,serviceId]);
    const availabilityRepo=createAvailabilityRepository(pool);
    const bookingRepo=createBookingRepository(pool);
    const availability=new AvailabilityEngine(availabilityRepo);
    const bookings=new BookingService(availabilityRepo,bookingRepo);
    const initial=await availability.check({tenantId,serviceId,startsAt:'2026-08-31T02:00:00Z'});
    assert.equal(initial.available,true);checks.push('initial_availability');
    const concurrent=await Promise.allSettled([
      bookings.create({tenantId,serviceId,startsAt:'2026-08-31T02:00:00Z',actorUserId:'acceptance-a'}),
      bookings.create({tenantId,serviceId,startsAt:'2026-08-31T02:00:00Z',actorUserId:'acceptance-b'})
    ]);
    const success=concurrent.filter((r):r is PromiseFulfilledResult<any>=>r.status==='fulfilled');
    const failed=concurrent.filter((r):r is PromiseRejectedResult=>r.status==='rejected');
    assert.equal(success.length,1);assert.equal(failed.length,1);checks.push('concurrency_guard');
    const winner=success[0].value;
    assert.equal((await bookingRepo.get(tenantId,winner.id))?.id,winner.id);
    assert.equal(await bookingRepo.get(otherTenantId,winner.id),null);checks.push('tenant_isolation');
    const moved=await bookings.reschedule({tenantId,bookingId:winner.id,startsAt:'2026-08-31T04:00:00Z',actorUserId:'acceptance-owner'});
    assert.equal(moved.startsAt.toISOString(),'2026-08-31T04:00:00.000Z');checks.push('reschedule');
    const originalSlot=await availability.check({tenantId,serviceId,startsAt:'2026-08-31T02:00:00Z'});
    assert.equal(originalSlot.available,true);checks.push('reschedule_releases_old_slot');
    const cancelled=await bookings.cancel(tenantId,winner.id,'acceptance-owner','acceptance cancellation');
    assert.equal(cancelled.status,'CANCELLED');checks.push('cancel');
    const completed=await bookings.create({tenantId,serviceId,startsAt:'2026-08-31T06:00:00Z',actorUserId:'acceptance-owner'});
    assert.equal((await bookings.complete(tenantId,completed.id,'acceptance-owner')).status,'COMPLETED');checks.push('complete');
    const missed=await bookings.create({tenantId,serviceId,startsAt:'2026-08-31T08:00:00Z',actorUserId:'acceptance-owner'});
    assert.equal((await bookings.noShow(tenantId,missed.id,'acceptance-owner')).status,'NO_SHOW');checks.push('no_show');
    const audit=await bookings.audit(tenantId,winner.id);
    assert.deepEqual(audit.map(x=>x.eventType),['CREATED','RESCHEDULED','STATUS_CANCELLED']);checks.push('audit_trail');
    await pool.query(`INSERT INTO staff_time_blocks(tenant_id,staff_id,type,starts_at,ends_at,reason) VALUES($1,$2,'LEAVE','2026-08-31T07:30:00Z','2026-08-31T09:00:00Z','Acceptance leave')`,[tenantId,staffId]);
    const blocked=await availability.check({tenantId,serviceId,startsAt:'2026-08-31T08:00:00Z'});
    assert.equal(blocked.available,false);checks.push('leave_blocks_availability');
    const countQ=await pool.query(`SELECT count(*)::int AS count FROM bookings WHERE tenant_id=$1`,[tenantId]);
    assert.equal(Number(countQ.rows[0].count),3);checks.push('expected_booking_count');
    console.log(JSON.stringify({status:'PASS',tenantId,checks,concurrency:{fulfilled:success.length,rejected:failed.length},bookingCount:Number(countQ.rows[0].count)}));
  }finally{
    await pool.query('DELETE FROM tenants WHERE id=$1',[tenantId]).catch(()=>undefined);
    await pool.end();
  }
}
main().catch(error=>{console.error(error);process.exit(1);});
