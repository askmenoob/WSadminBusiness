export type DashboardBookingItem={id:string;status:string;startsAt:Date;endsAt:Date;customerName:string|null;serviceName:string;staffName:string;resourceName:string|null};
export type DashboardSnapshot={
  tenantId:string;localDate:string;timezone:string;rangeStart:Date;rangeEnd:Date;
  bookings:{total:number;pending:number;confirmed:number;completed:number;cancelled:number;noShow:number};
  utilization:{activeStaff:number;bookedMinutes:number;scheduledMinutes:number;percentage:number};
  pendingActions:{pendingBookings:number;noShows:number;attentionCount:number};
  recent:DashboardBookingItem[];
};
export interface DashboardRepository{snapshot(tenantId:string,localDate?:string):Promise<DashboardSnapshot>;}
export class DashboardValidationError extends Error{constructor(message:string){super(message);this.name='DashboardValidationError';}}
export class DashboardService{
  constructor(private readonly repo:DashboardRepository){}
  get(tenantId:string,localDate?:string){if(localDate!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(localDate))throw new DashboardValidationError('date must be YYYY-MM-DD');return this.repo.snapshot(tenantId,localDate);}
}
