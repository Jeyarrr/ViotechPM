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
  members?: MemberRecord[];
  tasks?: TaskRecord[];
  activity?: { id: string; action: string; timestamp: string; actor: { name: string } | null }[];
}

export interface MemberRecord {
  id: string;
  userId: string;
  role: string;
  assignedAt: string;
  user: { id: string; name: string; email: string; status: string; profileImage: string | null };
}
export interface EmployeeRecord {
  id: string;
  name: string;
  email: string;
  status: string;
  profileImage: string | null;
  roleId: string;
  departmentId: string | null;
  role: { key: string; name: string };
  department: Lookup | null;
  createdAt: string;
  lastLoginAt: string | null;
  memberships: { project: Lookup & { archivedAt: string | null } }[];
}
export interface TaskRecord {
  milestoneId: string | null;
  milestone: { id: string; title: string; archivedAt: string | null } | null;
  id: string;
  code: string;
  title: string;
  description: string | null;
  projectId: string;
  assigneeId: string | null;
  priority: string;
  status: string;
  startDate: string;
  dueDate: string;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project: Lookup & { managerId: string; archivedAt: string | null };
  assignee: (Lookup & { profileImage: string | null }) | null;
  canManage?: boolean;
  canUpdateStatus?: boolean;
}

export interface MilestoneRecord {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  responsibleId: string | null;
  responsible: (Lookup & { profileImage: string | null }) | null;
  project: Lookup & { managerId: string; archivedAt: string | null };
  startDate: string;
  dueDate: string;
  completedAt: string | null;
  status: string;
  priority: string;
  displayOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  totalTasks: number;
  completedTasks: number;
  progress: number;
  overdue: boolean;
  canManage: boolean;
  canUpdateStatus: boolean;
  tasks?: TaskRecord[];
  activity?: { id: string; action: string; timestamp: string; actor: { name: string } | null }[];
}
