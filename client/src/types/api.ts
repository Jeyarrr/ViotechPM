export type Permission =
  | 'overview:read'
  | 'projects:read'
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
  budgetSeries: { month: string; budget: number; expenses: number }[];
  recentActivity: { id: string; description: string; occurredAt: string }[];
  deadlines: { id: string; title: string; projectName: string; dueAt: string }[];
  teamWorkload: { userId: string; name: string; assignedTasks: number; completedTasks: number }[];
}
export interface ApiEnvelope<T> {
  data: T;
}
