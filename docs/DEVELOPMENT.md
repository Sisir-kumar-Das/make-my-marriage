# Development guide

## Setup and commands

Run commands from the repository root with Node.js 24 and npm. `npm ci` installs the versions in the single root lockfile. `npm run dev` starts both applications and stops the other process if either exits. Ctrl+C stops the combined session.

| Command                    | Purpose                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `npm run dev:web`          | Next.js watch/development server, port 3000                                      |
| `npm run dev:api`          | Express with Node's native watch mode, port 4000                                 |
| `npm run build`            | Production web build; API JavaScript has no compilation step                     |
| `npm run start:web`        | Local production web server after building                                       |
| `npm run start:api`        | Local Express server without watch mode                                          |
| `npm run lint`             | ESLint checks across web, API and scaffold scripts                               |
| `npm run format`           | Format scaffold source/configuration/documentation                               |
| `npm run format:check`     | Check formatting without changing files                                          |
| `npm run smoke`            | Live HTTP checks against running web and API                                     |
| `npm test`                 | API client and authentication contract tests; no cloud services                  |
| `npm run test:auth:db`     | Isolated Atlas registration/verification tests using the private API environment |
| `npm run test:recovery:db` | Isolated Atlas password recovery tests; fake email and automatic cleanup         |
| `npm run test:sessions:db` | Isolated Atlas login, rotation and logout tests                                  |

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
| API       | `nodemailer`                                          | Gmail SMTP for verification, recovery and password-change notices (ADR-018)       |
| API       | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | Cloudflare R2's S3-compatible API and signed upload/access URLs                   |

The first auth increment uses React Hook Form/Zod, Mongoose, Argon2id and rate limiting for registration/email verification. The email adapter supports Gmail SMTP through Nodemailer and the retained Resend alternative through Node's native fetch. Both have bounded transport timeouts and safe provider-error handling. Login/session handling now uses jose, cookie-parser and csrf-csrf. Password recovery is implemented; upload work remains deferred. Installing a dependency does not implement its feature.

`jose` supplies JWT support through ES modules; a second JWT library is unnecessary. Argon2id follows the approved password design. Node's native environment loading, watch mode and `crypto`, plus native `fetch`, avoid duplicate dotenv, nodemon, UUID or HTTP-client dependencies. No multipart upload middleware is needed for the approved direct-to-R2 upload design.

The web workspace declares AJV 8 as a development dependency to satisfy the form resolver's optional AJV peer. Zod remains the planned form validator; AJV is not wired into application validation. ESLint retains its required AJV 6 dependency separately.

Google Places loading, date/recurrence helpers, test frameworks, Lambda adapters and deployment tools remain deferred until concrete implementation needs them. No future-release feature packages or modules are introduced.

## Frontend state management

Use local React state for component behavior, the existing session Context for shared session information, and React Hook Form/Zod for forms. Express remains authoritative for authentication and authorization; browser API calls use `apps/web/src/lib/api-client.js`. Keep auth credentials in HttpOnly cookies.

Redux/Redux Toolkit is not installed or used. Continue with this approach while it meets the feature's needs. When real wedding/events/tasks features need API caching and coordinated refresh, evaluate TanStack Query. Evaluate Redux Toolkit if shared mutable client state becomes complex. These are future candidates, with no library selection or installation committed. See [ADR-016](decisions/ADR-016-frontend-state-management.md) for the decision and reconsideration criteria.

## Environment

Examples are separate for each application. Environment files are ignored; examples are tracked. The API uses Node's `--env-file-if-exists` flag instead of a dotenv dependency. Next.js loads its own `.env.local`.

| Application | Variable       | Default / purpose                                                                                   |
| ----------- | -------------- | --------------------------------------------------------------------------------------------------- |
| Web         | `API_BASE_URL` | `http://127.0.0.1:4000/api/v1`; server-only Express target; browser calls use same-origin `/api/v1` |
| API         | `PORT`         | `4000`; validated local API port                                                                    |
| API         | `WEB_ORIGIN`   | `http://localhost:3000`; exact credentialed CORS origin, no trailing slash                          |
| API         | `NODE_ENV`     | `development`; one of development/test/production                                                   |

