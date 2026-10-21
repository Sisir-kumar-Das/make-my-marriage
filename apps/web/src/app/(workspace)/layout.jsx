import { WorkspaceGate } from '@/features/auth/workspace-gate';

export const metadata = { robots: { index: false, follow: false } };

export default function WorkspaceLayout({ children }) {
  return <WorkspaceGate>{children}</WorkspaceGate>;
}
