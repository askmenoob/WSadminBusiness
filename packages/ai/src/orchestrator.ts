import { decideConfidence } from './confidence.js';
import { AiRouterError } from './router.js';
import type { AiIntent,AiIntentBusinessContext,AiIntentResult } from './intent.js';
import { assertAiToolAllowed,detectPromptInjection,guardAiBusinessTools } from './security.js';

export type AiBusinessContext=AiIntentBusinessContext;
export type AiResolvedService={id:string;name:string;priceMinor:number;currency:string};
export type AiResolvedLocation={id:string;name:string};
export type AiSlot={startsAt:string;label:string};
export type AiUpcomingBooking={id:string;serviceId:string;serviceName:string;locationId:string|null;startsAt:string};
export type AiResolvedProperty={id:string;name:string;weekdayPriceMinor:number;weekendPriceMinor:number;publicHolidayPriceMinor:number;depositMinor:number;currency:string;maxGuests:number;amenities:string[];checkInTime:string;checkOutTime:string};
export type AiUpcomingPropertyStay={id:string;propertyId:string;propertyName:string;checkIn:string;checkOut:string};

export interface AiBusinessTools {
  getBusinessContext(tenantId:string):Promise<AiBusinessContext>;
  resolveService(tenantId:string,name:string):Promise<AiResolvedService|null>;
  resolveLocation(tenantId:string,name:string):Promise<AiResolvedLocation|null>;
  findSlots(input:{tenantId:string;serviceId:string;locationId?:string;date:string}):Promise<AiSlot[]>;
  createBooking(input:{tenantId:string;customerId?:string|null;serviceId:string;locationId?:string;startsAt:string}):Promise<{id:string;startsAt:Date}>;
  listUpcoming(tenantId:string,customerId:string):Promise<AiUpcomingBooking[]>;
  reschedule(tenantId:string,bookingId:string,startsAt:string):Promise<{id:string;startsAt:Date}>;
  cancel(tenantId:string,bookingId:string):Promise<{id:string}>;
  resolveProperty(tenantId:string,name:string):Promise<AiResolvedProperty|null>;
  propertyAvailable(tenantId:string,propertyId:string,checkIn:string,checkOut:string,excludeStayId?:string):Promise<boolean>;
  createPropertyStay(input:{tenantId:string;propertyId:string;customerId?:string|null;checkIn:string;checkOut:string;guestCount:number}):Promise<{id:string}>;
  listUpcomingStays(tenantId:string,customerId:string):Promise<AiUpcomingPropertyStay[]>;
  reschedulePropertyStay(tenantId:string,stayId:string,checkIn:string,checkOut:string):Promise<{id:string}>;
  cancelPropertyStay(tenantId:string,stayId:string):Promise<{id:string}>;
  answerFaq(tenantId:string,question:string):Promise<{answer:string;sources:string[]}|null>;
  enqueueReply(input:{tenantId:string;instanceId:string;conversationId:string;toJid:string;text:string;idempotencyKey:string}):Promise<{id:string}>;
}
export interface IntentInterpreterLike { interpret(input:{tenantId:string;text:string;conversationId?:string|null;contextSummary?:string|null;businessContext?:AiIntentBusinessContext|null}):Promise<AiIntentResult>; }
export type AiOrchestratorResult={handled:boolean;action:'EXECUTE'|'CLARIFY'|'HANDOFF';intent:string;confidence:number;reason:string;reply:string|null;outboundMessageId:string|null;bookingId:string|null;knowledgeSources:string[]};
const money=(amount:number,currency:string)=>currency==='MYR'?`RM${(amount/100).toFixed(2)}`:`${currency} ${(amount/100).toFixed(2)}`;
const selectSlot=(slots:AiSlot[],time:string|null)=>{if(!slots.length)return null;if(!time)return slots[0]!;const normalized=time.trim().slice(0,5);return slots.find(slot=>slot.label.startsWith(normalized)||slot.label.includes(normalized))??null;};
const lower=(value:string)=>value.toLocaleLowerCase('ms-MY');

export class AiBookingOrchestrator {
  constructor(private readonly interpreter:IntentInterpreterLike,private readonly tools:AiBusinessTools){}
  private async send(ctx:any,text:string,key:string,result:Omit<AiOrchestratorResult,'reply'|'outboundMessageId'>){assertAiToolAllowed(result.intent as AiIntent,'SEND_REPLY');const row=await this.tools.enqueueReply({tenantId:ctx.tenantId,instanceId:ctx.instanceId,conversationId:ctx.conversationId,toJid:ctx.remoteJid,text,idempotencyKey:`ai:${ctx.eventKey}:${key}`});return{...result,reply:text,outboundMessageId:row.id};}

