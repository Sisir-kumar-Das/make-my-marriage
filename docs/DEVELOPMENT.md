# Development guide

## Setup and commands

Run commands from the repository root with Node.js 24 and npm. `npm ci` installs the versions in the single root lockfile. `npm run dev` starts both applications and stops the other process if either exits. Ctrl+C stops the combined session.

| Command                | Purpose                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `npm run dev:web`      | Next.js watch/development server, port 3000                           |
| `npm run dev:api`      | Express with Node's native watch mode, port 4000                      |
| `npm run build`        | Production web build; API JavaScript has no compilation step          |
| `npm run start:web`    | Local production web server after building                            |
| `npm run start:api`    | Local Express server without watch mode                               |
| `npm run lint`         | ESLint checks across web, API and scaffold scripts                    |
| `npm run format`       | Format scaffold source/configuration/documentation                    |
| `npm run format:check` | Check formatting without changing files                               |
| `npm run smoke`        | Live HTTP checks against running web and API                          |
| `npm test`             | API client and authentication contract tests; no cloud services       |
| `npm run test:auth:db` | Isolated Atlas authentication tests using the private API environment |

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

The first auth increment uses React Hook Form/Zod, Mongoose, Argon2id and rate limiting for registration/email verification. The Resend email adapter uses Node's native fetch with a bounded timeout and safe provider-error handling. Cookie/JWT/CSRF/session, password-reset and upload libraries remain prepared for subsequent increments. Installing a dependency does not implement its feature.

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

Local homepage/sample defaults work without copying examples. Restart after environment changes. `NEXT_PUBLIC_API_BASE_URL` is included in the browser bundle at build time, so rebuild the production web app when it changes.

Registration/email verification uses private settings in `apps/api/.env`:

| Setting                              | Purpose                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `MONGODB_URI`                        | Atlas Drivers URI with the database user's credentials; never print or commit it.     |
| `MONGODB_DB_NAME`                    | Application database, default `make_my_marriage_dev`; distinct from the cluster name. |
| `RESEND_API_KEY`                     | Private Resend sending API key.                                                       |
| `EMAIL_FROM`                         | Sender address on the configured Resend domain.                                       |
| `AUTH_VERIFICATION_TTL_HOURS`        | Verification token lifetime, default 24 hours.                                        |
| `AUTH_VERIFICATION_COOLDOWN_SECONDS` | Atomic resend cooldown, default 45 seconds.                                           |
| `AUTH_RATE_LIMIT_MAX`                | Local requests per 15-minute IP/email window, default 10.                             |

The homepage, sample workspace and health endpoint remain runnable without these values; account endpoints return a safe unavailable response when required services are absent. The user supplies credentials directly in the ignored `.env`; never paste or print its contents. Restart the API after editing it.

For alternate web/API ports, update `WEB_ORIGIN` and `NEXT_PUBLIC_API_BASE_URL` consistently. Root web scripts forward arguments to Next.js: use `npm run dev:web -- --port 3001`, or `npm run start:web -- --port 3001` after building. The root build script also forwards Next.js build options. API `PORT` is supplied through its environment. Smoke URLs can be overridden with `SMOKE_WEB_URL` and `SMOKE_API_BASE_URL`.

## Application boundaries

The public root `/` renders the homepage from `src/features/home`. Its layout follows the selected Stitch Platform 2 HTML. Future features stay visible with “Planned” labels and unavailable actions are disabled. Start Planning opens `/register`; Log In stays disabled until the login increment. Inter and Playfair Display are self-hosted with `next/font/local`, with OFL licenses beside the font files. The full “M” logo and supplied couple artwork are local public assets.

The `(auth)` route group shares `src/features/auth/auth-shell.jsx` for `/register` and `/verify-email`. Forms use the central API client and never access MongoDB directly. Password confirmation is checked locally; auth secrets are not stored in the browser. Verification links carry a fragment token and require an explicit Verify email POST. This increment creates verified accounts but no login sessions, wedding memberships or wedding setups. See ADR-013.

