export type CustomerStatus = 'ACTIVE' | 'ARCHIVED';
export type Customer = {
  id: string;
  tenantId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  locale: string;
  status: CustomerStatus;
  createdAt: Date;
  updatedAt: Date;
};
export type CreateCustomerInput = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  locale?: string | null;
};
export type UpdateCustomerInput = Partial<CreateCustomerInput> & { status?: CustomerStatus };
export type CustomerSearch = { q?: string; limit?: number; offset?: number; includeArchived?: boolean };
export interface CustomerRepository {
  create(tenantId: string, input: Required<Pick<CreateCustomerInput,'locale'>> & Omit<CreateCustomerInput,'locale'>): Promise<Customer>;
  getById(tenantId: string, customerId: string): Promise<Customer | null>;
  search(tenantId: string, query: CustomerSearch): Promise<Customer[]>;
  update(tenantId: string, customerId: string, input: UpdateCustomerInput): Promise<Customer | null>;
}
export class CustomerValidationError extends Error { constructor(message:string){super(message);this.name='CustomerValidationError';} }
export class CustomerNotFoundError extends Error { constructor(){super('Customer not found');this.name='CustomerNotFoundError';} }
export class CustomerConflictError extends Error { constructor(message='Customer already exists'){super(message);this.name='CustomerConflictError';} }
function cleanText(value: string | null | undefined) { const v = value?.trim(); return v ? v : null; }
export function normalizePhone(value: string | null | undefined) {
  const raw = cleanText(value); if (!raw) return null;
  const plus = raw.startsWith('+'); const digits = raw.replace(/\D/g,'');
  if (digits.length < 7 || digits.length > 15) throw new CustomerValidationError('phone must contain 7 to 15 digits');
  return plus ? `+${digits}` : digits;
}
export function normalizeEmail(value: string | null | undefined) {
  const email = cleanText(value)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CustomerValidationError('invalid email');
  return email;
}
function normalizeCreate(input: CreateCustomerInput) {
  const name = cleanText(input.name), phone = normalizePhone(input.phone), email = normalizeEmail(input.email);
  if (!name && !phone && !email) throw new CustomerValidationError('customer requires name, phone or email');
  return { name, phone, email, locale: cleanText(input.locale) ?? 'ms-MY' };
}
export class CustomerService {
  constructor(private readonly repo: CustomerRepository) {}
  create(tenantId:string,input:CreateCustomerInput){return this.repo.create(tenantId,normalizeCreate(input));}
  async get(tenantId:string,id:string){const row=await this.repo.getById(tenantId,id);if(!row)throw new CustomerNotFoundError();return row;}
  search(tenantId:string,query:CustomerSearch={}){return this.repo.search(tenantId,{...query,limit:Math.min(Math.max(query.limit??50,1),100),offset:Math.max(query.offset??0,0)});}
  async update(tenantId:string,id:string,input:UpdateCustomerInput){
    const normalized:UpdateCustomerInput={...input};
    if('name' in input) normalized.name=cleanText(input.name);
    if('phone' in input) normalized.phone=normalizePhone(input.phone);
    if('email' in input) normalized.email=normalizeEmail(input.email);
    if('locale' in input) normalized.locale=cleanText(input.locale) ?? 'ms-MY';
    const row=await this.repo.update(tenantId,id,normalized);
    if(!row)throw new CustomerNotFoundError();
    return row;
  }
  async archive(tenantId:string,id:string){return this.update(tenantId,id,{status:'ARCHIVED'});}
}
export * from './crm.js';
