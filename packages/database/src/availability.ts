import type { Pool } from 'pg';
import { DEFAULT_BOOKING_POLICY } from '@wsadmin-business/booking-policy';
import type { ServiceOption,ServiceOptionGroup } from '@wsadmin-business/services';
import type { AvailabilityControlBlock,AvailabilityRepository,AvailabilityResource,AvailabilityService,AvailabilityStaff,BusyCountQuery,ShiftOverride,TimeBlock,WeeklyHours } from '@wsadmin-business/availability';
export function createAvailabilityRepository(pool:Pool):AvailabilityRepository{return{
  async getTenantTimezone(t){const r=await pool.query('SELECT default_timezone FROM tenants WHERE id=$1',[t]);return r.rows[0]?.default_timezone??'Asia/Kuala_Lumpur';},
  async getBookingPolicy(t){const r=await pool.query('SELECT * FROM booking_policies WHERE tenant_id=$1',[t]);if(!r.rowCount)return{...DEFAULT_BOOKING_POLICY};const x=r.rows[0];return{bookingHorizonDays:x.booking_horizon_days,slotIntervalMinutes:x.slot_interval_minutes,minimumLeadMinutes:x.minimum_lead_minutes,sameDayCutoffMinute:x.same_day_cutoff_minute,cancellationDeadlineMinutes:x.cancellation_deadline_minutes};},
  async getService(t,id){const r=await pool.query('SELECT id,active,duration_minutes,buffer_before_minutes,buffer_after_minutes,price_minor,currency FROM services WHERE tenant_id=$1 AND id=$2',[t,id]);if(!r.rowCount)return null;const x=r.rows[0];return{id:x.id,active:x.active,durationMinutes:x.duration_minutes,bufferBeforeMinutes:x.buffer_before_minutes,bufferAfterMinutes:x.buffer_after_minutes,priceMinor:Number(x.price_minor),currency:x.currency} satisfies AvailabilityService;},
  async getServiceOptionConfiguration(t,serviceId){
    const gr=await pool.query('SELECT * FROM service_option_groups WHERE tenant_id=$1 AND service_id=$2 ORDER BY sort_order,name',[t,serviceId]);
    const op=await pool.query(`SELECT o.* FROM service_options o JOIN service_option_groups g ON g.tenant_id=o.tenant_id AND g.id=o.group_id WHERE o.tenant_id=$1 AND g.service_id=$2 ORDER BY g.sort_order,o.sort_order,o.name`,[t,serviceId]);
    const groups=gr.rows.map((r:any):ServiceOptionGroup=>({id:r.id,tenantId:r.tenant_id,serviceId:r.service_id,name:r.name,selectionMode:r.selection_mode,required:r.required,active:r.active,sortOrder:r.sort_order,createdAt:r.created_at,updatedAt:r.updated_at}));
    const options=op.rows.map((r:any):ServiceOption=>({id:r.id,tenantId:r.tenant_id,groupId:r.group_id,name:r.name,durationDeltaMinutes:r.duration_delta_minutes,priceDeltaMinor:Number(r.price_delta_minor),requiredResourceType:r.required_resource_type,active:r.active,sortOrder:r.sort_order,createdAt:r.created_at,updatedAt:r.updated_at}));
    return{groups,options};
  },
  async listEligibleStaff(t,serviceId,staffId){const r=await pool.query(`SELECT sp.id,sp.active,sp.booking_capacity,sp.sort_order,sp.display_name,sp.photo_url FROM staff_profiles sp JOIN staff_services ss ON ss.tenant_id=sp.tenant_id AND ss.staff_id=sp.id WHERE sp.tenant_id=$1 AND ss.service_id=$2 AND ($3::uuid IS NULL OR sp.id=$3::uuid) AND sp.active=true ORDER BY sp.sort_order,sp.display_name`,[t,serviceId,staffId??null]);return r.rows.map((x:any):AvailabilityStaff=>({id:x.id,active:x.active,bookingCapacity:x.booking_capacity,sortOrder:x.sort_order,displayName:x.display_name,photoUrl:x.photo_url}));},
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
  async listCompatibleResources(t,serviceId,resourceId,requiredType){const r=await pool.query(`SELECT r.id,r.active,r.capacity,r.type,rs.allocation_priority FROM resources r JOIN resource_services rs ON rs.tenant_id=r.tenant_id AND rs.resource_id=r.id WHERE r.tenant_id=$1 AND rs.service_id=$2 AND ($3::uuid IS NULL OR r.id=$3::uuid) AND ($4::text IS NULL OR r.type=$4::wsb_resource_type) AND r.active=true ORDER BY rs.allocation_priority,r.sort_order,r.name`,[t,serviceId,resourceId??null,requiredType??null]);return r.rows.map((x:any):AvailabilityResource=>({id:x.id,active:x.active,capacity:x.capacity,type:x.type,allocationPriority:x.allocation_priority}));},
  async countBusyBookings(q:BusyCountQuery){
    if(!q.staffId&&!q.resourceId)throw new Error('staffId or resourceId required');
    const r=q.staffId
      ?await pool.query(`SELECT count(*)::int AS count FROM bookings WHERE tenant_id=$1 AND staff_id=$2 AND status IN ('PENDING','CONFIRMED') AND effective_starts_at<$4 AND $3<effective_ends_at AND ($5::uuid IS NULL OR id<>$5::uuid)`,[q.tenantId,q.staffId,q.startsAt,q.endsAt,q.excludeBookingId??null])
      :await pool.query(`SELECT count(*)::int AS count FROM bookings WHERE tenant_id=$1 AND resource_id=$2 AND status IN ('PENDING','CONFIRMED') AND effective_starts_at<$4 AND $3<effective_ends_at AND ($5::uuid IS NULL OR id<>$5::uuid)`,[q.tenantId,q.resourceId,q.startsAt,q.endsAt,q.excludeBookingId??null]);
    return Number(r.rows[0]?.count??0);
  }
};}
