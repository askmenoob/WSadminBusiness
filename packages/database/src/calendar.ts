import type { Pool } from 'pg';
import type { CalendarBlockItem,CalendarBookingItem,CalendarRepository,CalendarRow,CalendarSnapshot,CalendarView } from '@wsadmin-business/calendar';
export function createCalendarRepository(pool:Pool):CalendarRepository{return{
  async snapshot(tenantId:string,view:CalendarView,from:Date,to:Date):Promise<CalendarSnapshot>{
    const rowsQuery=view==='staff'
      ?await pool.query(`SELECT id,display_name AS name,booking_capacity AS capacity,photo_url FROM staff_profiles WHERE tenant_id=$1 AND active=true ORDER BY sort_order,display_name`,[tenantId])
      :await pool.query(`SELECT id,name,capacity,type FROM resources WHERE tenant_id=$1 AND active=true ORDER BY sort_order,name`,[tenantId]);
    const rows:CalendarRow[]=rowsQuery.rows.map((r:any)=>view==='staff'
      ?{id:r.id,name:r.name,kind:'STAFF',capacity:r.capacity,photoUrl:r.photo_url,resourceType:null}
      :{id:r.id,name:r.name,kind:'RESOURCE',capacity:r.capacity,photoUrl:null,resourceType:r.type});
    const bookingRows=await pool.query(`SELECT b.*,c.name AS customer_name,sv.name AS service_name,sp.display_name AS staff_name,r.name AS resource_name FROM bookings b LEFT JOIN customers c ON c.tenant_id=b.tenant_id AND c.id=b.customer_id JOIN services sv ON sv.tenant_id=b.tenant_id AND sv.id=b.service_id JOIN staff_profiles sp ON sp.tenant_id=b.tenant_id AND sp.id=b.staff_id LEFT JOIN resources r ON r.tenant_id=b.tenant_id AND r.id=b.resource_id WHERE b.tenant_id=$1 AND b.starts_at<$3 AND $2<b.ends_at ORDER BY b.starts_at,b.id`,[tenantId,from,to]);
    const bookings:CalendarBookingItem[]=bookingRows.rows.map((b:any)=>({id:b.id,rowId:view==='staff'?b.staff_id:b.resource_id,status:b.status,startsAt:b.starts_at,endsAt:b.ends_at,customerId:b.customer_id,customerName:b.customer_name,serviceId:b.service_id,serviceName:b.service_name,staffId:b.staff_id,staffName:b.staff_name,resourceId:b.resource_id,resourceName:b.resource_name}));
    let blocks:CalendarBlockItem[]=[];
    if(view==='staff'){
      const blockRows=await pool.query(`SELECT id,staff_id,type,starts_at,ends_at,reason FROM staff_time_blocks WHERE tenant_id=$1 AND starts_at<$3 AND $2<ends_at ORDER BY starts_at,id`,[tenantId,from,to]);
      blocks=blockRows.rows.map((b:any)=>({id:b.id,rowId:b.staff_id,type:b.type,startsAt:b.starts_at,endsAt:b.ends_at,reason:b.reason,source:'STAFF_TIME' as const,recurrence:'NONE' as const}));
    }
    const controlRows=await pool.query(`WITH candidates AS (
      SELECT *,CASE recurrence WHEN 'DAILY' THEN interval '1 day' WHEN 'WEEKLY' THEN interval '7 days' ELSE NULL END AS step FROM calendar_blocks
      WHERE tenant_id=$1 AND (scope='TENANT' OR ($4='staff' AND scope='STAFF') OR ($4='resource' AND scope='RESOURCE')) AND starts_at<$3 AND (recurrence='NONE' OR recurrence_until IS NULL OR recurrence_until >= $2)
    ), expanded AS (
      SELECT id,scope,staff_id,resource_id,type,recurrence,reason,starts_at AS occurrence_start,ends_at AS occurrence_end FROM candidates WHERE recurrence='NONE'
      UNION ALL
      SELECT c.id,c.scope,c.staff_id,c.resource_id,c.type,c.recurrence,c.reason,gs,gs+(c.ends_at-c.starts_at) FROM candidates c CROSS JOIN LATERAL generate_series(c.starts_at,LEAST(COALESCE(c.recurrence_until,$3),$3),c.step) gs WHERE c.recurrence<>'NONE'
    ) SELECT * FROM expanded WHERE occurrence_start<$3 AND $2<occurrence_end ORDER BY occurrence_start,id`,[tenantId,from,to,view]);
    for(const b of controlRows.rows){
      const targets=b.scope==='TENANT'?rows.map(r=>r.id):[view==='staff'?b.staff_id:b.resource_id].filter(Boolean);
      for(const rowId of targets){blocks.push({id:`${b.id}:${rowId}:${new Date(b.occurrence_start).toISOString()}`,rowId,type:b.type,startsAt:b.occurrence_start,endsAt:b.occurrence_end,reason:b.reason,source:'CALENDAR_CONTROL',recurrence:b.recurrence});}
    }
    return{tenantId,view,from,to,rows,bookings,blocks};
  }
};}