The homepage and health defaults work without copying examples. Workspace pages require a verified login. Restart after environment changes. The old public `NEXT_PUBLIC_API_BASE_URL` setting is superseded by server-only `API_BASE_URL`; it is not used.

Email uses private settings in `apps/api/.env`. ADR-018 selects Gmail SMTP for this small project. Provider selection is explicit; it never falls back to another sender after a failure. An omitted `EMAIL_PROVIDER` retains Resend for existing environments; the new example and current local environment select Gmail:

| Setting                              | Purpose                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `MONGODB_URI`                        | Atlas Drivers URI with the database user's credentials; never print or commit it.      |
| `MONGODB_DB_NAME`                    | Application database, default `make_my_marriage_dev`; distinct from the cluster name.  |
| `EMAIL_PROVIDER`                     | `gmail` or `resend`; omitted defaults to Resend for existing configurations.           |
| `SMTP_USER`                          | Gmail sending account in Gmail mode; also determines the From address.                 |
| `SMTP_APP_PASSWORD`                  | Separate 16-character Google App Password; display spaces are removed automatically.   |
| `RESEND_API_KEY`                     | Required only in Resend mode.                                                          |
| `EMAIL_FROM`                         | Sender on the verified domain in Resend mode; ignored in Gmail mode.                   |
| `AUTH_VERIFICATION_TTL_HOURS`        | Verification token lifetime, default 24 hours.                                         |
| `AUTH_VERIFICATION_COOLDOWN_SECONDS` | Atomic resend cooldown, default 45 seconds.                                            |
| `AUTH_JWT_SECRET`                    | Strong stable private signing key, minimum 43 characters; current checkout configured. |
| `AUTH_ACCESS_TTL_MINUTES`            | Access JWT lifetime, default 15 minutes, maximum 30.                                   |
| `AUTH_SESSION_TTL_DAYS`              | Absolute persistent session lifetime, default 30 days, maximum 90.                     |
| `AUTH_COOKIE_SAME_SITE`              | `lax` by default; `none` requires production Secure cookies/HTTPS.                     |
| `AUTH_RESET_TTL_MINUTES`             | Reset link lifetime, default/max 30 minutes.                                           |
| `AUTH_RESET_COOLDOWN_SECONDS`        | Per-account reset email cooldown, default 45 seconds.                                  |
| `AUTH_RATE_LIMIT_MAX`                | Local requests per 15-minute IP/email window, default 10.                              |

The homepage and health endpoint remain runnable without these values; the workspace requires authentication; account endpoints return a safe unavailable response when required services are absent. The user supplies credentials directly in the ignored `.env`; never paste or print its contents. Restart the API after editing it.

For alternate web/API ports, update `WEB_ORIGIN` and server-only `API_BASE_URL` consistently. Root web scripts forward arguments to Next.js: use `npm run dev:web -- --port 3001`, or `npm run start:web -- --port 3001` after building. The root build script also forwards Next.js build options. API `PORT` is supplied through its environment. Smoke URLs can be overridden with `SMOKE_WEB_URL` and `SMOKE_API_BASE_URL`.

## Gmail sender setup

[ADR-018](decisions/ADR-018-gmail-smtp-for-small-project.md) records the owner's choice of Gmail SMTP for fewer than 20 expected users and a small personal demonstration. Express now supports this provider for verification, resets and password-change notices. See PROJECT_STATUS.md for actual live delivery results; support in code and SMTP authentication alone do not establish inbox delivery.