  private async propertyFlow(ctx:any,intent:AiIntentResult,tools:AiBusinessTools,base:Omit<AiOrchestratorResult,'reply'|'outboundMessageId'>){
    const property=intent.entities.service?await tools.resolveProperty(ctx.tenantId,intent.entities.service):null;
    if(['BOOK','PRICE','AVAILABILITY'].includes(intent.intent)&&!property)return this.send(ctx,'Saya tidak dapat padankan property, unit atau bilik itu. Boleh berikan nama yang tepat?',`property:${intent.intent}`,{...base,action:'CLARIFY',reason:'property_not_resolved'});
    if(intent.intent==='PRICE'&&property)return this.send(ctx,`${property.name}: weekday ${money(property.weekdayPriceMinor,property.currency)}, weekend ${money(property.weekendPriceMinor,property.currency)}, public holiday ${money(property.publicHolidayPriceMinor,property.currency)}. Deposit ${money(property.depositMinor,property.currency)}.`,'property-price',base);
    if((intent.intent==='AVAILABILITY'||intent.intent==='BOOK')&&property){
      if(!intent.entities.date)return this.send(ctx,'Tarikh check-in bila?',`checkin:${intent.intent}`,{...base,action:'CLARIFY',reason:'check_in_missing'});
      if(!intent.entities.endDate)return this.send(ctx,'Tarikh check-out bila?',`checkout:${intent.intent}`,{...base,action:'CLARIFY',reason:'check_out_missing'});
      const guests=intent.entities.pax??1;
      if(guests>property.maxGuests)return this.send(ctx,`${property.name} mempunyai kapasiti maksimum ${property.maxGuests} tetamu. Mahu pilihan lain?`,'property-capacity',{...base,action:'CLARIFY',reason:'guest_capacity_exceeded'});
      const available=await tools.propertyAvailable(ctx.tenantId,property.id,intent.entities.date,intent.entities.endDate);
      if(!available)return this.send(ctx,`${property.name} tidak kosong untuk ${intent.entities.date} hingga ${intent.entities.endDate}. Boleh beri tarikh lain?`,`property-none:${intent.intent}`,{...base,action:'CLARIFY',reason:'property_unavailable'});
      if(intent.intent==='AVAILABILITY')return this.send(ctx,`${property.name} masih kosong dari ${intent.entities.date} hingga ${intent.entities.endDate} untuk ${guests} tetamu. Check-in ${property.checkInTime}, check-out ${property.checkOutTime}.`,'property-availability',base);
      const stay=await tools.createPropertyStay({tenantId:ctx.tenantId,propertyId:property.id,customerId:ctx.customerId,checkIn:intent.entities.date,checkOut:intent.entities.endDate,guestCount:guests});
      return this.send(ctx,`Booking ${property.name} berjaya disahkan dari ${intent.entities.date} hingga ${intent.entities.endDate} untuk ${guests} tetamu. Rujukan ${stay.id.slice(0,8).toUpperCase()}.`,'property-book',{...base,bookingId:stay.id});
    }
    if(intent.intent==='RESCHEDULE'||intent.intent==='CANCEL'){
      if(!ctx.customerId)return{...base,handled:false,action:'HANDOFF' as const,reason:'customer_not_linked',reply:null,outboundMessageId:null};
      const rows=await tools.listUpcomingStays(ctx.tenantId,ctx.customerId);
      if(rows.length!==1)return this.send(ctx,rows.length?'Anda ada lebih daripada satu booking aktif. Sila nyatakan property yang mahu diurus.':'Tiada booking penginapan aktif ditemui.',`property-manage:${intent.intent}`,{...base,action:rows.length?'CLARIFY':'HANDOFF',reason:rows.length?'booking_ambiguous':'booking_not_found'});
      const stay=rows[0]!;
      if(intent.intent==='CANCEL'){const cancelled=await tools.cancelPropertyStay(ctx.tenantId,stay.id);return this.send(ctx,`Booking ${stay.propertyName} berjaya dibatalkan.`,'property-cancel',{...base,bookingId:cancelled.id});}
      if(!intent.entities.date)return this.send(ctx,'Tarikh check-in baru bila?','property-reschedule-checkin',{...base,action:'CLARIFY',reason:'check_in_missing'});
      if(!intent.entities.endDate)return this.send(ctx,'Tarikh check-out baru bila?','property-reschedule-checkout',{...base,action:'CLARIFY',reason:'check_out_missing'});
      const available=await tools.propertyAvailable(ctx.tenantId,stay.propertyId,intent.entities.date,intent.entities.endDate,stay.id);
      if(!available)return this.send(ctx,'Property itu tidak kosong untuk tarikh baharu. Boleh beri tarikh lain?','property-reschedule-unavailable',{...base,action:'CLARIFY',reason:'property_unavailable'});
      const moved=await tools.reschedulePropertyStay(ctx.tenantId,stay.id,intent.entities.date,intent.entities.endDate);
      return this.send(ctx,`Booking ${stay.propertyName} berjaya ditukar ke ${intent.entities.date} hingga ${intent.entities.endDate}.`,'property-reschedule',{...base,bookingId:moved.id});
    }
    return{...base,handled:false,action:'HANDOFF' as const,reason:'unsupported_property_execution',reply:null,outboundMessageId:null};
  }

