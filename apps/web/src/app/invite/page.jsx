import { AcceptInvitation } from '@/features/invitations/accept-invitation';
export const metadata = {
  title: 'Wedding invitation',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function InvitePage() {
  return <AcceptInvitation />;
}
