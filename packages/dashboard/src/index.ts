export type DashboardBookingItem={id:string;status:string;startsAt:Date;endsAt:Date;customerName:string|null;serviceName:string;staffName:string;resourceName:string|null};
export type DashboardLocationItem={locationId:string|null;locationName:string;totalBookings:number;confirmed:number;pending:number;cancelled:number};
export type DashboardSnapshot={
  tenantId:string;locationId:string|null;localDate:string;timezone:string;rangeStart:Date;rangeEnd:Date;
  bookings:{total:number;pending:number;confirmed:number;completed:number;cancelled:number;noShow:number};
  utilization:{activeStaff:number;bookedMinutes:number;scheduledMinutes:number;percentage:number};
  pendingActions:{pendingBookings:number;noShows:number;attentionCount:number};
  recent:DashboardBookingItem[];
  byLocation:DashboardLocationItem[];
};
export interface DashboardRepository{snapshot(tenantId:string,localDate?:string,locationId?:string):Promise<DashboardSnapshot>;}
export class DashboardValidationError extends Error{constructor(message:string){super(message);this.name='DashboardValidationError';}}
export class DashboardService{
  constructor(private readonly repo:DashboardRepository){}
  get(tenantId:string,localDate?:string,locationId?:string){if(localDate!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(localDate))throw new DashboardValidationError('date must be YYYY-MM-DD');return this.repo.snapshot(tenantId,localDate,locationId);}
}
