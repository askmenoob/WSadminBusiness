import type { Pool } from 'pg';
import type { DashboardBookingItem,DashboardRepository,DashboardSnapshot } from '@wsadmin-business/dashboard';
export function createDashboardRepository(pool:Pool):DashboardRepository{return{
  async snapshot(tenantId:string,localDate?:string):Promise<DashboardSnapshot>{
    const tenant=await pool.query('SELECT default_timezone FROM tenants WHERE id=$1',[tenantId]);
    const timezone=tenant.rows[0]?.default_timezone??'Asia/Kuala_Lumpur';
    const dateRow=await pool.query(`SELECT coalesce($2::date,(now() AT TIME ZONE $1)::date)::text AS local_date, (coalesce($2::date,(now() AT TIME ZONE $1)::date)::timestamp AT TIME ZONE $1) AS range_start, ((coalesce($2::date,(now() AT TIME ZONE $1)::date)+1)::timestamp AT TIME ZONE $1) AS range_end, extract(dow from coalesce($2::date,(now() AT TIME ZONE $1)::date))::int AS weekday`,[timezone,localDate??null]);
    const d=dateRow.rows[0];
    const summary=await pool.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='PENDING')::int AS pending,count(*) FILTER(WHERE status='CONFIRMED')::int AS confirmed,count(*) FILTER(WHERE status='COMPLETED')::int AS completed,count(*) FILTER(WHERE status='CANCELLED')::int AS cancelled,count(*) FILTER(WHERE status='NO_SHOW')::int AS no_show,coalesce(sum(extract(epoch from (ends_at-starts_at))/60) FILTER(WHERE status<>'CANCELLED'),0)::int AS booked_minutes FROM bookings WHERE tenant_id=$1 AND starts_at<$3 AND $2<ends_at`,[tenantId,d.range_start,d.range_end]);
    const s=summary.rows[0];
    const scheduled=await pool.query(`WITH active_staff AS (SELECT id FROM staff_profiles WHERE tenant_id=$1 AND active=true) SELECT count(*)::int AS active_staff,coalesce(sum(CASE WHEN o.cnt>0 THEN o.minutes ELSE coalesce(w.minutes,0) END),0)::int AS scheduled_minutes FROM active_staff sp LEFT JOIN LATERAL (SELECT count(*)::int AS cnt,CASE WHEN bool_or(is_off) THEN 0 ELSE coalesce(sum(end_minute-start_minute) FILTER(WHERE is_off=false),0) END::int AS minutes FROM staff_shift_overrides WHERE tenant_id=$1 AND staff_id=sp.id AND local_date=$2::date) o ON true LEFT JOIN LATERAL (SELECT coalesce(sum(end_minute-start_minute),0)::int AS minutes FROM staff_working_hours WHERE tenant_id=$1 AND staff_id=sp.id AND weekday=$3) w ON true`,[tenantId,d.local_date,d.weekday]);
    const sch=scheduled.rows[0];
    const recentRows=await pool.query(`SELECT b.id,b.status,b.starts_at,b.ends_at,c.name AS customer_name,sv.name AS service_name,sp.display_name AS staff_name,r.name AS resource_name FROM bookings b LEFT JOIN customers c ON c.tenant_id=b.tenant_id AND c.id=b.customer_id JOIN services sv ON sv.tenant_id=b.tenant_id AND sv.id=b.service_id JOIN staff_profiles sp ON sp.tenant_id=b.tenant_id AND sp.id=b.staff_id LEFT JOIN resources r ON r.tenant_id=b.tenant_id AND r.id=b.resource_id WHERE b.tenant_id=$1 AND b.starts_at<$3 AND $2<b.ends_at ORDER BY b.starts_at,b.id LIMIT 12`,[tenantId,d.range_start,d.range_end]);
    const recent:DashboardBookingItem[]=recentRows.rows.map((r:any)=>({id:r.id,status:r.status,startsAt:r.starts_at,endsAt:r.ends_at,customerName:r.customer_name,serviceName:r.service_name,staffName:r.staff_name,resourceName:r.resource_name}));
    const bookedMinutes=Number(s.booked_minutes??0),scheduledMinutes=Number(sch.scheduled_minutes??0);
    const percentage=scheduledMinutes>0?Math.round((bookedMinutes/scheduledMinutes)*10000)/100:0;
    const pending=Number(s.pending??0),noShow=Number(s.no_show??0);
    return{
      tenantId,localDate:d.local_date,timezone,rangeStart:d.range_start,rangeEnd:d.range_end,
      bookings:{total:Number(s.total??0),pending,confirmed:Number(s.confirmed??0),completed:Number(s.completed??0),cancelled:Number(s.cancelled??0),noShow},
      utilization:{activeStaff:Number(sch.active_staff??0),bookedMinutes,scheduledMinutes,percentage},
      pendingActions:{pendingBookings:pending,noShows:noShow,attentionCount:pending+noShow},recent
    };
  }
};}
