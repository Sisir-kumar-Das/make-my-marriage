import { AuthShell } from '@/features/auth/auth-shell';

export const metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function AuthLayout({ children }) {
  return <AuthShell>{children}</AuthShell>;
}
