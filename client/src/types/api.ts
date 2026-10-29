export type Permission =
  | 'overview:read'
  | 'projects:read'
  | 'projects:write'
  | 'tasks:read'
  | 'milestones:read'
  | 'clients:read'
  | 'clients:write'
  | 'team:read'
  | 'approvals:read'
  | 'expenses:read'
  | 'analytics:read'
  | 'audit:read'
  | 'system:manage';
export interface User {
  id: string;
  name: string;
  email: string;
  role: { key: string; name: string };
  department: { id: string; name: string } | null;
  profileImage: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  permissions: Permission[];
}
export interface OverviewData {
  phase: number;
  currency: string;
  metrics: {
    totalProjects: number;
    activeProjects: number;
    pendingTasks: number;
    completedProjects: number;
    totalBudget: number;
  };
  projectStatus: { status: string; count: number }[];
  budgetSeries: { month: string; budget: number }[];
  recentActivity: {
    id: string;
    projectId: string;
    description: string;
    actorName: string;
    occurredAt: string;
  }[];
  deadlines: {
    id: string;
    title: string;
    projectId: string;
    projectName: string;
    dueAt: string;
    status: string;
  }[];
  myTasks: {
    id: string;
    title: string;
    projectId: string;
    projectName: string;
    dueAt: string;
    status: string;
  }[];
  teamWorkload: { userId: string; name: string; assignedTasks: number; completedTasks: number }[];
}
export interface ApiEnvelope<T> {
  data: T;
}