  async handle(ctx:{tenantId:string;conversationId:string;instanceId:string;remoteJid:string;customerId?:string|null;text:string;eventKey:string;contextSummary?:string|null}):Promise<AiOrchestratorResult>{
    const risk=detectPromptInjection(ctx.text);if(risk.blocked)return{handled:false,action:'HANDOFF',intent:'HANDOFF',confidence:0,reason:risk.reason??'security_handoff',reply:null,outboundMessageId:null,bookingId:null,knowledgeSources:[]};
    let business:AiBusinessContext;try{business=await this.tools.getBusinessContext(ctx.tenantId);}catch{return{handled:false,action:'HANDOFF',intent:'HANDOFF',confidence:0,reason:'business_context_unavailable',reply:null,outboundMessageId:null,bookingId:null,knowledgeSources:[]};}
    if(!business.aiEnabled)return{handled:false,action:'HANDOFF',intent:'HANDOFF',confidence:0,reason:'tenant_ai_disabled',reply:null,outboundMessageId:null,bookingId:null,knowledgeSources:[]};
    let intent:AiIntentResult;try{intent=await this.interpreter.interpret({tenantId:ctx.tenantId,conversationId:ctx.conversationId,contextSummary:ctx.contextSummary,text:ctx.text,businessContext:business});}catch(error){return{handled:false,action:'HANDOFF',intent:'HANDOFF',confidence:0,reason:error instanceof AiRouterError?error.code:'intent_error',reply:null,outboundMessageId:null,bookingId:null,knowledgeSources:[]};}
    const tools=guardAiBusinessTools(intent.intent,this.tools),decision=decideConfidence(intent),base={handled:true,action:decision.action,intent:intent.intent,confidence:intent.confidence,reason:decision.reason,bookingId:null,knowledgeSources:[] as string[]};
    if(decision.action==='HANDOFF')return{...base,reply:null,outboundMessageId:null};
    if(decision.action==='CLARIFY')return this.send(ctx,decision.question??'Boleh jelaskan sedikit?',`clarify:${intent.intent}`,base);
    if(intent.intent==='FAQ'){const faq=await tools.answerFaq(ctx.tenantId,ctx.text);if(!faq)return{...base,handled:false,action:'HANDOFF',reason:'faq_not_grounded',reply:null,outboundMessageId:null};return this.send(ctx,faq.answer,'faq',{...base,knowledgeSources:faq.sources});}
    if(business.offeringKind==='PROPERTY')return this.propertyFlow(ctx,intent,tools,base);
    if(business.offeringKind==='PRODUCT'){
      const answer=await tools.answerFaq(ctx.tenantId,ctx.text);
      if(!answer)return{...base,handled:false,action:'HANDOFF',reason:'product_request_not_grounded',reply:null,outboundMessageId:null};
      return this.send(ctx,`${answer.answer} Jika anda mahu meneruskan ${lower(business.transactionSingular)}, saya boleh serahkan kepada team kami untuk pengesahan.`,'product-grounded',{...base,action:'CLARIFY',reason:'product_human_confirmation',knowledgeSources:answer.sources});
    }
    const service=intent.entities.service?await tools.resolveService(ctx.tenantId,intent.entities.service):null,location=intent.entities.location?await tools.resolveLocation(ctx.tenantId,intent.entities.location):null;
    if(['BOOK','PRICE','AVAILABILITY'].includes(intent.intent)&&!service)return this.send(ctx,`Saya tidak dapat padankan ${lower(business.offeringSingular)} itu. Boleh berikan nama yang tepat?`,`offering:${intent.intent}`,{...base,action:'CLARIFY',reason:'service_not_resolved'});
    if(intent.entities.location&&!location)return this.send(ctx,'Saya tidak dapat padankan lokasi itu. Lokasi atau cawangan mana yang anda maksudkan?',`location:${intent.intent}`,{...base,action:'CLARIFY',reason:'location_not_resolved'});
    if(intent.intent==='PRICE'&&service)return this.send(ctx,`${service.name}: ${money(service.priceMinor,service.currency)}.`,'price',base);
    if((intent.intent==='AVAILABILITY'||intent.intent==='BOOK')&&service){if(!intent.entities.date)return this.send(ctx,'Tarikh bila yang anda mahu?',`date:${intent.intent}`,{...base,action:'CLARIFY',reason:'date_missing'});const slots=await tools.findSlots({tenantId:ctx.tenantId,serviceId:service.id,locationId:location?.id,date:intent.entities.date});if(!slots.length)return this.send(ctx,'Tiada slot tersedia pada tarikh tersebut. Cuba tarikh lain.',`none:${intent.intent}`,{...base,action:'CLARIFY',reason:'no_slots'});if(intent.intent==='AVAILABILITY')return this.send(ctx,`Slot tersedia: ${slots.slice(0,5).map(slot=>slot.label).join(', ')}.`,'availability',base);const slot=selectSlot(slots,intent.entities.time);if(!slot)return this.send(ctx,`Masa itu tidak tersedia. Pilihan: ${slots.slice(0,5).map(row=>row.label).join(', ')}.`,'slot',{...base,action:'CLARIFY',reason:'time_not_available'});const booking=await tools.createBooking({tenantId:ctx.tenantId,customerId:ctx.customerId,serviceId:service.id,locationId:location?.id,startsAt:slot.startsAt});return this.send(ctx,`${business.transactionSingular} ${service.name} berjaya disahkan pada ${slot.label}. Rujukan ${booking.id.slice(0,8).toUpperCase()}.`,'book',{...base,bookingId:booking.id});}
    if(intent.intent==='RESCHEDULE'||intent.intent==='CANCEL'){if(!ctx.customerId)return{...base,handled:false,action:'HANDOFF',reason:'customer_not_linked',reply:null,outboundMessageId:null};const rows=await tools.listUpcoming(ctx.tenantId,ctx.customerId);if(rows.length!==1)return this.send(ctx,rows.length?`Anda ada lebih daripada satu ${lower(business.transactionSingular)} aktif. Sila nyatakan yang mahu diurus.`:`Tiada ${lower(business.transactionSingular)} aktif ditemui.`,`manage:${intent.intent}`,{...base,action:rows.length?'CLARIFY':'HANDOFF',reason:rows.length?'booking_ambiguous':'booking_not_found'});const booking=rows[0]!;if(intent.intent==='CANCEL'){const cancelled=await tools.cancel(ctx.tenantId,booking.id);return this.send(ctx,`${business.transactionSingular} ${booking.serviceName} berjaya dibatalkan.`,'cancel',{...base,bookingId:cancelled.id});}if(!intent.entities.date)return this.send(ctx,'Tarikh baru bila yang anda mahu?','reschedule-date',{...base,action:'CLARIFY',reason:'date_missing'});const slots=await tools.findSlots({tenantId:ctx.tenantId,serviceId:booking.serviceId,locationId:booking.locationId??undefined,date:intent.entities.date}),slot=selectSlot(slots,intent.entities.time);if(!slot)return this.send(ctx,`Masa itu tidak tersedia. Pilihan: ${slots.slice(0,5).map(row=>row.label).join(', ')}.`,'reschedule-slot',{...base,action:'CLARIFY',reason:'time_not_available'});const moved=await tools.reschedule(ctx.tenantId,booking.id,slot.startsAt);return this.send(ctx,`${business.transactionSingular} ${booking.serviceName} berjaya ditukar ke ${slot.label}.`,'reschedule',{...base,bookingId:moved.id});}
    return{...base,handled:false,action:'HANDOFF',reason:'unsupported_execution',reply:null,outboundMessageId:null};
  }
}
