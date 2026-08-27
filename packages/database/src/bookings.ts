import type { Pool,PoolClient } from 'pg';
import { BookingConflictError,BookingNotFoundError,BookingStateError,type Booking,type BookingAuditEvent,type BookingRepository,type BookingTransitionInput,type PersistBookingInput,type ReschedulePersistInput } from '@wsadmin-business/booking';
const map=(r:any):Booking=>({id:r.id,tenantId:r.tenant_id,customerId:r.customer_id,serviceId:r.service_id,staffId:r.staff_id,resourceId:r.resource_id,status:r.status,startsAt:r.starts_at,endsAt:r.ends_at,effectiveStartsAt:r.effective_starts_at,effectiveEndsAt:r.effective_ends_at,createdAt:r.created_at,updatedAt:r.updated_at});
const mapAudit=(r:any):BookingAuditEvent=>({id:r.id,tenantId:r.tenant_id,bookingId:r.booking_id,actorUserId:r.actor_user_id,eventType:r.event_type,fromStatus:r.from_status,toStatus:r.to_status,metadata:r.metadata??{},createdAt:r.created_at});
async function writeAudit(c:PoolClient,args:{tenantId:string;bookingId:string;actorUserId?:string|null;eventType:string;fromStatus?:string|null;toStatus?:string|null;metadata?:Record<string,unknown>}){
  await c.query('INSERT INTO booking_audit_events(tenant_id,booking_id,actor_user_id,event_type,from_status,to_status,metadata) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[args.tenantId,args.bookingId,args.actorUserId??null,args.eventType,args.fromStatus??null,args.toStatus??null,JSON.stringify(args.metadata??{})]);
}
async function lockAndCheckCapacity(c:PoolClient,args:{tenantId:string;serviceId:string;staffId:string;resourceId:string|null;startsAt:Date;endsAt:Date;excludeBookingId?:string}){
  const service=await c.query('SELECT id FROM services WHERE tenant_id=$1 AND id=$2 AND active=true FOR SHARE',[args.tenantId,args.serviceId]);
  if(!service.rowCount)throw new BookingConflictError('service is inactive or unavailable');
  const staff=await c.query('SELECT booking_capacity FROM staff_profiles WHERE tenant_id=$1 AND id=$2 AND active=true FOR UPDATE',[args.tenantId,args.staffId]);
  if(!staff.rowCount)throw new BookingConflictError('staff is inactive or unavailable');
  const eligible=await c.query('SELECT 1 FROM staff_services WHERE tenant_id=$1 AND staff_id=$2 AND service_id=$3',[args.tenantId,args.staffId,args.serviceId]);
  if(!eligible.rowCount)throw new BookingConflictError('staff is not eligible for this service');
  let resourceCapacity:number|null=null;
  if(args.resourceId){
    const resource=await c.query('SELECT capacity FROM resources WHERE tenant_id=$1 AND id=$2 AND active=true FOR UPDATE',[args.tenantId,args.resourceId]);
    if(!resource.rowCount)throw new BookingConflictError('resource is inactive or unavailable');
    const compatible=await c.query('SELECT 1 FROM resource_services WHERE tenant_id=$1 AND resource_id=$2 AND service_id=$3',[args.tenantId,args.resourceId,args.serviceId]);
    if(!compatible.rowCount)throw new BookingConflictError('resource is not compatible with this service');
    resourceCapacity=Number(resource.rows[0].capacity);
  }
  const staffBusy=await c.query(`SELECT count(*)::int AS count FROM bookings WHERE tenant_id=$1 AND staff_id=$2 AND status IN ('PENDING','CONFIRMED') AND effective_starts_at<$4 AND $3<effective_ends_at AND ($5::uuid IS NULL OR id<>$5::uuid)`,[args.tenantId,args.staffId,args.startsAt,args.endsAt,args.excludeBookingId??null]);
  if(Number(staffBusy.rows[0].count)>=Number(staff.rows[0].booking_capacity))throw new BookingConflictError('staff capacity was taken by another booking');
  if(args.resourceId&&resourceCapacity!==null){
    const resourceBusy=await c.query(`SELECT count(*)::int AS count FROM bookings WHERE tenant_id=$1 AND resource_id=$2 AND status IN ('PENDING','CONFIRMED') AND effective_starts_at<$4 AND $3<effective_ends_at AND ($5::uuid IS NULL OR id<>$5::uuid)`,[args.tenantId,args.resourceId,args.startsAt,args.endsAt,args.excludeBookingId??null]);
    if(Number(resourceBusy.rows[0].count)>=resourceCapacity)throw new BookingConflictError('resource capacity was taken by another booking');
  }
}
export function createBookingRepository(pool:Pool):BookingRepository{return{
  async createWithConflictGuard(i:PersistBookingInput){
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await lockAndCheckCapacity(c,{tenantId:i.tenantId,serviceId:i.serviceId,staffId:i.staffId,resourceId:i.resourceId,startsAt:i.effectiveStartsAt,endsAt:i.effectiveEndsAt});
      const inserted=await c.query(`INSERT INTO bookings(tenant_id,customer_id,service_id,staff_id,resource_id,status,starts_at,ends_at,effective_starts_at,effective_ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[i.tenantId,i.customerId,i.serviceId,i.staffId,i.resourceId,i.status,i.startsAt,i.endsAt,i.effectiveStartsAt,i.effectiveEndsAt]);
      const row=map(inserted.rows[0]);
      await writeAudit(c,{tenantId:i.tenantId,bookingId:row.id,actorUserId:i.actorUserId,eventType:'CREATED',toStatus:row.status,metadata:{startsAt:row.startsAt.toISOString(),staffId:row.staffId,resourceId:row.resourceId}});
      await c.query('COMMIT');return row;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  },
  async get(t,id){const r=await pool.query('SELECT * FROM bookings WHERE tenant_id=$1 AND id=$2',[t,id]);return r.rowCount?map(r.rows[0]):null;},
  async transitionStatus(i:BookingTransitionInput){
    const c=await pool.connect();try{await c.query('BEGIN');const currentQ=await c.query('SELECT * FROM bookings WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[i.tenantId,i.bookingId]);if(!currentQ.rowCount)throw new BookingNotFoundError();const current=map(currentQ.rows[0]);if(!i.allowedFrom.includes(current.status))throw new BookingStateError(`cannot transition ${current.status} to ${i.toStatus}`);const updated=await c.query('UPDATE bookings SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *',[i.tenantId,i.bookingId,i.toStatus]);const row=map(updated.rows[0]);await writeAudit(c,{tenantId:i.tenantId,bookingId:i.bookingId,actorUserId:i.actorUserId,eventType:`STATUS_${i.toStatus}`,fromStatus:current.status,toStatus:i.toStatus,metadata:{reason:i.reason??null}});await c.query('COMMIT');return row;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  },
  async rescheduleWithConflictGuard(i:ReschedulePersistInput){
    const c=await pool.connect();try{await c.query('BEGIN');const currentQ=await c.query('SELECT * FROM bookings WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[i.tenantId,i.bookingId]);if(!currentQ.rowCount)throw new BookingNotFoundError();const current=map(currentQ.rows[0]);if(!['PENDING','CONFIRMED'].includes(current.status))throw new BookingStateError(`cannot reschedule ${current.status} booking`);
      await lockAndCheckCapacity(c,{tenantId:i.tenantId,serviceId:current.serviceId,staffId:i.staffId,resourceId:i.resourceId,startsAt:i.effectiveStartsAt,endsAt:i.effectiveEndsAt,excludeBookingId:i.bookingId});
      const updated=await c.query(`UPDATE bookings SET staff_id=$3,resource_id=$4,starts_at=$5,ends_at=$6,effective_starts_at=$7,effective_ends_at=$8,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,[i.tenantId,i.bookingId,i.staffId,i.resourceId,i.startsAt,i.endsAt,i.effectiveStartsAt,i.effectiveEndsAt]);
      const row=map(updated.rows[0]);await writeAudit(c,{tenantId:i.tenantId,bookingId:i.bookingId,actorUserId:i.actorUserId,eventType:'RESCHEDULED',fromStatus:current.status,toStatus:current.status,metadata:{from:{startsAt:current.startsAt.toISOString(),staffId:current.staffId,resourceId:current.resourceId},to:{startsAt:row.startsAt.toISOString(),staffId:row.staffId,resourceId:row.resourceId}}});await c.query('COMMIT');return row;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  },
  async listAudit(t,id){const r=await pool.query('SELECT * FROM booking_audit_events WHERE tenant_id=$1 AND booking_id=$2 ORDER BY created_at,id',[t,id]);return r.rows.map(mapAudit);}
};}
