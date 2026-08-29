import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { OnboardingService } from '@wsadmin-business/saas';
import { createAiKnowledgeRepository,createPool,createSaasRepository } from '@wsadmin-business/database';

async function main(){
  const pool=createPool(),tenantId=randomUUID();
  try{
    await pool.query(`INSERT INTO tenants(id,name,slug) VALUES($1,'Dynamic Property UAT',$2)`,[tenantId,`dynamic-property-${tenantId.slice(0,8)}`]);
    await pool.query(`INSERT INTO businesses(tenant_id,name) VALUES($1,'Dynamic Property UAT')`,[tenantId]);
    const onboarding=new OnboardingService(createSaasRepository(pool));
    await onboarding.save(tenantId,'BUSINESS_PROFILE',{businessName:'Villa Mawar Homestay',registrationNumber:'UAT-001',contactEmail:'owner@example.test',phoneE164:'+60123456789',websiteUrl:'',addressLine1:'Janda Baik',addressLine2:'',city:'Bentong',state:'Pahang',postcode:'28750',countryCode:'MY',timezone:'Asia/Kuala_Lumpur'});
    await onboarding.save(tenantId,'BUSINESS_TYPE',{businessType:'PROPERTY'});
    await onboarding.save(tenantId,'BUSINESS_SUBTYPE',{businessType:'PROPERTY',businessSubtype:'HOMESTAY'});
    await onboarding.save(tenantId,'OFFERINGS',{businessType:'PROPERTY',selectedOffers:['ENTIRE_PROPERTY']});
    await onboarding.save(tenantId,'OFFERING_DETAILS',{businessType:'PROPERTY',items:[{sourceKey:'ENTIRE_PROPERTY',name:'Villa Mawar',description:'Private family homestay',propertyCode:'VM-01',locationName:'Janda Baik, Pahang',googleMapsUrl:'https://maps.google.com/?q=Janda+Baik',roomType:'Entire villa',unitCount:1,roomCount:4,bedrooms:3,bathrooms:2,maxGuests:12,privatePool:true,amenities:['Wi-Fi','BBQ','Parking','Private pool'],weekdayPriceMinor:35000,weekendPriceMinor:45000,publicHolidayPriceMinor:55000,peakSeasonPriceMinor:60000,extraGuestChargeMinor:3000,cleaningFeeMinor:5000,depositMinor:10000,minimumNights:1,maximumNights:7,sameDayBooking:false,checkInTime:'15:00',checkOutTime:'11:00',earlyCheckInAllowed:true,lateCheckOutAllowed:false,availability:'Available daily unless blocked by a confirmed stay',bookingRules:'Minimum one night. No smoking indoors.',cancellationPolicy:'Free cancellation up to seven days before check-in.',active:true}]});
    await onboarding.save(tenantId,'WORKFLOW',{businessType:'PROPERTY',workflowKind:'BOOKING',workflowKinds:['BOOKING','ENQUIRY'],slotIntervalMinutes:30,minimumLeadMinutes:120,bookingHorizonDays:365,cancellationDeadlineMinutes:1440,openTime:'08:00',closeTime:'22:00',workingDays:[0,1,2,3,4,5,6],autoConfirm:true});
    await onboarding.save(tenantId,'PAYMENT',{businessType:'PROPERTY',paymentTiming:'DEPOSIT',depositType:'FIXED',depositValue:10000,paymentMethods:['ONLINE_BANKING','CARD'],paymentPolicy:'RM100 security deposit is required before booking confirmation.'});
    await onboarding.save(tenantId,'WHATSAPP_AI',{businessType:'PROPERTY',whatsappEnabled:true,aiEnabled:true,tone:'FRIENDLY',languages:['ms','en'],handoffMessage:'Host kami akan membantu anda.',businessSummary:'Villa Mawar is a Homestay. AI is a Homestay Booking Assistant and must use property, guest, stay, check-in and check-out terminology.',connectionStatus:'DISCONNECTED'});
    const completed=await onboarding.save(tenantId,'COMPLETE',{});
    assert.equal(completed.completed,true);
    const projected=await pool.query(`SELECT b.business_type,b.business_subtype,b.offering_kind,b.workflow_kind,
      (SELECT count(*)::int FROM business_offerings o WHERE o.tenant_id=b.tenant_id AND o.offering_type='PROPERTY' AND o.active=true) offering_count,
      (SELECT count(*)::int FROM properties p WHERE p.tenant_id=b.tenant_id AND p.property_code='VM-01' AND p.private_pool=true AND p.unit_count=1 AND p.room_count=4 AND p.public_holiday_price_minor=55000 AND p.peak_season_price_minor=60000 AND p.extra_guest_charge_minor=3000 AND p.cleaning_fee_minor=5000) property_count,
      (SELECT count(*)::int FROM services s WHERE s.tenant_id=b.tenant_id) service_count,
      (SELECT count(*)::int FROM staff_profiles s WHERE s.tenant_id=b.tenant_id) staff_count
      FROM businesses b WHERE b.tenant_id=$1`,[tenantId]);
    assert.deepEqual(projected.rows[0],{business_type:'PROPERTY',business_subtype:'HOMESTAY',offering_kind:'PROPERTY',workflow_kind:'BOOKING',offering_count:1,property_count:1,service_count:0,staff_count:0});
    const context=await createSaasRepository(pool).getBusinessContext(tenantId);
    assert.equal(context?.labels.offeringSingular,'Property');
    assert.equal(context?.labels.transactionSingular,'Booking');
    const sources=await createAiKnowledgeRepository(pool).search(tenantId,'Villa Mawar ada private pool dan berapa deposit?',8);
    assert.ok(sources.some(source=>source.type==='BUSINESS_CONTEXT'));
    assert.ok(sources.some(source=>source.type==='OFFERING'&&/Private pool yes/i.test(source.content)&&/Deposit RM100\.00/i.test(source.content)&&/Peak season RM600\.00/i.test(source.content)&&/Cancellation policy: Free cancellation/i.test(source.content)));
    assert.equal(sources.some(source=>/Service duration|salon/i.test(source.content)),false);
    console.log(JSON.stringify({status:'PASS',tenantType:'PROPERTY',subtype:'HOMESTAY',domainPropertyCreated:true,stayRulesProjected:true,genericServiceNotCreated:true,propertyAiKnowledgeGrounded:true}));
  }finally{await pool.query('DELETE FROM tenants WHERE id=$1',[tenantId]).catch(()=>undefined);await pool.end();}
}
main().catch(error=>{console.error(error);process.exit(1);});
