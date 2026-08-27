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
      blocks=blockRows.rows.map((b:any)=>({id:b.id,rowId:b.staff_id,type:b.type,startsAt:b.starts_at,endsAt:b.ends_at,reason:b.reason}));
    }
    return{tenantId,view,from,to,rows,bookings,blocks};
  }
};}
