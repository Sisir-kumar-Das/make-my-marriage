# Make My Marriage

A wedding planning workspace for Indian weddings, with an initial emphasis on Odia workflows.

**Plan every moment. Enjoy every memory.**

The approved V1 covers authentication, wedding setup, events, tasks/recurrence, checklist templates, members/invitations, dashboard/activity, profile/settings and recovery. The current implementation includes a public homepage, registration/email verification, login, persistent sessions, logout, forgot/reset password, protected three-step wedding setup, initial Admin membership, a dashboard with real wedding details, explicit planning placeholders and an Express health endpoint. Custom cover uploads and planning business features remain subsequent increments. Real email delivery requires the private Resend settings.

## Quick start

Use Node.js **24 LTS** and npm. If you use nvm, run `nvm use` first.

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. The API runs at <http://localhost:4000/api/v1/health>. The homepage and health endpoint need no credentials. Setup requires a verified login; planning pages also require active wedding membership and the private configuration described below.

To override configuration, copy `apps/web/.env.example` to `apps/web/.env.local` and `apps/api/.env.example` to `apps/api/.env`, then update the values. Never put secrets in `NEXT_PUBLIC_` variables.

```sh
npm run dev:web       # Web only
npm run dev:api       # API only
npm run lint
npm run format:check
npm run build
npm run smoke         # Both applications must be running
npm test              # HTTP/auth and API-client tests; no real email
npm run test:auth:db   # Registration/verification Atlas tests; temporary database
npm run test:sessions:db # Login/session/logout Atlas tests; temporary database
npm run test:recovery:db # Password recovery Atlas tests; fake email, temporary database
npm run test:weddings:db # Wedding/Admin creation and authorization; temporary database
```

After a successful build, `npm run start:web` starts the production web server locally. `npm run start:api` starts Express without watch mode. Stop development servers before using the same ports.

## Repository

- `apps/web`: Next.js 16 App Router, React, JavaScript/JSX, Tailwind CSS and shadcn/ui.
- `apps/api`: Node.js/Express, ES modules, REST under `/api/v1`.
- `docs`: approved project documents, [project status and handoff](docs/PROJECT_STATUS.md), [development guide](docs/DEVELOPMENT.md) and [architecture decisions](docs/decisions/ADR-011-npm-workspace-monorepo.md).
- `AGENTS.md`: project instructions and application boundaries.

There is one root npm lockfile. Express owns business logic and MongoDB access; web code communicates through its central REST client.

The public homepage at `/` follows the user-selected Stitch Platform 2 HTML supplied in the locally ignored `stitch_make_my_marriage_landing_page_v1_final/` folder. Its “M” logo, couple artwork and open-license fonts are served locally. Future guest, finance and accommodation previews remain visible with “Planned” labels. Start Planning opens `/register`; Log In opens `/login`.

For registration, fill `MONGODB_URI`, set `EMAIL_PROVIDER=gmail` and fill `SMTP_USER`/`SMTP_APP_PASSWORD` in the ignored `apps/api/.env`, using `apps/api/.env.example` for setting names. Use a separate Google App Password with 2-Step Verification enabled on the sending account. Supply values directly in the file, never in chat or Git. `MONGODB_DB_NAME` defaults to `make_my_marriage_dev`. Restart the API after environment changes. See [ADR-013](docs/decisions/ADR-013-registration-email-verification.md) for the auth scope and email-link behavior, and ADR-018 for the provider change. Resend remains an explicit alternative using `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `EMAIL_FROM`.

Email decision, 22 October: Gmail SMTP is implemented for this small personal project to avoid buying a sending domain at this stage. Gmail uses the configured SMTP account as its sender; the old Resend `EMAIL_FROM` value is ignored in Gmail mode. There is no automatic provider fallback. See [ADR-018](docs/decisions/ADR-018-gmail-smtp-for-small-project.md), the [beginner setup steps](docs/DEVELOPMENT.md#gmail-sender-setup) and PROJECT_STATUS.md for the actual connection/inbox validation status.

For login, also set a strong, stable `AUTH_JWT_SECRET` in the ignored API `.env` (at least 43 characters; generate it with a cryptographically secure random generator). It is already configured for the current local checkout. Browser API calls use the web origin’s `/api/v1` relay; `API_BASE_URL` is the server-only Express target. See [ADR-014](docs/decisions/ADR-014-login-persistent-sessions.md).

After login, accounts without an active wedding enter `/wedding-setup`. Its three steps collect the couple/date, location/tradition and optional budget, then review with the existing cover. Final confirmation atomically creates one wedding and Admin membership. Existing members enter `/dashboard`, which shows their real wedding and planning empty states. Custom cover uploads are the next increment. See [ADR-017](docs/decisions/ADR-017-wedding-setup-and-workspace-entry.md). See [ADR-012](docs/decisions/ADR-012-public-homepage-preview.md) for the homepage scope and reference handling. Original Stitch exports and Word documents remain ignored.

Deployment is deferred. The intended targets remain Amplify for web and Lambda/API Gateway with SAM for API. Amplify compatibility with Next.js 16 is unresolved; no hosting changes or deployments are included.

Forgot Password on `/login` opens `/forgot-password`. Reset links expire after 30 minutes and are single use; a successful reset signs out all existing sessions for that account and returns to sign-in. Recovery uses the same configured Gmail or Resend sender; optional reset defaults are listed in `apps/api/.env.example`. Recovery emails are dispatched by the local long-lived Express process and are best effort; durable delivery is required before serverless deployment. See [ADR-015](docs/decisions/ADR-015-password-recovery.md).
