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

export interface Lookup {
  id: string;
  name: string;
  code?: string;
  key?: string;
  active?: boolean;
}
export interface ProjectRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  clientId: string;
  managerId: string;
  categoryId: string;
  departmentId: string | null;
  startDate: string;
  targetDate: string;
  actualCompletionDate: string | null;
  budget: string | null;
  priority: string;
  status: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  progress: number;
  totalTasks: number;
  completedTasks: number;
  client: Lookup & { contactPerson: string | null; email: string | null; phone: string | null };
  manager: Lookup & { email: string };
  category: Lookup;
  department: Lookup | null;
  canManage?: boolean;
  activity?: { id: string; action: string; timestamp: string; actor: { name: string } | null }[];
}
