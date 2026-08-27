import type{Pool}from'pg';
import{DEFAULT_BOOKING_POLICY,type BookingPolicy,type BookingPolicyRepository}from'@wsadmin-business/booking-policy';
const map=(r:any):BookingPolicy=>({bookingHorizonDays:r.booking_horizon_days,slotIntervalMinutes:r.slot_interval_minutes,minimumLeadMinutes:r.minimum_lead_minutes,sameDayCutoffMinute:r.same_day_cutoff_minute,cancellationDeadlineMinutes:r.cancellation_deadline_minutes});
export function createBookingPolicyRepository(pool:Pool):BookingPolicyRepository{return{
  async get(tenantId){
    const r=await pool.query('SELECT * FROM booking_policies WHERE tenant_id=$1',[tenantId]);
    return r.rowCount?map(r.rows[0]):{...DEFAULT_BOOKING_POLICY};
  },
  async upsert(tenantId,policy){
    const r=await pool.query(`INSERT INTO booking_policies(tenant_id,booking_horizon_days,slot_interval_minutes,minimum_lead_minutes,same_day_cutoff_minute,cancellation_deadline_minutes)
      VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(tenant_id) DO UPDATE SET booking_horizon_days=excluded.booking_horizon_days,slot_interval_minutes=excluded.slot_interval_minutes,minimum_lead_minutes=excluded.minimum_lead_minutes,same_day_cutoff_minute=excluded.same_day_cutoff_minute,cancellation_deadline_minutes=excluded.cancellation_deadline_minutes,updated_at=now()
      RETURNING *`,[tenantId,policy.bookingHorizonDays,policy.slotIntervalMinutes,policy.minimumLeadMinutes,policy.sameDayCutoffMinute,policy.cancellationDeadlineMinutes]);
    return map(r.rows[0]);
  }
};}
