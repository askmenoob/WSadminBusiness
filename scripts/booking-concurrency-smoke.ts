import { createBookingRepository,createPool } from '@wsadmin-business/database';
async function main(){
  const required=['WSB_TEST_TENANT_ID','WSB_TEST_SERVICE_ID','WSB_TEST_STAFF_ID','WSB_TEST_RESOURCE_ID'] as const;
  for(const key of required)if(!process.env[key])throw new Error(`missing ${key}`);
  const pool=createPool();
  try{
    const repo=createBookingRepository(pool);
    const startsAt=new Date(process.env.WSB_TEST_STARTS_AT??'2026-08-31T02:00:00Z');
    const input={tenantId:process.env.WSB_TEST_TENANT_ID!,customerId:null,serviceId:process.env.WSB_TEST_SERVICE_ID!,staffId:process.env.WSB_TEST_STAFF_ID!,resourceId:process.env.WSB_TEST_RESOURCE_ID!,status:'CONFIRMED' as const,startsAt,endsAt:new Date(startsAt.getTime()+60*60000),effectiveStartsAt:new Date(startsAt.getTime()-15*60000),effectiveEndsAt:new Date(startsAt.getTime()+75*60000)};
    const results=await Promise.allSettled([repo.createWithConflictGuard(input),repo.createWithConflictGuard(input)]);
    const fulfilled=results.filter(r=>r.status==='fulfilled').length;
    const rejected=results.filter(r=>r.status==='rejected').length;
    console.log(JSON.stringify({fulfilled,rejected,reasons:results.filter(r=>r.status==='rejected').map(r=>String((r as PromiseRejectedResult).reason?.message??(r as PromiseRejectedResult).reason))}));
    if(fulfilled!==1||rejected!==1)process.exitCode=1;
  }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exit(1);});
