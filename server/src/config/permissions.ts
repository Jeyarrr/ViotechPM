export const roleDefinitions = [
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Full system access, users, and system settings.',
  },
  {
    key: 'project_manager',
    name: 'Project Manager',
    description: 'Authorized projects, assignments, progress, and project reviews.',
  },
  {
    key: 'developer',
    name: 'Developer',
    description: 'Assigned development projects and task progress.',
  },
  {
    key: 'it_support',
    name: 'IT Support Technician',
    description: 'Assigned technical, infrastructure, and support work.',
  },
  { key: 'employee', name: 'Employee', description: 'Assigned work and personal dashboard.' },
] as const;

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
const base: Permission[] = ['overview:read', 'projects:read', 'tasks:read', 'milestones:read'];
const management: Permission[] = [
  'clients:read',
  'team:read',
  'approvals:read',
  'expenses:read',
  'analytics:read',
  'audit:read',
];
const permissions: Record<string, Permission[]> = {
  super_admin: [...base, ...management, 'clients:write', 'projects:write', 'system:manage'],
  project_manager: [...base, ...management, 'projects:write'],
  developer: base,
  it_support: base,
  employee: ['overview:read', 'tasks:read', 'projects:read', 'milestones:read'],
};
export function permissionsFor(role: string): Permission[] {
  return permissions[role] ?? [];
}
