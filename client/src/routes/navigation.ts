import {
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  Flag,
  Building2,
  UsersRound,
  ClipboardCheck,
  Wallet,
  ChartNoAxesCombined,
  ScrollText,
  Settings2,
  UserRound,
} from 'lucide-react';
import type { Permission } from '@/types/api';

interface NavigationItem {
  title: string;
  path: string;
  icon: typeof LayoutDashboard;
  permission: Permission | null;
  description: string;
}
export const navigation: { label: string; items: NavigationItem[] }[] = [
  {
    label: 'Main',
    items: [
      {
        title: 'Overview',
        path: '/',
        icon: LayoutDashboard,
        permission: 'overview:read',
        description: '',
      },
      {
        title: 'Projects',
        path: '/projects',
        icon: FolderKanban,
        permission: 'projects:read',
        description:
          'A shared home for every client engagement, infrastructure rollout, and software project.',
      },
      {
        title: 'My Tasks',
        path: '/tasks',
        icon: ListTodo,
        permission: 'tasks:read',
        description:
          'Keep your assigned work organized, track progress, and focus on what needs your attention.',
      },
      {
        title: 'Milestones',
        path: '/milestones',
        icon: Flag,
        permission: 'milestones:read',
        description: 'Turn project goals into clear checkpoints and keep delivery moving forward.',
      },
    ],
  },
  {
    label: 'Management',
    items: [
      {
        title: 'Clients',
        path: '/clients',
        icon: Building2,
        permission: 'clients:read',
        description:
          'Keep client relationships and their project portfolios connected in one place.',
      },
      {
        title: 'Team Members',
        path: '/team',
        icon: UsersRound,
        permission: 'team:read',
        description: 'Bring your people, departments, and project responsibilities together.',
      },
      {
        title: 'Approvals',
        path: '/approvals',
        icon: ClipboardCheck,
        permission: 'approvals:read',
        description:
          'Review project requests and keep decisions clear, accountable, and organized.',
      },
      {
        title: 'Expenses',
        path: '/expenses',
        icon: Wallet,
        permission: 'expenses:read',
        description: 'Understand project spending and keep every expense connected to its purpose.',
      },
    ],
  },
  {
    label: 'Insights',
    items: [
      {
        title: 'Analytics',
        path: '/analytics',
        icon: ChartNoAxesCombined,
        permission: 'analytics:read',
        description:
          'See delivery trends, resource allocation, and project performance as your workspace grows.',
      },
      {
        title: 'Audit Logs',
        path: '/audit-logs',
        icon: ScrollText,
        permission: 'audit:read',
        description:
          'Review a clear history of system activity. Authentication events are already recorded securely; the audit viewer arrives in a future phase.',
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        title: 'Settings',
        path: '/settings',
        icon: Settings2,
        permission: 'system:manage',
        description:
          'Configure your organization and manage workspace preferences in a future phase.',
      },
      { title: 'My Profile', path: '/profile', icon: UserRound, permission: null, description: '' },
    ],
  },
];
export const allNavigation = navigation.flatMap((group) => group.items);
