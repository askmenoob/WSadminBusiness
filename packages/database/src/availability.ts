import type { Pool } from 'pg';
import { DEFAULT_BOOKING_POLICY } from '@wsadmin-business/booking-policy';
import type { AvailabilityControlBlock,AvailabilityRepository,AvailabilityResource,AvailabilityService,AvailabilityStaff,BusyCountQuery,ShiftOverride,TimeBlock,WeeklyHours } from '@wsadmin-business/availability';
export function createAvailabilityRepository(pool:Pool):AvailabilityRepository{return{
  async getTenantTimezone(t){const r=await pool.query('SELECT default_timezone FROM tenants WHERE id=$1',[t]);return r.rows[0]?.default_timezone??'Asia/Kuala_Lumpur';},
  async getBookingPolicy(t){const r=await pool.query('SELECT * FROM booking_policies WHERE tenant_id=$1',[t]);if(!r.rowCount)return{...DEFAULT_BOOKING_POLICY};const x=r.rows[0];return{bookingHorizonDays:x.booking_horizon_days,slotIntervalMinutes:x.slot_interval_minutes,minimumLeadMinutes:x.minimum_lead_minutes,sameDayCutoffMinute:x.same_day_cutoff_minute,cancellationDeadlineMinutes:x.cancellation_deadline_minutes};},
  async getService(t,id){const r=await pool.query('SELECT id,active,duration_minutes,buffer_before_minutes,buffer_after_minutes FROM services WHERE tenant_id=$1 AND id=$2',[t,id]);if(!r.rowCount)return null;const x=r.rows[0];return{id:x.id,active:x.active,durationMinutes:x.duration_minutes,bufferBeforeMinutes:x.buffer_before_minutes,bufferAfterMinutes:x.buffer_after_minutes} satisfies AvailabilityService;},
  async listEligibleStaff(t,serviceId,staffId){const r=await pool.query(`SELECT sp.id,sp.active,sp.booking_capacity FROM staff_profiles sp JOIN staff_services ss ON ss.tenant_id=sp.tenant_id AND ss.staff_id=sp.id WHERE sp.tenant_id=$1 AND ss.service_id=$2 AND ($3::uuid IS NULL OR sp.id=$3::uuid) AND sp.active=true ORDER BY sp.sort_order,sp.display_name`,[t,serviceId,staffId??null]);return r.rows.map((x:any):AvailabilityStaff=>({id:x.id,active:x.active,bookingCapacity:x.booking_capacity}));},
  async getWeeklyHours(t,s){const r=await pool.query('SELECT weekday,start_minute,end_minute FROM staff_working_hours WHERE tenant_id=$1 AND staff_id=$2 ORDER BY weekday,start_minute',[t,s]);return r.rows.map((x:any):WeeklyHours=>({weekday:x.weekday,startMinute:x.start_minute,endMinute:x.end_minute}));},
  async getShiftOverrides(t,s,date){const r=await pool.query('SELECT local_date,start_minute,end_minute,is_off FROM staff_shift_overrides WHERE tenant_id=$1 AND staff_id=$2 AND local_date=$3::date ORDER BY start_minute NULLS FIRST',[t,s,date]);return r.rows.map((x:any):ShiftOverride=>({localDate:String(x.local_date).slice(0,10),startMinute:x.start_minute,endMinute:x.end_minute,isOff:x.is_off}));},
  async getTimeBlocks(t,s,start,end){const r=await pool.query('SELECT starts_at,ends_at FROM staff_time_blocks WHERE tenant_id=$1 AND staff_id=$2 AND starts_at<$4 AND $3<ends_at',[t,s,start,end]);return r.rows.map((x:any):TimeBlock=>({startsAt:x.starts_at,endsAt:x.ends_at}));},
  async getCalendarBlocks(t,staffId,resourceId,start,end){
    const r=await pool.query(`WITH candidates AS (
      SELECT *,CASE recurrence WHEN 'DAILY' THEN interval '1 day' WHEN 'WEEKLY' THEN interval '7 days' ELSE NULL END AS step
      FROM calendar_blocks WHERE tenant_id=$1 AND (scope='TENANT' OR (scope='STAFF' AND staff_id=$2::uuid) OR (scope='RESOURCE' AND resource_id=$3::uuid))
        AND starts_at<$5 AND (recurrence='NONE' OR recurrence_until IS NULL OR recurrence_until >= $4)
    ), expanded AS (
      SELECT type,starts_at AS occurrence_start,ends_at AS occurrence_end FROM candidates WHERE recurrence='NONE'
      UNION ALL
      SELECT c.type,gs,gs+(c.ends_at-c.starts_at) FROM candidates c CROSS JOIN LATERAL generate_series(c.starts_at,LEAST(COALESCE(c.recurrence_until,$5),$5),c.step) gs WHERE c.recurrence<>'NONE'
    ) SELECT type,occurrence_start,occurrence_end FROM expanded WHERE occurrence_start<$5 AND $4<occurrence_end`,[t,staffId,resourceId,start,end]);
    return r.rows.map((x:any):AvailabilityControlBlock=>({type:x.type,startsAt:x.occurrence_start,endsAt:x.occurrence_end}));
  },
  async listCompatibleResources(t,serviceId,resourceId){const r=await pool.query(`SELECT r.id,r.active,r.capacity FROM resources r JOIN resource_services rs ON rs.tenant_id=r.tenant_id AND rs.resource_id=r.id WHERE r.tenant_id=$1 AND rs.service_id=$2 AND ($3::uuid IS NULL OR r.id=$3::uuid) AND r.active=true ORDER BY r.sort_order,r.name`,[t,serviceId,resourceId??null]);return r.rows.map((x:any):AvailabilityResource=>({id:x.id,active:x.active,capacity:x.capacity}));},
  async countBusyBookings(q:BusyCountQuery){
    if(!q.staffId&&!q.resourceId)throw new Error('staffId or resourceId required');
    const r=q.staffId
      ?await pool.query(`SELECT count(*)::int AS count FROM bookings WHERE tenant_id=$1 AND staff_id=$2 AND status IN ('PENDING','CONFIRMED') AND effective_starts_at<$4 AND $3<effective_ends_at AND ($5::uuid IS NULL OR id<>$5::uuid)`,[q.tenantId,q.staffId,q.startsAt,q.endsAt,q.excludeBookingId??null])
      :await pool.query(`SELECT count(*)::int AS count FROM bookings WHERE tenant_id=$1 AND resource_id=$2 AND status IN ('PENDING','CONFIRMED') AND effective_starts_at<$4 AND $3<effective_ends_at AND ($5::uuid IS NULL OR id<>$5::uuid)`,[q.tenantId,q.resourceId,q.startsAt,q.endsAt,q.excludeBookingId??null]);
    return Number(r.rows[0]?.count??0);
  }
};}
