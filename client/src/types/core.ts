export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}
export interface ClientRecord {
  id: string;
  code: string;
  name: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  industry: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