1. Use an existing Gmail account you own or create a dedicated one at [Google account signup](https://accounts.google.com/signup). The owner chose an existing test account after Google's verification flow delayed the newly created one. Complete account creation, password entry and any phone verification yourself. Keep recovery details private.
2. While signed in to that account, open [Google Account Security](https://myaccount.google.com/security). Find How you sign in to Google, open 2-Step Verification and follow Google's steps to enable it. Google documents these steps [here](https://support.google.com/accounts/answer/185839?hl=en).
3. Open [App Passwords](https://myaccount.google.com/apppasswords) in the same account. Sign in again if asked. Give the app a name such as Make My Marriage and choose Create. An App Password is a separate 16-character secret; do not use your ordinary Gmail password for SMTP. Google explains availability and restrictions [here](https://support.google.com/accounts/answer/185833?hl=en).
4. Save the generated App Password privately. It is shown only once. Never send it, your Google password, recovery codes or a screenshot of the secret in chat. If App Passwords is unavailable, first confirm the correct account and enabled 2-Step Verification; work/school policies, Advanced Protection or a security-key-only setup can prevent it. Report the non-sensitive error text rather than trying a weaker sign-in method.
5. In the ignored `apps/api/.env`, set `EMAIL_PROVIDER=gmail`, enter the sending address as `SMTP_USER` and paste its App Password as `SMTP_APP_PASSWORD`. Spaces in the displayed password are removed automatically. Leave existing MongoDB, signing and Resend values unchanged. Gmail mode does not use `EMAIL_FROM`; the branded From address is derived from `SMTP_USER`.
6. Restart the API after editing `.env`; Node's source watch does not reload an environment edit by itself. Verify registration/resend to an approved different inbox, follow the link and verify the account. Then test forgot/reset password with a disposable account; a successful SMTP connection is only a configuration check.

The transport uses `smtp.gmail.com:465` with TLS, normal certificate verification, bounded DNS/connect/greeting/socket timeouts and no connection pool. SMTP debug/protocol logging and file/URL content access are disabled. The account is the sender, so no custom domain is required. SMTP has no Resend-style idempotency key: application cooldown/claim protection remains, but automatic retry or provider fallback after an uncertain send is not performed. Gmail has sending limits and may block automated connections; see [Nodemailer's Gmail guide](https://nodemailer.com/guides/using-gmail). No deployment is authorized by this setup.

## Application boundaries

The public root `/` renders the homepage from `src/features/home`. Its layout follows the selected Stitch Platform 2 HTML. Future features stay visible with “Planned” labels and unavailable actions are disabled. Start Planning opens `/register`; Log In opens `/login`. Inter and Playfair Display are self-hosted with `next/font/local`, with OFL licenses beside the font files. The full “M” logo and supplied couple artwork are local public assets.

The `(auth)` route group shares `src/features/auth/auth-shell.jsx` for `/register`, `/verify-email`, `/login`, `/forgot-password` and `/reset-password`. Forms use the central API client and never access MongoDB directly. Password confirmation is checked locally; auth secrets are not stored in the browser. Verification links carry a fragment token and require an explicit Verify email POST. Verification creates verified accounts without automatic login, wedding membership or wedding setup. The success screen links to login. See ADR-013, ADR-014 and ADR-015.

Registration checks normalized email uniqueness in Express. Under the owner's ADR-019 usability decision, duplicates return HTTP 409 `EMAIL_ALREADY_REGISTERED`; the form clears its password fields and opens `/login?from=registration` with a sign-in explanation. Existing verified, unverified and disabled accounts receive the same conflict, without replacing details, sending email or issuing a session. The query contains only a fixed display flag, never an email or password. This intentionally reveals registration existence; resend/forgot responses and invalid-credential login remain generic. New accounts continue through verification. An existing unverified user can sign in with the original password to reach verification resend.

The `(workspace)` Next.js route group shares a layout without changing URLs. Eight explicit planning route files serve `/dashboard`, `/events`, `/tasks`, `/checklist`, `/members`, `/profile`, `/settings` and `/recovery`. There is no generic section route. The layout and every planning page use a request-cached Express session/wedding-membership check before returning workspace content, including RSC payloads. Verified accounts without a wedding go to the separate protected `/wedding-setup` page. The browser restores an expired access cookie using its refresh cookie, then refreshes the page; signed-out visitors go to `/login`. Keep both guard levels when adding pages.

`src/components/layout/app-shell.jsx` owns the sidebar, header and accessible mobile navigation. `src/features/dashboard` renders the real wedding identity with empty planning states and the browser connectivity indicator. Its old `sample-data.js` is an unused scaffold reference; sample data is not rendered or persisted as a real wedding API. Placeholder pages explain what remains to be built.

Use `src/lib/api-client.js` for browser API calls. It defaults to a five-second timeout (callers may set `timeoutMs`, bounded to 1–30 seconds), sends credential-capable requests, handles the success/error envelope and preserves request IDs on errors when available. The deadline covers response-body reading: expiry returns `TIMEOUT`, malformed JSON returns `INVALID_RESPONSE`, and other cancellations return `ABORTED` with the name `AbortError`. When caller cancellation and the deadline compete, the first cancellation determines the result. In the browser it bootstraps signed CSRF tokens into memory, retries stale CSRF once, coordinates a single session refresh for protected 401s and retries the original request. Network failures preserve cookies. No auth tokens are stored in localStorage/sessionStorage. The connectivity check runs after mounting in the browser, so the frontend can build and start while Express is offline.

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

CORS permits the configured exact web origin and exposes `x-request-id` and `Retry-After`. CORS governs browser access; it is not authentication. Registration/verification enforce input validation, exact Origin, JSON content and per-IP/email limits. Login, refresh and logout also require signed double-submit CSRF. Session reads require a valid access JWT, an active database session and an active verified account. HttpOnly persistent cookies use Secure prefixes in production; access is root-scoped for SSR, refresh is narrowly scoped to `/api/v1/auth`. See ADR-014.

## Verification

Start both apps, then run `npm run smoke`. The script verifies health and response headers, unique request IDs, permitted/disallowed CORS origins, preflight, API 404/400/413 envelopes, the public homepage with retained planned previews/disabled guest RSVP, local logo/artwork, registration/verification/login routes, malformed verification input, same-origin relay health/CSRF/body limit and anonymous denial, all explicit workspace gates with no content serialized and a web 404.

Also run `npm run lint`, `npm run format:check` and `npm run build`. For production startup, stop the dev web server and use `npm run start:web`; the API can run independently with `npm run start:api`.

Run `npm test` for API-client timeout/cancellation/error checks and authentication validation, Origin/content checks, rate limits and safe email-provider handling. Session HTTP/client tests also cover signed CSRF, persistent cookies, logout clearing, refresh coordination and outages. These use Node's built-in test runner and require no cloud services.

Run `npm run test:auth:db` after filling `MONGODB_URI` in the ignored API environment file. It creates a uniquely named test database, checks password/token storage, duplicate registration, resend races, one-time verification, expiry and disabled accounts, then drops only that test database. Its email sender is a fake; it never sends real messages. A passing run does not verify Resend delivery. It skips when the URI is absent and reports failure when the configured cluster is unreachable.

Run `npm run test:sessions:db` with the same private environment for an isolated temporary database suite covering login errors, hash-only refresh storage, JWT expiry, atomic rotation, concurrency/replay, bounded history, logout on one device, disabled accounts and restoration through a fresh database connection. It also drops only its own test database and sends no real email.

Browser verification covers the dashboard's “API connected” state, stopping Express and retrying to see “API unavailable,” restoring Express and retrying successfully, active desktop navigation, mobile menu open/close/navigation and keyboard behavior. Check narrow/mobile widths for horizontal overflow. The HTTP smoke script cannot replace these browser checks.

The approved documents and `design/reference/` are excluded from automatic formatting/linting so baseline content is preserved. Generated build output and dependency folders are ignored.

ESLint is pinned to 9.39.5 because the React/import/accessibility plugin constraints remain on version 9. npm marks ESLint 9 deprecated. `eslint-config-next` now matches the patched Next.js 16.4.2 release. Revisit the ESLint limitation when those upstream plugins support version 10; do not bypass peer constraints with force/legacy-peer-deps.

Security maintenance, 23 October: Next.js and its lint configuration are pinned to 16.4.2; production build/startup no longer show the reported 16.4.0 security interruption. `npm audit --omit=dev` reports zero vulnerabilities. The full audit still reports five development-only entries from the unpatched braces advisory in the lint dependency chain; this is tracked in ADR-011. Avoid `npm audit fix --force`, which currently proposes a mismatched 14.x lint configuration. Verification-link browser state is now scoped to the current fragment; replacing a bad link in the same tab restores its explicit Verify email action without a refresh.

## Visual and deployment status

`design/reference/` was absent during scaffolding. The user subsequently supplied a locally ignored Stitch export and selected its Platform 2 landing-page HTML for the public homepage. Original exports remain untouched. Only the approved logo/artwork needed by the public page are copied into `apps/web/public`; this does not make the design export folder tracked. Homepage-specific colors and fonts are scoped to `src/features/home` so the workspace shell retains its provisional PRD-inspired styling. Supplied PNG previews may be stale; HTML remains the implementation reference.

Registration/verification, login, persistent cookie sessions, protected workspace gates and logout are implemented. See ADR-014 for transport/session details. Real inbox delivery requires the selected Gmail or Resend provider to be configured and tested. Docker, SAM, CI deployment and future-version modules remain deferred. Amplify/Next.js 16 compatibility remains unresolved; see ADR-011 before deployment work.

Production prerequisites: local rate limits are in memory, and Express observes the relay server’s IP. Define trusted client-IP forwarding and shared rate-limit storage before deployment; do not accept arbitrary forwarded IPs. Secure cookies require HTTPS. The browser restart behavior uses persistent cookie expiry and refresh; clearing browser cookies still signs the user out.

## Password recovery

The current private MongoDB and selected email-provider settings are reused; recovery has no separate sender credential. Forgot requests always give a generic 202 acknowledgement. Bounded work in the local long-lived Express process performs account lookup, cooldown/claim and email sending after acknowledgement so account/provider timing does not alter the public response. This is best-effort local delivery, not a durable queue: graceful shutdown drains work within its deadline, but crashes can lose pending sends. A serverless deployment must replace this dispatch design before launch.

Reset links use `/reset-password#token=…`, have a 30-minute default lifetime, and are consumed only on explicit form submission. New password and confirmation follow the registration policy. Express atomically changes the password, consumes the token and revokes all sessions for that account; failure rolls back the transaction. Unverified users still need email verification. Success clears browser cookies and leads to sign-in, with no automatic login. A notification email is best effort and does not contain credentials.

Run `npm run test:recovery:db` for isolated Atlas checks with fake senders. It covers complete HTTP recovery, hash-only storage, expiry, cooldown/concurrency, replacement links, privacy/provider failures, rollback, all-device revocation and concurrent login/refresh. It never sends a real email and drops only its uniquely named temporary database. Real inbox delivery must be checked separately using an approved sender/recipient. Gmail/Resend selection follows ADR-018; the Resend onboarding sender still has recipient restrictions when explicitly selected. See ADR-015.

## Wedding setup

See [ADR-017](decisions/ADR-017-wedding-setup-and-workspace-entry.md). `/wedding-setup` uses the corrected three-step HTML and existing local branding/cover. Name suggestions stay editable; details survive Back/Next and are submitted only on final confirmation. No draft is saved across a reload. Recoverable background session errors keep the setup subtree mounted in memory and temporarily inert behind a retry banner; confirmed invalid sessions/logout still remove it. New weddings require today or a future Asia/Kolkata date, while existing weddings remain usable after their date. An unchanged previously attempted payload can pass both client validation and serialization after midnight with its original key; new/changed payloads get the normal date check, and Express decides whether replay is valid. Budget display uses exact BigInt formatting. Budget is optional; custom uploads remain disabled until their next increment.

Express creates wedding/Admin membership and a 24-hour hashed idempotency record in one transaction. Unique ACTIVE membership enforces one wedding per account. Session responses resolve wedding/role from MongoDB, filtering restricted budget data before returning it. Keep fallible context reads before refresh rotation. Member-only wedding reads return a version/ETag; the same-origin relay forwards it. Neither invitations nor events/tasks are generated automatically.

Run `npm run test:weddings:db` with the existing private Atlas URI. It creates and drops only a uniquely named temporary database, uses fake email and checks concurrency, rollback, single wedding membership, role boundaries and exact date/money storage. Browser testing should also use disposable fixtures, never edit a real account or create a wedding for the user without their input. No additional credential is needed for basic setup; custom cover upload configuration belongs to the following increment.
