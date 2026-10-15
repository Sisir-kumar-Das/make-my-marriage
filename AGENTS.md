# Make My Marriage project instructions

- Work in this existing npm-workspace repository: `apps/web` and `apps/api`, JavaScript/JSX, ES modules, Node.js 24, npm, one root lockfile.
- Read the relevant approved documents in `docs/` before implementing a feature. Preserve their contents and all pre-existing user changes. Record superseding architecture decisions in `docs/decisions/`.
- Keep business rules, authorization and database access in Express. Web code uses `apps/web/src/lib/api-client.js`; it must never import API source/models or connect to MongoDB.
- Use explicit application routes. Prefer ordinary components/functions and useful files; do not add empty module trees, shared packages, repository abstractions or monorepo build tools without a concrete need.
- V1 covers auth, wedding setup, events, tasks/recurrence, checklist templates, members/invitations, dashboard/activity, profile/settings and recovery. Later-version designs are compatibility plans, not scaffold scope.
- This scaffold contains sample dashboard data and placeholders only. Selected V1 dependencies are preinstalled at the user's request; feature implementation remains deferred. Add further dependencies when the actual feature needs them.
- The corrected Stitch HTML and assets in `design/reference/`, when supplied, are the visual source of truth. PNG previews may be stale. Until references are present, describe the shell as provisional, never as matching the approved design.
- Keep environment examples credential-free. Never commit secrets, local environment files, build output or `node_modules`.
- Local development is authorized. Deployment is deferred; Amplify support for Next.js 16 is unresolved. Do not change hosting providers.
- Do not reset, discard, move existing documents, commit or push unless explicitly instructed by the user.
- Before handing off changes, run applicable checks: `npm run lint`, `npm run format:check`, `npm run build`, and `npm run smoke` against running applications. Verify independent/combined startup, production web startup, browser API connectivity/unavailable states and desktop/mobile navigation. Report checks that could not be performed.
- Add tests when they protect meaningful behavior; do not install a test framework merely for the scaffold.

See `README.md`, `docs/DEVELOPMENT.md` and `docs/decisions/ADR-011-npm-workspace-monorepo.md` for setup and boundaries.
