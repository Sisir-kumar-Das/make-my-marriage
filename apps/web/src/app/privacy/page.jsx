import { LegalPage } from '@/features/legal/legal-page';

export const metadata = { title: 'Privacy' };
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>
        Make My Marriage is a personal wedding-planning project. This notice
        describes the current application; features labelled Coming soon are not
        available.
      </p>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Account and wedding information
        </h2>
        <p>
          The application stores account details, a password hash, verification
          and recovery records, session records, wedding details, memberships,
          ceremonies and your entered venue details. Uploaded wedding covers are
          stored privately. Wedding information is available to active members
          according to their roles. Account emails are sent through the
          configured email provider.
        </p>
        <p>
          MongoDB Atlas stores application records, Cloudflare R2 stores private
          covers, and the current email configuration uses Gmail SMTP. Session
          cookies keep you signed in; signing out ends the current session.
          Event removal keeps a recoverable record and its history rather than
          permanently erasing it.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Optional Google Maps venue search
        </h2>
        <p>
          Using venue search sends your search text and browser connection
          information to Google. Opening a linked venue requests its current
          details from Google. We save the selected place ID and details you
          enter yourself; Google’s returned venue names and addresses are
          displayed temporarily rather than saved in our database. Manual venue
          entry works without Google search.
        </p>
        <p>
          Google processes information under the{' '}
          <a
            className="underline"
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Privacy Policy
          </a>
          , which applies to the Google Maps features provided here. Opening an
          external Maps link takes you to Google.
        </p>
      </section>
      <p>
        Before entering sensitive information or inviting others, remember that
        this project is still in development. Public deployment and broader
        account/data-management features remain subject to a separate readiness
        review.
      </p>
    </LegalPage>
  );
}
