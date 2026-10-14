# Make My Marriage

A wedding planning workspace for Indian weddings, with an initial emphasis on Odia workflows.

**Plan every moment. Enjoy every memory.**

The approved V1 covers authentication, wedding setup, events, tasks/recurrence, checklist templates, members/invitations, dashboard/activity, profile/settings and recovery. The current implementation is a minimal local scaffold: a responsive sample dashboard, explicit placeholder pages and an Express health endpoint. Authentication and business features are not implemented yet.

## Quick start

Use Node.js **24 LTS** and npm. If you use nvm, run `nvm use` first.

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. The API runs at <http://localhost:4000/api/v1/health>. No database, cloud credentials or environment files are required for these local defaults.

To override configuration, copy `apps/web/.env.example` to `apps/web/.env.local` and `apps/api/.env.example` to `apps/api/.env`, then update the values. Never put secrets in `NEXT_PUBLIC_` variables.

```sh
npm run dev:web       # Web only
npm run dev:api       # API only
npm run lint
npm run format:check
npm run build
npm run smoke         # Both applications must be running
```

After a successful build, `npm run start:web` starts the production web server locally. `npm run start:api` starts Express without watch mode. Stop development servers before using the same ports.

## Repository

- `apps/web`: Next.js 16 App Router, React, JavaScript/JSX, Tailwind CSS and shadcn/ui.
- `apps/api`: Node.js/Express, ES modules, REST under `/api/v1`.
- `docs`: approved project documents, [development guide](docs/DEVELOPMENT.md) and [architecture decisions](docs/decisions/ADR-011-npm-workspace-monorepo.md).
- `AGENTS.md`: project instructions and application boundaries.

There is one root npm lockfile. Express owns business logic and future MongoDB access; web code communicates through its central REST client.

The corrected Stitch HTML/assets are not present in `design/reference/`. The shell uses a provisional PRD-inspired palette; detailed matching to the approved design remains pending. All dashboard planning data is clearly labelled sample data.

Deployment is deferred. The intended targets remain Amplify for web and Lambda/API Gateway with SAM for API. Amplify compatibility with Next.js 16 is unresolved; no hosting changes or deployments are included.
