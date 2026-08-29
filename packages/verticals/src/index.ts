import type{IntentGenerator}from'@wsadmin-business/ai';export type Property={id:string;tenantId:string;propertyCode:string;name:string;locationName:string;googleMapsUrl:string|null;roomType:string;beds:number;bathrooms:number;maxGuests:number;features:string[];photos:string[];weekdayPriceMinor:number;weekendPriceMinor:number;depositMinor:number;cleaningFeeMinor:number;checkInTime:string;checkOutTime:string;active:boolean;createdAt:Date;updatedAt:Date};export type PropertySearchCriteria={location?:string|null;checkIn?:string|null;checkOut?:string|null;pax?:number|null;features?:string[];budgetMinor?:number|null;roomType?:string|null};
export interface PropertyRepository{create(t:string,i:Omit<Property,'id'|'tenantId'|'createdAt'|'updatedAt'>):Promise<Property>;get(t:string,id:string):Promise<Property|null>;search(t:string,c:PropertySearchCriteria):Promise<Property[]>;isAvailable(t:string,id:string,checkIn:string,checkOut:string):Promise<boolean>;createStay(i:{tenantId:string;propertyId:string;customerId?:string|null;checkIn:string;checkOut:string;guestCount:number;status?:'PENDING'|'CONFIRMED';source?:string}):Promise<{id:string}>;}
export class VerticalError extends Error{constructor(message:string,public readonly code='vertical_error'){super(message);this.name='VerticalError';}}
export class PropertyService{constructor(private readonly repo:PropertyRepository){}create(t:string,i:any){if(!i.propertyCode?.trim()||!i.name?.trim())throw new VerticalError('property code and name required','validation');if(!Number.isInteger(i.maxGuests)||i.maxGuests<1)throw new VerticalError('maxGuests required','validation');return this.repo.create(t,{...i,propertyCode:i.propertyCode.trim(),name:i.name.trim(),locationName:String(i.locationName??'').trim(),googleMapsUrl:i.googleMapsUrl??null,roomType:String(i.roomType??'Entire unit'),beds:Number(i.beds??1),bathrooms:Number(i.bathrooms??1),features:Array.isArray(i.features)?i.features:[],photos:Array.isArray(i.photos)?i.photos:[],weekdayPriceMinor:Number(i.weekdayPriceMinor??0),weekendPriceMinor:Number(i.weekendPriceMinor??i.weekdayPriceMinor??0),depositMinor:Number(i.depositMinor??0),cleaningFeeMinor:Number(i.cleaningFeeMinor??0),checkInTime:i.checkInTime??'15:00',checkOutTime:i.checkOutTime??'11:00',active:i.active??true});}async book(i:{tenantId:string;propertyId:string;customerId?:string|null;checkIn:string;checkOut:string;guestCount:number;source?:string}){if(!(await this.repo.isAvailable(i.tenantId,i.propertyId,i.checkIn,i.checkOut)))throw new VerticalError('property unavailable','unavailable');return this.repo.createStay({...i,status:'CONFIRMED'});}}
export class PropertyAiSearchService{constructor(private readonly generator:IntentGenerator,private readonly repo:PropertyRepository){}async search(t:string,text:string){const r=await this.generator.generate({tenantId:t,operation:'property_search',messages:[{role:'system',content:'Return JSON only with location,checkIn,checkOut,pax,features,budgetMinor,roomType. Understand Bahasa Melayu, English and mixed language. Dates use YYYY-MM-DD. Never invent filters not stated.'},{role:'user',content:text.slice(0,3000)}]});let x:any;try{x=JSON.parse(r.text);}catch{throw new VerticalError('AI property search invalid JSON','ai_invalid');}const c:PropertySearchCriteria={location:typeof x.location==='string'?x.location:null,checkIn:typeof x.checkIn==='string'?x.checkIn:null,checkOut:typeof x.checkOut==='string'?x.checkOut:null,pax:Number.isInteger(x.pax)?x.pax:null,features:Array.isArray(x.features)?x.features.filter((v:any)=>typeof v==='string').slice(0,20):[],budgetMinor:Number.isInteger(x.budgetMinor)?x.budgetMinor:null,roomType:typeof x.roomType==='string'?x.roomType:null};return{criteria:c,properties:await this.repo.search(t,c)};}}
export const VERTICAL_PACKS={SPA:{customerLabel:'Client',staffLabel:'Therapist',resourceLabel:'Room',defaultDurationMinutes:60,requiresResource:true},SALON:{customerLabel:'Client',staffLabel:'Stylist',resourceLabel:'Chair',defaultDurationMinutes:60,requiresResource:true},CLINIC:{customerLabel:'Patient',staffLabel:'Practitioner',resourceLabel:'Treatment Room',defaultDurationMinutes:30,requiresResource:true},WORKSHOP:{customerLabel:'Customer',staffLabel:'Technician',resourceLabel:'Service Bay',defaultDurationMinutes:60,requiresResource:true}}as const;export type VerticalPack=keyof typeof VERTICAL_PACKS;export function getVerticalPack(name:string){const k=name.toUpperCase()as VerticalPack;const p=VERTICAL_PACKS[k];if(!p)throw new VerticalError('unsupported vertical pack','validation');return p;}

