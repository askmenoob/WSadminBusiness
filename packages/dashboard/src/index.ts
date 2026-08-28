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
export type ReportDailyPoint={localDate:string;bookings:number;completed:number;revenueMinor:number;refundedMinor:number};
export type BusinessReportSnapshot={
  tenantId:string;from:string;to:string;timezone:string;currency:string;
  bookings:{total:number;pending:number;confirmed:number;completed:number;cancelled:number;noShow:number};
  revenue:{grossMinor:number;refundedMinor:number;netMinor:number;paidCount:number};
  utilization:{activeStaff:number;bookedMinutes:number;scheduledMinutes:number;percentage:number};
  customers:{total:number;newCustomers:number;engagedCustomers:number;repeatCustomers:number;repeatRatePercentage:number};
  automation:{total:number;queued:number;dispatched:number;skipped:number;failed:number};
  ai:{requests:number;successful:number;failed:number;inputTokens:number;outputTokens:number;latencyAvgMs:number};
  daily:ReportDailyPoint[];
};
export interface DashboardRepository{snapshot(tenantId:string,localDate?:string,locationId?:string):Promise<DashboardSnapshot>;report(tenantId:string,from:string,to:string):Promise<BusinessReportSnapshot>;}
export class DashboardValidationError extends Error{constructor(message:string){super(message);this.name='DashboardValidationError';}}
export class DashboardService{
  constructor(private readonly repo:DashboardRepository){}
  get(tenantId:string,localDate?:string,locationId?:string){if(localDate!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(localDate))throw new DashboardValidationError('date must be YYYY-MM-DD');return this.repo.snapshot(tenantId,localDate,locationId);}
  report(tenantId:string,from:string,to:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))throw new DashboardValidationError('from and to must be YYYY-MM-DD');if(from>to)throw new DashboardValidationError('from must not be after to');const start=new Date(`${from}T00:00:00Z`),end=new Date(`${to}T00:00:00Z`);if((end.getTime()-start.getTime())/86400000>366)throw new DashboardValidationError('report range must not exceed 366 days');return this.repo.report(tenantId,from,to);}
}
