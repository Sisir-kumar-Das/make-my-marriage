# Make My Marriage project instructions

- Work in this existing npm-workspace repository: `apps/web` and `apps/api`, JavaScript/JSX, ES modules, Node.js 24, npm, one root lockfile.
- Read the relevant approved documents in `docs/` before implementing a feature. Preserve their contents and all pre-existing user changes. Record superseding architecture decisions in `docs/decisions/`.
- Read `docs/PROJECT_STATUS.md` at the start of work to understand completed milestones, current limitations and the next development step. Check the actual code and Git status before continuing; the status file does not replace the approved requirements or architecture decisions.
- After each major feature or milestone, update `docs/PROJECT_STATUS.md` in the same handoff with the date, delivered scope, relevant files/decisions, verification results, remaining work and next step. Keep completed work separate from sample data, placeholders and planned features. Fold small follow-up fixes into the existing milestone instead of creating a milestone for every edit.
- Keep business rules, authorization and database access in Express. Web code uses `apps/web/src/lib/api-client.js`; it must never import API source/models or connect to MongoDB.
- Use explicit application routes. Prefer ordinary components/functions and useful files; do not add empty module trees, shared packages, repository abstractions or monorepo build tools without a concrete need.
- V1 covers auth, wedding setup, events, tasks/recurrence, checklist templates, members/invitations, dashboard/activity, profile/settings and recovery. Later-version designs are compatibility plans, not scaffold scope.
- The planning workspace still contains sample dashboard data and placeholders. Registration/email verification and login/persistent sessions/logout are implemented; consult `docs/PROJECT_STATUS.md` for validation/configuration status. Workspace routes are protected, but password reset and planning features remain deferred. Preserve both layout and page-level session guards so anonymous RSC responses cannot serialize workspace content. Preinstalled dependencies do not imply implemented features; add further dependencies when needed.
- The corrected Stitch HTML and assets in `design/reference/`, when supplied, are the visual source of truth. PNG previews may be stale. Until references are present, describe the shell as provisional, never as matching the approved design.
- Keep environment examples credential-free. Never commit secrets, local environment files, build output or `node_modules`.
- Local development is authorized. Deployment is deferred; Amplify support for Next.js 16 is unresolved. Do not change hosting providers.
- Do not reset, discard, move existing documents, commit or push unless explicitly instructed by the user.
- Before handing off changes, run applicable checks: `npm run lint`, `npm run format:check`, `npm run build`, and `npm run smoke` against running applications. Verify independent/combined startup, production web startup, browser API connectivity/unavailable states and desktop/mobile navigation. Report checks that could not be performed.
- Add tests when they protect meaningful behavior; do not install a test framework merely for the scaffold.

See `docs/PROJECT_STATUS.md` for progress, and `README.md`, `docs/DEVELOPMENT.md` and `docs/decisions/ADR-011-npm-workspace-monorepo.md` for setup and boundaries.
