import type { Pool } from 'pg';
import { BookingConflictError,type Booking,type BookingRepository,type PersistBookingInput } from '@wsadmin-business/booking';
const map=(r:any):Booking=>({id:r.id,tenantId:r.tenant_id,customerId:r.customer_id,serviceId:r.service_id,staffId:r.staff_id,resourceId:r.resource_id,status:r.status,startsAt:r.starts_at,endsAt:r.ends_at,effectiveStartsAt:r.effective_starts_at,effectiveEndsAt:r.effective_ends_at,createdAt:r.created_at,updatedAt:r.updated_at});
export function createBookingRepository(pool:Pool):BookingRepository{return{
  async createWithConflictGuard(i:PersistBookingInput){
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const service=await c.query('SELECT id FROM services WHERE tenant_id=$1 AND id=$2 AND active=true FOR SHARE',[i.tenantId,i.serviceId]);
      if(!service.rowCount)throw new BookingConflictError('service is inactive or unavailable');
      const staff=await c.query('SELECT booking_capacity FROM staff_profiles WHERE tenant_id=$1 AND id=$2 AND active=true FOR UPDATE',[i.tenantId,i.staffId]);
      if(!staff.rowCount)throw new BookingConflictError('staff is inactive or unavailable');
      const eligible=await c.query('SELECT 1 FROM staff_services WHERE tenant_id=$1 AND staff_id=$2 AND service_id=$3',[i.tenantId,i.staffId,i.serviceId]);
      if(!eligible.rowCount)throw new BookingConflictError('staff is not eligible for this service');
      let resourceCapacity:number|null=null;
      if(i.resourceId){
        const resource=await c.query('SELECT capacity FROM resources WHERE tenant_id=$1 AND id=$2 AND active=true FOR UPDATE',[i.tenantId,i.resourceId]);
        if(!resource.rowCount)throw new BookingConflictError('resource is inactive or unavailable');
        const compatible=await c.query('SELECT 1 FROM resource_services WHERE tenant_id=$1 AND resource_id=$2 AND service_id=$3',[i.tenantId,i.resourceId,i.serviceId]);
        if(!compatible.rowCount)throw new BookingConflictError('resource is not compatible with this service');
        resourceCapacity=Number(resource.rows[0].capacity);
      }
      const staffBusy=await c.query(`SELECT count(*)::int AS count FROM bookings WHERE tenant_id=$1 AND staff_id=$2 AND status IN ('PENDING','CONFIRMED') AND effective_starts_at<$4 AND $3<effective_ends_at`,[i.tenantId,i.staffId,i.effectiveStartsAt,i.effectiveEndsAt]);
      if(Number(staffBusy.rows[0].count)>=Number(staff.rows[0].booking_capacity))throw new BookingConflictError('staff capacity was taken by another booking');
      if(i.resourceId&&resourceCapacity!==null){
        const resourceBusy=await c.query(`SELECT count(*)::int AS count FROM bookings WHERE tenant_id=$1 AND resource_id=$2 AND status IN ('PENDING','CONFIRMED') AND effective_starts_at<$4 AND $3<effective_ends_at`,[i.tenantId,i.resourceId,i.effectiveStartsAt,i.effectiveEndsAt]);
        if(Number(resourceBusy.rows[0].count)>=resourceCapacity)throw new BookingConflictError('resource capacity was taken by another booking');
      }
      const inserted=await c.query(`INSERT INTO bookings(tenant_id,customer_id,service_id,staff_id,resource_id,status,starts_at,ends_at,effective_starts_at,effective_ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[i.tenantId,i.customerId,i.serviceId,i.staffId,i.resourceId,i.status,i.startsAt,i.endsAt,i.effectiveStartsAt,i.effectiveEndsAt]);
      await c.query('COMMIT');
      return map(inserted.rows[0]);
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
};}
