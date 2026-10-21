# Make My Marriage

A wedding planning workspace for Indian weddings, with an initial emphasis on Odia workflows.

**Plan every moment. Enjoy every memory.**

The approved V1 covers authentication, wedding setup, events, tasks/recurrence, checklist templates, members/invitations, dashboard/activity, profile/settings and recovery. The current implementation includes a public homepage, registration/email verification, login, persistent sessions, logout, a protected sample dashboard, explicit placeholder pages and an Express health endpoint. Password reset and wedding-planning business features remain subsequent increments. Real email delivery requires the private Resend settings.

## Quick start

Use Node.js **24 LTS** and npm. If you use nvm, run `nvm use` first.

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. The API runs at <http://localhost:4000/api/v1/health>. The homepage and health endpoint need no credentials. Workspace pages require login with a verified account and the private configuration described below.

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
```

After a successful build, `npm run start:web` starts the production web server locally. `npm run start:api` starts Express without watch mode. Stop development servers before using the same ports.

## Repository

- `apps/web`: Next.js 16 App Router, React, JavaScript/JSX, Tailwind CSS and shadcn/ui.
- `apps/api`: Node.js/Express, ES modules, REST under `/api/v1`.
- `docs`: approved project documents, [project status and handoff](docs/PROJECT_STATUS.md), [development guide](docs/DEVELOPMENT.md) and [architecture decisions](docs/decisions/ADR-011-npm-workspace-monorepo.md).
- `AGENTS.md`: project instructions and application boundaries.

There is one root npm lockfile. Express owns business logic and MongoDB access; web code communicates through its central REST client.

The public homepage at `/` follows the user-selected Stitch Platform 2 HTML supplied in the locally ignored `stitch_make_my_marriage_landing_page_v1_final/` folder. Its “M” logo, couple artwork and open-license fonts are served locally. Future guest, finance and accommodation previews remain visible with “Planned” labels. Start Planning opens `/register`; Log In opens `/login`.

For registration, fill `MONGODB_URI`, `RESEND_API_KEY` and `EMAIL_FROM` in the ignored `apps/api/.env`, using `apps/api/.env.example` for setting names. Supply values directly in the file, never in chat or Git. `MONGODB_DB_NAME` defaults to `make_my_marriage_dev`. Restart the API after environment changes. See [ADR-013](docs/decisions/ADR-013-registration-email-verification.md) for the auth scope and email-link behavior.

For login, also set a strong, stable `AUTH_JWT_SECRET` in the ignored API `.env` (at least 43 characters; generate it with a cryptographically secure random generator). It is already configured for the current local checkout. Browser API calls use the web origin’s `/api/v1` relay; `API_BASE_URL` is the server-only Express target. See [ADR-014](docs/decisions/ADR-014-login-persistent-sessions.md).

The protected workspace at `/dashboard` retains its provisional scaffold styling and sample data. See [ADR-012](docs/decisions/ADR-012-public-homepage-preview.md) for the homepage scope and reference handling. Original Stitch exports and Word documents remain ignored.

Deployment is deferred. The intended targets remain Amplify for web and Lambda/API Gateway with SAM for API. Amplify compatibility with Next.js 16 is unresolved; no hosting changes or deployments are included.
