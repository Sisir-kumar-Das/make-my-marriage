# Development guide

## Setup and commands

Run commands from the repository root with Node.js 24 and npm. `npm ci` installs the versions in the single root lockfile. `npm run dev` starts both applications and stops the other process if either exits. Ctrl+C stops the combined session.

| Command                | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `npm run dev:web`      | Next.js watch/development server, port 3000                  |
| `npm run dev:api`      | Express with Node's native watch mode, port 4000             |
| `npm run build`        | Production web build; API JavaScript has no compilation step |
| `npm run start:web`    | Local production web server after building                   |
| `npm run start:api`    | Local Express server without watch mode                      |
| `npm run lint`         | ESLint checks across web, API and scaffold scripts           |
| `npm run format`       | Format scaffold source/configuration/documentation           |
| `npm run format:check` | Check formatting without changing files                      |
| `npm run smoke`        | Live HTTP checks against running web and API                 |

Both servers bind to loopback for local development. Do not start another process on an occupied port.

## Prepared V1 dependencies

At the user's request on 14 October 2026, the planned V1 libraries are installed ahead of feature implementation. They are declared in their owning workspace and resolved through the single root lockfile. npm normally hoists installed packages to the root `node_modules`; `src` contains application code, not dependencies.

| Workspace | Packages                                              | Planned purpose                                                                   |
| --------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| Web       | `react-hook-form`, `@hookform/resolvers`, `zod`       | Form state and Zod validation                                                     |
| API       | `mongoose`, `zod`                                     | MongoDB models and authoritative request validation                               |
| API       | `argon2`, `jose`                                      | Argon2id password hashing and JWT signing/verification                            |
| API       | `cookie-parser`, `express-rate-limit`, `csrf-csrf`    | Cookie parsing, auth endpoint throttling and signed double-submit CSRF protection |
| API       | `resend`                                              | Verification, recovery and member-invitation email                                |
| API       | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | Cloudflare R2's S3-compatible API and signed upload/access URLs                   |

These packages are not wired into the running application yet. Installing them does not create forms, authentication endpoints, database models/connections, email delivery or uploads. There are no new credential requirements; environment examples retain only the runnable scaffold settings. Supply and validate feature-specific secrets when the corresponding feature is implemented.

`jose` supplies JWT support through ES modules; a second JWT library is unnecessary. Argon2id follows the approved password design. Node's native environment loading, watch mode and `crypto`, plus native `fetch`, avoid duplicate dotenv, nodemon, UUID or HTTP-client dependencies. No multipart upload middleware is needed for the approved direct-to-R2 upload design.

The web workspace declares AJV 8 as a development dependency to satisfy the form resolver's optional AJV peer. Zod remains the planned form validator; AJV is not wired into application validation. ESLint retains its required AJV 6 dependency separately.

Google Places loading, date/recurrence helpers, test frameworks, Lambda adapters and deployment tools remain deferred until concrete implementation needs them. No future-release feature packages or modules are introduced.

## Environment

Examples are separate for each application. Environment files are ignored; examples are tracked. The API uses Node's `--env-file-if-exists` flag instead of a dotenv dependency. Next.js loads its own `.env.local`.

| Application | Variable                   | Default / purpose                                                          |
| ----------- | -------------------------- | -------------------------------------------------------------------------- |
| Web         | `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000/api/v1`; public browser API base URL                |
| API         | `PORT`                     | `4000`; validated local API port                                           |
| API         | `WEB_ORIGIN`               | `http://localhost:3000`; exact credentialed CORS origin, no trailing slash |
| API         | `NODE_ENV`                 | `development`; one of development/test/production                          |

Local defaults work without copying examples. Restart after environment changes. `NEXT_PUBLIC_API_BASE_URL` is included in the browser bundle at build time, so rebuild the production web app when it changes. Credentials and secret variables are deliberately absent from this milestone.

For alternate web/API ports, update `WEB_ORIGIN` and `NEXT_PUBLIC_API_BASE_URL` consistently. Root web scripts forward arguments to Next.js: use `npm run dev:web -- --port 3001`, or `npm run start:web -- --port 3001` after building. The root build script also forwards Next.js build options. API `PORT` is supplied through its environment. Smoke URLs can be overridden with `SMOKE_WEB_URL` and `SMOKE_API_BASE_URL`.