The `(workspace)` Next.js route group shares a layout without changing URLs. Eight explicit route files serve `/dashboard`, `/events`, `/tasks`, `/checklist`, `/members`, `/profile`, `/settings` and `/recovery`. There is no generic section route.

`src/components/layout/app-shell.jsx` owns the sidebar, header and accessible mobile navigation. `src/features/dashboard` owns sample presentation data and the browser connectivity indicator. No sample data is persisted or served as a real wedding API. Placeholder pages explain what remains to be built.

Use `src/lib/api-client.js` for browser API calls. It defaults to a five-second timeout (callers may set `timeoutMs`, bounded to 1–30 seconds), sends credential-capable requests, handles the success/error envelope and preserves request IDs on errors when available. The deadline covers response-body reading: expiry returns `TIMEOUT`, malformed JSON returns `INVALID_RESPONSE`, and other cancellations return `ABORTED` with the name `AbortError`. When caller cancellation and the deadline compete, the first cancellation determines the result. It does not implement token refresh, authentication or automatic retries. The connectivity check runs after mounting in the browser, so the frontend can build and start while Express is offline.

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

CORS permits the configured exact web origin and exposes `x-request-id` and `Retry-After`. CORS governs browser access; it is not authentication. Registration/verification enforce input validation, exact Origin, JSON content and per-IP/email limits. Authenticated cookie/session handling and CSRF protection remain part of the next increment.

## Verification

Start both apps, then run `npm run smoke`. The script verifies health and response headers, unique request IDs, permitted/disallowed CORS origins, preflight, API 404/400/413 envelopes, the public homepage with retained planned previews/disabled guest RSVP, local logo/artwork, registration/verification routes, malformed verification input, all explicit workspace routes and a web 404.

Also run `npm run lint`, `npm run format:check` and `npm run build`. For production startup, stop the dev web server and use `npm run start:web`; the API can run independently with `npm run start:api`.

Run `npm test` for API-client timeout/cancellation/error checks and authentication validation, Origin/content checks, rate limits and safe email-provider handling. These use Node's built-in test runner and require no cloud services.

Run `npm run test:auth:db` after filling `MONGODB_URI` in the ignored API environment file. It creates a uniquely named test database, checks password/token storage, duplicate registration, resend races, one-time verification, expiry and disabled accounts, then drops only that test database. Its email sender is a fake; it never sends real messages. A passing run does not verify Resend delivery. It skips when the URI is absent and reports failure when the configured cluster is unreachable.

Browser verification covers the dashboard's “API connected” state, stopping Express and retrying to see “API unavailable,” restoring Express and retrying successfully, active desktop navigation, mobile menu open/close/navigation and keyboard behavior. Check narrow/mobile widths for horizontal overflow. The HTTP smoke script cannot replace these browser checks.

The approved documents and `design/reference/` are excluded from automatic formatting/linting so baseline content is preserved. Generated build output and dependency folders are ignored.

ESLint is pinned to 9.39.5 because the React/import/accessibility plugins bundled by `eslint-config-next@16.4.0` declare ESLint support through version 9. npm marks ESLint 9 deprecated. Revisit this tooling limitation when those upstream plugins support ESLint 10; do not bypass peer constraints with force/legacy-peer-deps.

## Visual and deployment status

`design/reference/` was absent during scaffolding. The user subsequently supplied a locally ignored Stitch export and selected its Platform 2 landing-page HTML for the public homepage. Original exports remain untouched. Only the approved logo/artwork needed by the public page are copied into `apps/web/public`; this does not make the design export folder tracked. Homepage-specific colors and fonts are scoped to `src/features/home` so the workspace shell retains its provisional PRD-inspired styling. Supplied PNG previews may be stale; HTML remains the implementation reference.

Registration/verification forms, account/token models and the Resend adapter are implemented in the first auth increment. Real inbox delivery requires configured Resend credentials/sender. Login/session/reset flows, Docker, SAM, CI deployment and future-version modules remain deferred. Amplify/Next.js 16 compatibility remains unresolved; see ADR-011 before deployment work.
