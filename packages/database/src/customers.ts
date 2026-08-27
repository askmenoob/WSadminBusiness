import type { Pool } from 'pg';
import { CustomerConflictError, type Customer, type CustomerRepository, type CustomerSearch, type CreateCustomerInput, type UpdateCustomerInput } from '@wsadmin-business/customers';
function map(row:any):Customer{return{id:row.id,tenantId:row.tenant_id,name:row.name,phone:row.phone,email:row.email,locale:row.locale,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at};}
function translate(error:unknown):never{if(typeof error==='object'&&error&&'code' in error&&(error as any).code==='23505')throw new CustomerConflictError('phone or email already exists for this tenant');throw error;}
export function createCustomerRepository(pool:Pool):CustomerRepository{return{
  async create(tenantId:string,input:Required<Pick<CreateCustomerInput,'locale'>>&Omit<CreateCustomerInput,'locale'>){
    try{const r=await pool.query(`INSERT INTO customers(tenant_id,name,phone,email,locale) VALUES($1,$2,$3,$4,$5) RETURNING *`,[tenantId,input.name??null,input.phone??null,input.email??null,input.locale]);return map(r.rows[0]);}
    catch(e){return translate(e);}
  },
  async getById(tenantId:string,customerId:string){const r=await pool.query('SELECT * FROM customers WHERE tenant_id=$1 AND id=$2',[tenantId,customerId]);return r.rowCount?map(r.rows[0]):null;},
  async search(tenantId:string,query:CustomerSearch){
    const q=query.q?.trim()??'',limit=query.limit??50,offset=query.offset??0;
    const r=await pool.query(`SELECT * FROM customers WHERE tenant_id=$1 AND ($2::boolean OR status <> 'ARCHIVED') AND ($3='' OR coalesce(name,'') ILIKE '%'||$3||'%' OR coalesce(phone,'') ILIKE '%'||$3||'%' OR coalesce(email,'') ILIKE '%'||$3||'%') ORDER BY updated_at DESC LIMIT $4 OFFSET $5`,[tenantId,query.includeArchived??false,q,limit,offset]);
    return r.rows.map(map);
  },
  async update(tenantId:string,customerId:string,input:UpdateCustomerInput){
    const current=await pool.query('SELECT * FROM customers WHERE tenant_id=$1 AND id=$2',[tenantId,customerId]);
    if(!current.rowCount)return null;
    const row=current.rows[0];
    try{
      const r=await pool.query(`UPDATE customers SET name=$3,phone=$4,email=$5,locale=$6,status=$7,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,[tenantId,customerId,'name'in input?input.name:row.name,'phone'in input?input.phone:row.phone,'email'in input?input.email:row.email,'locale'in input?input.locale:row.locale,'status'in input?input.status:row.status]);
      return map(r.rows[0]);
    }catch(e){return translate(e);}
  }
};}