## Application boundaries

The `(workspace)` Next.js route group shares a layout without changing URLs. Eight explicit route files serve `/dashboard`, `/events`, `/tasks`, `/checklist`, `/members`, `/profile`, `/settings` and `/recovery`. The root redirects to `/dashboard`. There is no generic section route.

`src/components/layout/app-shell.jsx` owns the sidebar, header and accessible mobile navigation. `src/features/dashboard` owns sample presentation data and the browser connectivity indicator. No sample data is persisted or served as a real wedding API. Placeholder pages explain what remains to be built.

Use `src/lib/api-client.js` for browser API calls. It applies a five-second timeout, sends credential-capable requests, handles the success/error envelope and preserves request IDs on errors when available. The deadline covers response-body reading: expiry returns `TIMEOUT`, malformed JSON returns `INVALID_RESPONSE`, and other cancellations return `ABORTED` with the name `AbortError`. When caller cancellation and the deadline compete, the first cancellation determines the result. It does not implement token refresh, authentication or automatic retries. The connectivity check runs after mounting in the browser, so the frontend can build and start while Express is offline.

`apps/api/src/app.js` exports Express without listening. `server.js` owns local startup and graceful shutdown. Keep future business rules and MongoDB access in the API; never import API models/source into web code.

## API foundation

`GET /api/v1/health` returns HTTP 200:

```json
{
  "success": true,
  "data": { "status": "ok", "service": "make-my-marriage-api" }
}
```

Every response has a generated `x-request-id`, exposed to the configured browser origin. Health responses are not cached. This is process liveness only; no database/cloud readiness is implied.

Errors use the API Design v1.0 contract, with `requestId` at the top level:

```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Endpoint not found." },
  "requestId": "generated-uuid"
}
```

Unknown routes return 404; malformed JSON returns 400; bodies exceeding 100 KB return 413. Unexpected errors return a safe 500 message; stack traces stay server-side. JSON request logs contain request ID, method, matched route template, status and duration, never request bodies/cookies/query strings.

CORS permits the configured exact web origin and exposes `x-request-id`. CORS governs browser access; it is not authentication. Cookie/session handling, CSRF, auth rate limits and request-body validation for actual business routes are deferred until those features exist.

## Verification

Start both apps, then run `npm run smoke`. The script verifies health and response headers, unique request IDs, permitted/disallowed CORS origins, preflight, API 404/400/413 envelopes, the home redirect, all explicit routes and a web 404.

Also run `npm run lint`, `npm run format:check` and `npm run build`. For production startup, stop the dev web server and use `npm run start:web`; the API can run independently with `npm run start:api`.

Run `node --test scripts/api-client.test.mjs` for the API client's timeout, cancellation, malformed-JSON and request-ID regression checks. These use Node's built-in test runner and make no network requests.

Browser verification covers the dashboard's “API connected” state, stopping Express and retrying to see “API unavailable,” restoring Express and retrying successfully, active desktop navigation, mobile menu open/close/navigation and keyboard behavior. Check narrow/mobile widths for horizontal overflow. The HTTP smoke script cannot replace these browser checks.

The approved documents and `design/reference/` are excluded from automatic formatting/linting so baseline content is preserved. Generated build output and dependency folders are ignored.

ESLint is pinned to 9.39.5 because the React/import/accessibility plugins bundled by `eslint-config-next@16.4.0` declare ESLint support through version 9. npm marks ESLint 9 deprecated. Revisit this tooling limitation when those upstream plugins support ESLint 10; do not bypass peer constraints with force/legacy-peer-deps.

## Visual and deployment status

`design/reference/` was absent during scaffolding. CSS tokens are explicitly provisional and based on the PRD's ivory/charcoal/plum/champagne direction. System fonts avoid remote font downloads. Detailed approved-design matching awaits corrected Stitch HTML and required assets; stale PNGs must not override corrected HTML.

No authentication, forms, database models, cloud integrations, Docker, SAM, CI deployment or future-version modules are scaffolded. Amplify/Next.js 16 compatibility remains unresolved; see ADR-011 before deployment work.