export const BUSINESS_TYPE_KEYS = [
  'PROPERTY',
  'BEAUTY_WELLNESS',
  'AUTOMOTIVE',
  'FOOD_BEVERAGE',
  'RETAIL',
  'HEALTHCARE',
  'EDUCATION',
  'PROFESSIONAL_SERVICES',
  'HOME_SERVICES',
  'EVENT_BUSINESS',
  'GENERAL',
] as const;

export type BusinessTypeKey = (typeof BUSINESS_TYPE_KEYS)[number];
export type BusinessWorkflow = 'APPOINTMENT' | 'BOOKING' | 'ORDER' | 'RESERVATION' | 'ENQUIRY' | 'QUOTATION' | 'WALK_IN';
export type OfferingKind = 'SERVICE' | 'PROPERTY' | 'PRODUCT' | 'CLASS' | 'PACKAGE';
export type CustomFieldType = 'TEXT' | 'NUMBER' | 'MONEY' | 'BOOLEAN' | 'LIST' | 'SELECT';
export type CustomOfferingField = {
  key: string;
  label: string;
  type: CustomFieldType;
  required?: boolean;
  placeholder?: string;
  options?: readonly string[];
};
export type OfferingField =
  | 'NAME' | 'DESCRIPTION' | 'PRICE' | 'DURATION' | 'CAPACITY' | 'STAFF' | 'DEPOSIT'
  | 'PROPERTY_CODE' | 'LOCATION' | 'GOOGLE_MAPS' | 'ROOM_TYPE' | 'BEDROOMS' | 'BATHROOMS'
  | 'MAX_GUESTS' | 'PRIVATE_POOL' | 'AMENITIES' | 'WEEKDAY_PRICE' | 'WEEKEND_PRICE'
  | 'PUBLIC_HOLIDAY_PRICE' | 'CHECK_IN_OUT' | 'AVAILABILITY' | 'BOOKING_RULES'
  | 'STOCK' | 'PREPARATION_TIME';

export type BusinessTypeDefinition = {
  key: BusinessTypeKey;
  label: string;
  description: string;
  offeringKind: OfferingKind;
  labels: {
    offeringSingular: string;
    offeringPlural: string;
    transactionSingular: string;
    transactionPlural: string;
    customerSingular: string;
    staffSingular: string;
  };
  subtypes: readonly { key: string; label: string }[];
  offeringPresets: readonly { key: string; label: string }[];
  offeringFields: readonly OfferingField[];
  customFields: readonly CustomOfferingField[];
  workflows: readonly BusinessWorkflow[];
  defaultWorkflow: BusinessWorkflow;
};

