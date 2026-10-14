import {
  LayoutDashboard,
  CalendarDays,
  ListTodo,
  ClipboardList,
  Users,
  UserRound,
  Settings,
  ArchiveRestore,
} from 'lucide-react';

export const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/events', label: 'Events', icon: CalendarDays },
  { href: '/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/checklist', label: 'Checklist', icon: ClipboardList },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/profile', label: 'Profile', icon: UserRound },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/recovery', label: 'Recovery', icon: ArchiveRestore },
];
