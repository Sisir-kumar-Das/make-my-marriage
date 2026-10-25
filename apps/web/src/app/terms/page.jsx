import { LegalPage } from '@/features/legal/legal-page';

export const metadata = { title: 'Terms' };
export default function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <p>
        Make My Marriage provides a shared wedding-planning workspace. It is
        currently a personal development project. Preview sections and controls
        marked Coming soon do not represent available services.
      </p>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Using the workspace</h2>
        <p>
          Use only accounts and wedding workspaces you are authorized to access.
          Keep your sign-in details private and upload only images you have
          permission to use. Admins, Family Members and Viewers have different
          permissions enforced by the application. Confirm important ceremony
          details independently before relying on them.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Google Maps features</h2>
        <p>
          By using the Google Maps venue-search features in this application,
          you agree to the{' '}
          <a
            className="underline"
            href="https://policies.google.com/terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Terms of Service
          </a>{' '}
          and the{' '}
          <a
            className="underline"
            href="https://www.google.com/intl/en/help/terms_maps/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Maps / Google Earth Additional Terms of Service
          </a>
          . These terms are incorporated into these terms for those features.
          Google’s information and availability can change; a linked venue is
          not a booking or a guarantee of its accuracy. You may enter your venue
          details manually instead.
        </p>
        <p>
          See our{' '}
          <a className="underline" href="/privacy">
            Privacy notice
          </a>{' '}
          and the{' '}
          <a
            className="underline"
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Privacy Policy
          </a>{' '}
          for information about venue searches.
        </p>
      </section>
      <p>
        Availability and features may change during development. A separate
        review of hosting, policies and operational readiness is required before
        public deployment.
      </p>
    </LegalPage>
  );
}