const serviceFields = ['NAME','DESCRIPTION','PRICE','DURATION','CAPACITY','STAFF','DEPOSIT'] as const;
const propertyFields = ['NAME','DESCRIPTION','PROPERTY_CODE','LOCATION','GOOGLE_MAPS','ROOM_TYPE','BEDROOMS','BATHROOMS','MAX_GUESTS','PRIVATE_POOL','AMENITIES','WEEKDAY_PRICE','WEEKEND_PRICE','PUBLIC_HOLIDAY_PRICE','DEPOSIT','CHECK_IN_OUT','AVAILABILITY','BOOKING_RULES'] as const;

export const BUSINESS_TYPES: Record<BusinessTypeKey, BusinessTypeDefinition> = {
  PROPERTY: {
    key: 'PROPERTY', label: 'Property', description: 'Stays, rooms, units and reservable property.', offeringKind: 'PROPERTY',
    labels: { offeringSingular: 'Property', offeringPlural: 'Properties', transactionSingular: 'Booking', transactionPlural: 'Bookings', customerSingular: 'Guest', staffSingular: 'Host' },
    subtypes: [
      { key: 'HOMESTAY', label: 'Homestay' }, { key: 'APARTMENT', label: 'Apartment' },
      { key: 'CONDOMINIUM', label: 'Condominium' }, { key: 'VILLA', label: 'Villa' },
      { key: 'CHALET', label: 'Chalet' }, { key: 'RESORT', label: 'Resort' },
      { key: 'HOTEL', label: 'Hotel' }, { key: 'ROOM_RENTAL', label: 'Room Rental' },
      { key: 'EVENT_SPACE', label: 'Event Space' }, { key: 'COMMERCIAL_SPACE', label: 'Office / Commercial Space' },
      { key: 'OTHER_PROPERTY', label: 'Other Property' },
    ],
    offeringPresets: [
      { key: 'ENTIRE_PROPERTY', label: 'Entire Property' }, { key: 'MULTIPLE_UNITS', label: 'Multiple Units' },
      { key: 'INDIVIDUAL_ROOM', label: 'Individual Room' }, { key: 'VENUE_SPACE', label: 'Venue / Space' },
      { key: 'PACKAGE', label: 'Package' }, { key: 'OTHER_PROPERTY_OFFER', label: 'Other Property / Package' },
    ],
    offeringFields: propertyFields, customFields: [], workflows: ['BOOKING','RESERVATION','ENQUIRY'], defaultWorkflow: 'BOOKING',
  },
  BEAUTY_WELLNESS: {
    key: 'BEAUTY_WELLNESS', label: 'Beauty & Wellness', description: 'Salon, spa, beauty and wellness appointments.', offeringKind: 'SERVICE',
    labels: { offeringSingular: 'Service', offeringPlural: 'Services', transactionSingular: 'Appointment', transactionPlural: 'Appointments', customerSingular: 'Client', staffSingular: 'Staff' },
    subtypes: [
      { key: 'HAIR_SALON', label: 'Hair Salon' }, { key: 'BEAUTY_STUDIO', label: 'Beauty Studio' },
      { key: 'SPA', label: 'Spa' }, { key: 'MASSAGE_CENTRE', label: 'Massage Centre' },
      { key: 'NAIL_STUDIO', label: 'Nail Studio' }, { key: 'MAKEUP_STUDIO', label: 'Makeup Studio' },
      { key: 'OTHER_BEAUTY', label: 'Other Beauty / Wellness' },
    ],
    offeringPresets: [
      { key: 'HAIRCUT', label: 'Haircut' }, { key: 'HAIR_COLORING', label: 'Hair Coloring' },
      { key: 'FACIAL', label: 'Facial' }, { key: 'MASSAGE', label: 'Massage' },
      { key: 'MANICURE_PEDICURE', label: 'Manicure / Pedicure' }, { key: 'SPA_TREATMENT', label: 'Spa Treatment' },
      { key: 'MAKEUP', label: 'Makeup' }, { key: 'OTHER_SERVICES', label: 'Other Services' },
    ],
    offeringFields: serviceFields,
    customFields: [
      { key: 'branch', label: 'Branch', type: 'TEXT', placeholder: 'Main branch' },
      { key: 'bufferMinutes', label: 'Buffer time (minutes)', type: 'NUMBER' },
      { key: 'walkInAllowed', label: 'Walk-in allowed', type: 'BOOLEAN' },
      { key: 'reschedulePolicy', label: 'Reschedule policy', type: 'TEXT', placeholder: 'At least 24 hours before appointment' },
    ],
    workflows: ['APPOINTMENT','WALK_IN','ENQUIRY'], defaultWorkflow: 'APPOINTMENT',
  },
  HEALTHCARE: {
    key: 'HEALTHCARE', label: 'Healthcare / Clinic', description: 'Consultations, treatments and patient appointments.', offeringKind: 'SERVICE',
    labels: { offeringSingular: 'Treatment', offeringPlural: 'Treatments', transactionSingular: 'Appointment', transactionPlural: 'Appointments', customerSingular: 'Patient', staffSingular: 'Practitioner' },
    subtypes: [{ key: 'GENERAL_CLINIC', label: 'General Clinic' },{ key: 'DENTAL', label: 'Dental Clinic' },{ key: 'PHYSIOTHERAPY', label: 'Physiotherapy' },{ key: 'CHIROPRACTIC', label: 'Chiropractic' },{ key: 'MENTAL_HEALTH', label: 'Mental Health' },{ key: 'OTHER_HEALTHCARE', label: 'Other Healthcare' }],
    offeringPresets: [{ key: 'CONSULTATION', label: 'Consultation' },{ key: 'FOLLOW_UP', label: 'Follow-up' },{ key: 'TREATMENT', label: 'Treatment' },{ key: 'ASSESSMENT', label: 'Assessment' },{ key: 'SCREENING', label: 'Screening' },{ key: 'OTHER_TREATMENT', label: 'Other Treatment' }],
    offeringFields: serviceFields,
    customFields: [
      { key: 'appointmentAvailability', label: 'Appointment availability', type: 'TEXT', placeholder: 'Weekdays, 9am–5pm' },
      { key: 'patientInformation', label: 'Patient information required', type: 'LIST', placeholder: 'Name, contact, preferred practitioner' },
    ],
    workflows: ['APPOINTMENT','WALK_IN','ENQUIRY'], defaultWorkflow: 'APPOINTMENT',
  },
  AUTOMOTIVE: {
    key: 'AUTOMOTIVE', label: 'Automotive', description: 'Workshop, detailing and vehicle service bookings.', offeringKind: 'SERVICE',
    labels: { offeringSingular: 'Job', offeringPlural: 'Jobs', transactionSingular: 'Booking', transactionPlural: 'Bookings', customerSingular: 'Customer', staffSingular: 'Technician' },
    subtypes: [{ key: 'WORKSHOP', label: 'Workshop' },{ key: 'CAR_WASH', label: 'Car Wash' },{ key: 'DETAILING', label: 'Detailing' },{ key: 'TYRE_SHOP', label: 'Tyre Shop' },{ key: 'MOTORCYCLE', label: 'Motorcycle Service' },{ key: 'OTHER_AUTOMOTIVE', label: 'Other Automotive' }],
    offeringPresets: [{ key: 'INSPECTION', label: 'Inspection' },{ key: 'GENERAL_SERVICE', label: 'General Service' },{ key: 'CAR_WASH', label: 'Car Wash' },{ key: 'DETAILING', label: 'Detailing' },{ key: 'TYRE_SERVICE', label: 'Tyre Service' },{ key: 'REPAIR', label: 'Repair' },{ key: 'OTHER_JOB', label: 'Other Job' }],
    offeringFields: serviceFields,
    customFields: [
      { key: 'vehicleInformation', label: 'Vehicle information required', type: 'LIST', required: true, placeholder: 'Vehicle type, brand, model, year, registration number, mileage' },
      { key: 'requiredParts', label: 'Required parts / materials', type: 'LIST', placeholder: 'Engine oil, oil filter' },
      { key: 'serviceBayRequired', label: 'Workshop bay required', type: 'BOOLEAN' },
      { key: 'estimateOnly', label: 'Price is an estimate', type: 'BOOLEAN' },
    ],
    workflows: ['BOOKING','APPOINTMENT','WALK_IN','ENQUIRY'], defaultWorkflow: 'BOOKING',
  },
  PROFESSIONAL_SERVICES: {
    key: 'PROFESSIONAL_SERVICES', label: 'Professional Services', description: 'Consulting and expert-led engagements.', offeringKind: 'SERVICE',
    labels: { offeringSingular: 'Service', offeringPlural: 'Services', transactionSingular: 'Consultation', transactionPlural: 'Consultations', customerSingular: 'Client', staffSingular: 'Consultant' },
    subtypes: [{ key: 'CONSULTING', label: 'Consulting' },{ key: 'LEGAL', label: 'Legal' },{ key: 'ACCOUNTING', label: 'Accounting' },{ key: 'COACHING', label: 'Coaching' },{ key: 'CREATIVE_AGENCY', label: 'Creative Agency' },{ key: 'OTHER_PROFESSIONAL', label: 'Other Professional Service' }],
    offeringPresets: [{ key: 'INITIAL_CONSULTATION', label: 'Initial Consultation' },{ key: 'HOURLY_SESSION', label: 'Hourly Session' },{ key: 'PROJECT_PACKAGE', label: 'Project Package' },{ key: 'REVIEW', label: 'Review / Audit' },{ key: 'OTHER_SERVICE', label: 'Other Service' }],
    offeringFields: serviceFields,
    customFields: [
      { key: 'pricingMode', label: 'Pricing method', type: 'SELECT', required: true, options: ['Fixed price','Starting price','Quotation'] },
      { key: 'qualificationQuestions', label: 'Lead qualification questions', type: 'LIST', placeholder: 'Budget, required service, project size, timeline' },
      { key: 'deliverables', label: 'Included deliverables', type: 'LIST', placeholder: 'Consultation report, proposal' },
    ],
    workflows: ['ENQUIRY','APPOINTMENT','QUOTATION'], defaultWorkflow: 'ENQUIRY',
  },
  EDUCATION: {
    key: 'EDUCATION', label: 'Education', description: 'Classes, tuition, training and enrolment.', offeringKind: 'CLASS',
    labels: { offeringSingular: 'Class', offeringPlural: 'Classes', transactionSingular: 'Enrolment', transactionPlural: 'Enrolments', customerSingular: 'Student', staffSingular: 'Instructor' },
    subtypes: [{ key: 'TUITION_CENTRE', label: 'Tuition Centre' },{ key: 'TRAINING_PROVIDER', label: 'Training Provider' },{ key: 'MUSIC_CLASS', label: 'Music Class' },{ key: 'FITNESS_CLASS', label: 'Fitness Class' },{ key: 'ONLINE_COURSE', label: 'Online Course' },{ key: 'OTHER_EDUCATION', label: 'Other Education' }],
    offeringPresets: [{ key: 'ONE_TO_ONE', label: 'One-to-one Class' },{ key: 'GROUP_CLASS', label: 'Group Class' },{ key: 'WORKSHOP', label: 'Workshop' },{ key: 'COURSE_PACKAGE', label: 'Course Package' },{ key: 'ASSESSMENT', label: 'Assessment' },{ key: 'OTHER_CLASS', label: 'Other Class' }],
    offeringFields: serviceFields,
    customFields: [
      { key: 'subject', label: 'Subject', type: 'TEXT', required: true, placeholder: 'Mathematics' },
      { key: 'level', label: 'Level', type: 'TEXT', placeholder: 'Form 5' },
      { key: 'classSchedule', label: 'Class schedule', type: 'TEXT', required: true, placeholder: 'Monday, 8:00 PM' },
      { key: 'registrationFeeMinor', label: 'Registration fee (MYR)', type: 'MONEY' },
    ],
    workflows: ['BOOKING','RESERVATION','ENQUIRY'], defaultWorkflow: 'BOOKING',
  },
  FOOD_BEVERAGE: {
    key: 'FOOD_BEVERAGE', label: 'Food & Beverage', description: 'Menu items, orders, catering and table reservations.', offeringKind: 'PRODUCT',
    labels: { offeringSingular: 'Product', offeringPlural: 'Products', transactionSingular: 'Order', transactionPlural: 'Orders', customerSingular: 'Customer', staffSingular: 'Team member' },
    subtypes: [{ key: 'RESTAURANT', label: 'Restaurant' },{ key: 'CAFE', label: 'Cafe' },{ key: 'BAKERY', label: 'Bakery' },{ key: 'CATERING', label: 'Catering' },{ key: 'FOOD_STALL', label: 'Food Stall' },{ key: 'FOOD_DELIVERY', label: 'Food Delivery' },{ key: 'CLOUD_KITCHEN', label: 'Cloud Kitchen' },{ key: 'OTHER_FOOD', label: 'Other F&B' }],
    offeringPresets: [{ key: 'FOOD', label: 'Food' },{ key: 'BEVERAGE', label: 'Beverage' },{ key: 'SET_MENU', label: 'Set Menu' },{ key: 'CATERING_PACKAGE', label: 'Catering Package' },{ key: 'BUFFET_PACKAGE', label: 'Buffet Package' },{ key: 'OTHER_MENU_ITEM', label: 'Other Menu Item' }],
    offeringFields: ['NAME','DESCRIPTION','PRICE','CAPACITY','DEPOSIT','STOCK','PREPARATION_TIME'],
    customFields: [
      { key: 'category', label: 'Menu category', type: 'TEXT', required: true, placeholder: 'Main course' },
      { key: 'variants', label: 'Variants', type: 'LIST', placeholder: 'Biasa, Ayam, Rendang' },
      { key: 'addOns', label: 'Add-ons', type: 'LIST', placeholder: 'Telur, sambal extra' },
      { key: 'availabilityNote', label: 'Availability', type: 'TEXT', placeholder: 'Daily while stock lasts' },
      { key: 'orderChannels', label: 'Order channels', type: 'LIST', placeholder: 'Dine-in, pickup, delivery, pre-order' },
    ],
    workflows: ['ORDER','RESERVATION','WALK_IN','ENQUIRY'], defaultWorkflow: 'ORDER',
  },
  RETAIL: {
    key: 'RETAIL', label: 'Retail', description: 'Products, variants, inventory and customer orders.', offeringKind: 'PRODUCT',
    labels: { offeringSingular: 'Product', offeringPlural: 'Products', transactionSingular: 'Order', transactionPlural: 'Orders', customerSingular: 'Customer', staffSingular: 'Team member' },
    subtypes: [{ key: 'FASHION', label: 'Fashion' },{ key: 'GROCERY', label: 'Grocery' },{ key: 'ELECTRONICS', label: 'Electronics' },{ key: 'BEAUTY_PRODUCT', label: 'Beauty Product' },{ key: 'FURNITURE', label: 'Furniture' },{ key: 'GIFT_SHOP', label: 'Gift Shop' },{ key: 'ONLINE_SELLER', label: 'Online Seller' },{ key: 'OTHER_RETAIL', label: 'Other Retail' }],
    offeringPresets: [{ key: 'PHYSICAL_PRODUCT', label: 'Physical Product' },{ key: 'PRODUCT_VARIANT', label: 'Product with Variants' },{ key: 'BUNDLE', label: 'Bundle / Set' },{ key: 'PREORDER_ITEM', label: 'Pre-order Item' },{ key: 'OTHER_PRODUCT', label: 'Other Product' }],
    offeringFields: ['NAME','DESCRIPTION','PRICE','CAPACITY','DEPOSIT','STOCK'],
    customFields: [
      { key: 'sku', label: 'SKU', type: 'TEXT', required: true, placeholder: 'SKU-001' },
      { key: 'category', label: 'Product category', type: 'TEXT', required: true, placeholder: 'Fashion' },
      { key: 'salePriceMinor', label: 'Sale price (MYR)', type: 'MONEY' },
      { key: 'variants', label: 'Variants', type: 'LIST', placeholder: 'Size S, M, L; Black, White' },
      { key: 'imageUrls', label: 'Image URLs', type: 'LIST', placeholder: 'https://…' },
    ],
    workflows: ['ORDER','ENQUIRY'], defaultWorkflow: 'ORDER',
  },
  HOME_SERVICES: {
    key: 'HOME_SERVICES', label: 'Home Services', description: 'Location-based home jobs and technician scheduling.', offeringKind: 'SERVICE',
    labels: { offeringSingular: 'Service', offeringPlural: 'Services', transactionSingular: 'Job Booking', transactionPlural: 'Job Bookings', customerSingular: 'Customer', staffSingular: 'Technician' },
    subtypes: [{ key: 'CLEANING', label: 'Cleaning' },{ key: 'PLUMBING', label: 'Plumbing' },{ key: 'ELECTRICAL', label: 'Electrical' },{ key: 'AIRCOND', label: 'Aircond Service' },{ key: 'PEST_CONTROL', label: 'Pest Control' },{ key: 'RENOVATION', label: 'Renovation' },{ key: 'LANDSCAPING', label: 'Landscaping' },{ key: 'MOVING', label: 'Moving Service' },{ key: 'OTHER_HOME_SERVICE', label: 'Other Home Service' }],
    offeringPresets: [{ key: 'INSPECTION', label: 'Inspection' },{ key: 'STANDARD_JOB', label: 'Standard Job' },{ key: 'EMERGENCY_JOB', label: 'Emergency Job' },{ key: 'MAINTENANCE_PACKAGE', label: 'Maintenance Package' },{ key: 'QUOTATION_JOB', label: 'Quotation-based Job' },{ key: 'OTHER_HOME_JOB', label: 'Other Job' }],
    offeringFields: serviceFields,
    customFields: [
      { key: 'serviceAreas', label: 'Areas served', type: 'LIST', required: true, placeholder: 'Shah Alam, Klang, Subang' },
      { key: 'priceCalculation', label: 'Price calculation', type: 'TEXT', required: true, placeholder: 'Starting price plus distance and materials' },
      { key: 'customerAddressRequired', label: 'Customer address required', type: 'BOOLEAN' },
      { key: 'emergencyAvailable', label: 'Emergency service available', type: 'BOOLEAN' },
    ],
    workflows: ['BOOKING','APPOINTMENT','ENQUIRY','QUOTATION'], defaultWorkflow: 'BOOKING',
  },
  EVENT_BUSINESS: {
    key: 'EVENT_BUSINESS', label: 'Event Business', description: 'Event packages, venues, equipment and quotations.', offeringKind: 'PACKAGE',
    labels: { offeringSingular: 'Package', offeringPlural: 'Packages', transactionSingular: 'Booking', transactionPlural: 'Bookings', customerSingular: 'Client', staffSingular: 'Coordinator' },
    subtypes: [{ key: 'WEDDING_PLANNER', label: 'Wedding Planner' },{ key: 'EVENT_PLANNER', label: 'Event Planner' },{ key: 'PHOTOGRAPHY', label: 'Photography' },{ key: 'VIDEOGRAPHY', label: 'Videography' },{ key: 'EVENT_HALL', label: 'Event Hall' },{ key: 'CANOPY_RENTAL', label: 'Canopy Rental' },{ key: 'PA_SYSTEM', label: 'PA System' },{ key: 'CATERING', label: 'Catering' },{ key: 'DECORATION', label: 'Decoration' },{ key: 'OTHER_EVENT', label: 'Other Event Business' }],
    offeringPresets: [{ key: 'EVENT_PACKAGE', label: 'Event Package' },{ key: 'VENUE', label: 'Venue' },{ key: 'EQUIPMENT', label: 'Equipment' },{ key: 'EVENT_SERVICE', label: 'Event Service' },{ key: 'CUSTOM_QUOTATION', label: 'Custom Quotation' }],
    offeringFields: serviceFields,
    customFields: [
      { key: 'includedItems', label: 'Included items', type: 'LIST', required: true, placeholder: 'Venue, decoration, PA system' },
      { key: 'optionalAddOns', label: 'Optional add-ons', type: 'LIST', placeholder: 'Photography, catering' },
      { key: 'eventTypes', label: 'Supported event types', type: 'LIST', placeholder: 'Wedding, corporate, birthday' },
      { key: 'eventLocationRequired', label: 'Event location required', type: 'BOOLEAN' },
      { key: 'quotationRequired', label: 'Quotation required', type: 'BOOLEAN' },
    ],
    workflows: ['BOOKING','RESERVATION','ENQUIRY','QUOTATION'], defaultWorkflow: 'BOOKING',
  },
  GENERAL: {
    key: 'GENERAL', label: 'General Business', description: 'Flexible offers and customer enquiries.', offeringKind: 'PACKAGE',
    labels: { offeringSingular: 'Offering', offeringPlural: 'Offerings', transactionSingular: 'Request', transactionPlural: 'Requests', customerSingular: 'Customer', staffSingular: 'Staff' },
    subtypes: [{ key: 'SERVICE_BUSINESS', label: 'Service Business' },{ key: 'PRODUCT_BUSINESS', label: 'Product Business' },{ key: 'RENTAL', label: 'Rental' },{ key: 'EVENT', label: 'Event' },{ key: 'OTHER_GENERAL', label: 'Other' }],
    offeringPresets: [{ key: 'STANDARD_OFFER', label: 'Standard Offering' },{ key: 'PREMIUM_OFFER', label: 'Premium Offering' },{ key: 'PACKAGE', label: 'Package' },{ key: 'CUSTOM_REQUEST', label: 'Custom Request' },{ key: 'OTHER_OFFERING', label: 'Other Offering' }],
    offeringFields: serviceFields,
    customFields: [
      { key: 'category', label: 'Offering category', type: 'TEXT' },
      { key: 'customerQuestions', label: 'Customer questions', type: 'LIST', placeholder: 'Budget, preferred date, requirements' },
    ],
    workflows: ['APPOINTMENT','BOOKING','ORDER','RESERVATION','ENQUIRY','QUOTATION','WALK_IN'], defaultWorkflow: 'ENQUIRY',
  },
};

export function isBusinessType(value: string): value is BusinessTypeKey {
  return BUSINESS_TYPE_KEYS.includes(value as BusinessTypeKey);
}

export function getBusinessTypeDefinition(value: string): BusinessTypeDefinition {
  const aliases: Record<string, BusinessTypeKey> = { PROPERTY_HOMESTAY: 'PROPERTY', BEAUTY_SALON: 'BEAUTY_WELLNESS', EDUCATION_CLASSES: 'EDUCATION', FOOD_RETAIL: 'FOOD_BEVERAGE' };
  const normalized = value.trim().toUpperCase();
  const key = (aliases[normalized] ?? normalized) as BusinessTypeKey;
  const definition = BUSINESS_TYPES[key];
  if (!definition) throw new VerticalError('unsupported business type', 'validation');
  return definition;
}

export function isBusinessSubtype(type: string, subtype: string) {
  try {
    return getBusinessTypeDefinition(type).subtypes.some(row => row.key === subtype.trim().toUpperCase());
  } catch {
    return false;
  }
}
