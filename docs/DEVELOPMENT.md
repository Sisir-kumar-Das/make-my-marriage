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
| `npm test`                 | API client/auth/wedding/media/event contract tests; no cloud services            |
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
| API       | `sharp`                                               | Bounded cover decoding, orientation and metadata-stripped display copies          |

The first auth increment uses React Hook Form/Zod, Mongoose, Argon2id and rate limiting for registration/email verification. The email adapter supports Gmail SMTP through Nodemailer and the retained Resend alternative through Node's native fetch. Both have bounded transport timeouts and safe provider-error handling. Login/session handling now uses jose, cookie-parser and csrf-csrf. Password recovery and private wedding cover uploads are implemented; avatar/gallery uploads remain deferred. Installing a dependency does not implement its feature.

`jose` supplies JWT support through ES modules; a second JWT library is unnecessary. Argon2id follows the approved password design. Node's native environment loading, watch mode and `crypto`, plus native `fetch`, avoid duplicate dotenv, nodemon, UUID or HTTP-client dependencies. No multipart upload middleware is needed for the approved direct-to-R2 upload design.

The web workspace declares AJV 8 as a development dependency to satisfy the form resolver's optional AJV peer. Zod remains the planned form validator; AJV is not wired into application validation. ESLint retains its required AJV 6 dependency separately.

Google Places now uses the official browser SDK without another dependency. Recurrence helpers, test frameworks, Lambda adapters and deployment tools remain deferred until concrete implementation needs them. No future-release feature packages or modules are introduced.

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

Registration checks normalized email uniqueness in Express. Under the owner's ADR-019 usability decision, duplicates return HTTP 409 `EMAIL_ALREADY_REGISTERED`; the form clears its password fields and opens `/login?from=registration` with a sign-in explanation. Existing verified, unverified and disabled accounts receive the same conflict, without replacing details, sending email or issuing a session. The query contains only a fixed display flag, never an email or password. This intentionally reveals registration existence. ADR-022 extends this choice to login: a normalized email without a user returns HTTP 404 `ACCOUNT_NOT_FOUND`; the form clears the password and opens `/register?from=login` with an account-creation explanation. Neither redirect creates an account, sends mail or authenticates the user. Wrong-password/disabled login responses and resend/forgot acknowledgements remain generic. New accounts continue through verification. An existing unverified user can sign in with the original password to reach the compact verification reminder/resend action; editing the email clears the previous reminder.

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

Owner checkpoint, 26 October 2026: before the **first V1 dev-environment/region deployment using a production build**, complete production-scheduling readiness under ADR-032 and the checklist in PROJECT_STATUS.md. Local Express timers and a successful web build do not establish deployed scheduling. Verify actual target-runtime invocation, restart/catch-up, bounded/fair processing, retry/overlap duplicate safety and observable failures. Review the existing media-cleanup and recovery-email dispatch prerequisites at the same time (ADR-020/ADR-015). No cloud scheduler or AWS region is selected by this note, and no deployment is authorized.

Production prerequisites: local rate limits are in memory, and Express observes the relay server’s IP. Define trusted client-IP forwarding and shared rate-limit storage before deployment; do not accept arbitrary forwarded IPs. Secure cookies require HTTPS. The browser restart behavior uses persistent cookie expiry and refresh; clearing browser cookies still signs the user out.

## Password recovery

The current private MongoDB and selected email-provider settings are reused; recovery has no separate sender credential. Forgot requests always give a generic 202 acknowledgement. Bounded work in the local long-lived Express process performs account lookup, cooldown/claim and email sending after acknowledgement so account/provider timing does not alter the public response. This is best-effort local delivery, not a durable queue: graceful shutdown drains work within its deadline, but crashes can lose pending sends. A serverless deployment must replace this dispatch design before launch.

Reset links use `/reset-password#token=…`, have a 30-minute default lifetime, and are consumed only on explicit form submission. New password and confirmation follow the registration policy. Express atomically changes the password, consumes the token and revokes all sessions for that account; failure rolls back the transaction. Unverified users still need email verification. Success clears browser cookies and leads to sign-in, with no automatic login. A notification email is best effort and does not contain credentials.

Run `npm run test:recovery:db` for isolated Atlas checks with fake senders. It covers complete HTTP recovery, hash-only storage, expiry, cooldown/concurrency, replacement links, privacy/provider failures, rollback, all-device revocation and concurrent login/refresh. It never sends a real email and drops only its uniquely named temporary database. Real inbox delivery must be checked separately using an approved sender/recipient. Gmail/Resend selection follows ADR-018; the Resend onboarding sender still has recipient restrictions when explicitly selected. See ADR-015.

## Wedding setup

See [ADR-017](decisions/ADR-017-wedding-setup-and-workspace-entry.md) and [ADR-020](decisions/ADR-020-private-wedding-cover-uploads.md). `/wedding-setup` uses the corrected three-step HTML and existing local branding. Name suggestions stay editable; details, selected photo and framing survive Back/Next and are submitted only on final confirmation. No draft is saved across a reload. Recoverable background session errors keep the setup subtree mounted in memory and temporarily inert behind a retry banner; confirmed invalid sessions/logout still remove it. New weddings require today or a future Asia/Kolkata date, while existing weddings remain usable after their date. An unchanged previously attempted payload, including its cover identity/framing, can pass client validation and serialization after midnight with its original key; new/changed payloads get the normal date check, and Express decides whether replay is valid. Budget display uses exact BigInt formatting. Budget and a custom cover are optional.

Express creates wedding/Admin membership and a 24-hour hashed idempotency record in one transaction. Unique ACTIVE membership enforces one wedding per account. Session responses resolve wedding/role from MongoDB, filtering restricted budget data before returning it. Keep fallible context reads before refresh rotation. Member-only wedding reads return a version/ETag; the same-origin relay forwards it. Neither invitations nor events/tasks are generated automatically.

Run `npm run test:weddings:db` with the existing private Atlas URI. It creates and drops only a uniquely named temporary database, uses fake email and checks concurrency, rollback, single wedding membership, role boundaries and exact date/money storage. Browser testing should also use disposable fixtures, never edit a real account or create a wedding for the user without their input. Basic setup with the signature artwork still needs no R2 credentials.

## Private wedding cover uploads

The owner approved JPG/PNG up to **15,000,000 bytes (15 MB)** and simple drag positioning/zoom in the setup review and Admin cover editor. A 40-megapixel decoding limit bounds memory use. The 2:1 preview matches the dashboard; framing is saved as normalized x/y and zoom. Original bytes stay private and intact. Express validates actual decoded content/orientation and writes a metadata-stripped WebP display copy, bounded to 2400 pixels with quality 92. No gallery, avatar, public wedding site or full settings editor is included.

Set `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` only in ignored `apps/api/.env`, then restart the API. The endpoint is derived from the account ID and the SDK uses region `auto`. Use R2-specific S3 Access Key ID/Secret Access Key, with Object Read & Write restricted to the chosen bucket. Keep public bucket access disabled. Missing settings disable custom uploads safely while signature-cover setup and normal authentication remain available.

The same account/bucket is intentionally used for development and production. The API's NODE_ENV selects generated `dev/covers/<opaque-id>/...` or `prod/covers/<opaque-id>/...` keys. Production credentials still belong in the production API environment; no frontend credentials or public environment variables are added.

The bucket-scoped token cannot edit bucket CORS. The owner configures it through bucket Settings → CORS Policy. Local testing uses:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "http://127.0.0.1:3001"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add an explicitly approved production frontend origin during deployment setup; CORS is not authentication and this policy does not publish the bucket. JSON metadata/control requests still go through the existing authenticated API client/relay. Signed PUTs bind type and file length and expire after five minutes. The direct file transport uses XMLHttpRequest for progress, sends no app cookies and has a three-minute timeout. Completion and media reads recheck ownership/role. Signed display reads expire after five minutes and refresh in the browser; Next's public image optimizer is bypassed for private photos.

Files remain in React memory until final Create/Save. A failed confirmation retries the same uploaded asset rather than sending bytes again. READY media attachment is part of the wedding transaction and original creation retry contract. Admin replacement/removal uses optimistic versions and identical replay recovery. The previous image remains attached until a replacement commits; removal restores signature artwork. Upload URLs write only staging objects; conditionally written immutable final objects prevent a replayed PUT from changing a published image.

Pending/unused media expire after 24 hours; detached covers wait ten minutes before deletion, and staging objects are swept after their upload grants expire. The long-lived local API runs bounded cleanup after startup and every 15 minutes. `npm run media:cleanup` performs one bounded sweep; repeat for a larger backlog. Cleanup claims metadata, checks active references and only touches keys in the configured bucket/environment. Failed deletions remain retryable. A durable scheduled cleanup/processing mechanism remains required before serverless deployment; local timers are not a Lambda scheduling guarantee.

Checks: `npm test` includes deterministic storage/decoding/framing/transport/retry/HTTP checks. `npm run test:media:db` uses a disposable Atlas database and fake storage. `npm run test:media:r2` uploads generated disposable images, tests real CORS/private access/exact 15 MB/overwrite protection, then removes its three generated objects. Consult PROJECT_STATUS.md for actual results. No real email or owner wedding should be used by these tests.

## Stitch design alignment

Follow [ADR-021](decisions/ADR-021-stitch-page-alignment.md) for each route's corrected reference. The ignored local Stitch HTML is the visual source; its PNGs may be stale. Discuss intentional visual departures with the owner before implementing them. Use real authorized account/wedding details and disabled, clearly labelled Coming soon previews for unbuilt business features. Never copy simulated permissions, sample task counts or gallery-only security claims into live behavior.

Check the shared shell and every affected route on desktop and 320/390 px mobile widths. Keep profile/recovery reachable through account/settings navigation, both layout and page-level guards intact, and the existing cover preview/framing consistent. The optional dashboard connection check is under Connection status. Visual-test fixtures must use a separate local origin and synthetic data; do not overwrite the owner's wedding or send real email to test layout.

## Events Step 1

`/events` uses the corrected Stitch ceremony schedule and details/editor drawer. Admin/Family Member can create/edit; Viewer can read. Express owns current account/membership/wedding authorization and all database access. Both SSR guard levels remain. Dates/times display in IST and are stored as UTC; past/future/overnight events are supported, end must follow start and overlap warnings allow saves. Venues are optional manual text, with fixed-origin encoded Maps links.

`POST /api/v1/weddings/:weddingId/events` and `PATCH /:eventId` require UUID Idempotency-Key headers; PATCH also requires a strong numeric If-Match. GET details supplies ETag; list is chronologically paginated (page/limit). Creation and unchanged creation replay also return a one-based schedulePosition for locating the saved ceremony in that ordering. The relay forwards these headers. Receipts last 24 hours; identical retries return the current saved event, while changed requests or stale versions return 409. Event/history/receipt commit atomically. A private eventRevision serializes wedding event writes without affecting cover versions. See [ADR-023](decisions/ADR-023-events-ceremony-crud.md).

Run `npm run test:events:db` with the private Atlas configuration. It creates and drops only its uniquely named database, sends no real email and uses no R2 objects. It covers tenant/role isolation, UTC/time rules, rollback, append-only history, retries, expiry and concurrent edits. Native `npm test` covers validation/serialization/HTTP protections without cloud access. Browser tests should use disposable accounts and verify create/edit/reload, overlap feedback, mobile drawer navigation and in-memory form retention during recoverable session failures. Closing/refreshing an unsaved editor discards it; no persistent drafts are stored.

Ceremony activities/timing warnings are implemented under ADR-025. Admin-only event removal/restoration is implemented under ADR-027. Google Places is implemented under ADR-028; independent Places review findings were corrected and the owner accepted the Events checkpoint; Tasks Step 1 is now implemented under ADR-029. Keep the manual fallback. Dashboard aggregation, tasks and live activity display retain their later planned steps. No new credentials or dependencies are required for manual venues.

Events creation UX: a successful create/confirmed retry closes the drawer, shows a schedule success notice with any overlap warning, loads the saved event’s page and focuses its card. The notice offers View created event if concurrent list changes move the card or loading fails. A failed save keeps the draft/key and brings its error into view. Existing-event edits return to details. Dashboard create=1 is consumed without navigation; refresh after close stays on the schedule. Owner-approved follow-up, 27 October: dirty event/activity closes use Tasks' shared centered `DiscardChangesDialog`, with contextual wording, Keep editing initial focus, trapped keyboard focus, safe Escape/backdrop behavior and restored focus on cancellation. Explicit discard preserves activity-only cancel, drawer close or validated Tasks navigation as originally requested. Clean close needs no prompt; pending writes cannot be dismissed. Event removal keeps its separate confirmation. Include these cases in future browser regression checks.

## Events Step 2

See [ADR-024](decisions/ADR-024-events-search-status-date-filters.md). The existing GET ceremony list accepts literal `q` (max 160), one `status`, India-local `from`/`to` dates and bounded page/limit. Search covers names and saved venue/address/city/state. Apply filters or select a status; Clear filters restores the schedule. Counts in every status button reflect the search/date scope before selecting a status. The selected status determines pagination. Dates include overlapping overnight intervals, with exclusive midnight adjacency. Real date/range and injection validation stays in Express.

Applied filters/pages survive refresh and browser Back/Forward through the native History API. Unapplied input remains temporary. List loading/error states suppress stale rows/counts; Retry preserves the URL. Empty matches have a separate Clear filters state. Changes reset page 1; Express bounds pages after concurrent edits. An optional internal `locate` list parameter finds a newly created ceremony's filtered page; the web clears incompatible filters and retains compatible ones. Both SSR guards, current member/role checks, save locks and safe retry receipts remain unchanged. No Tasks search or dashboard aggregation is implied.

Native and disposable Atlas Events tests cover filters alongside prior CRUD protections. Browser regression should cover applied search/status/date combinations, native date submission, overnight edges, keyboard focus, pagination/refresh/Back, no results, invalid URLs, unavailable API/Retry and compatible/incompatible creation filters on desktop and phones. Use disposable data; preserve the owner's wedding/environment.

Event status timing follow-up (24 October): Completed is disabled before the selected start instant, with fresh client/server validation for new saves. Past Planned/Confirmed stays available with a non-blocking status-review reminder after the end instant. Compare full IST schedules for overnight cases; never auto-complete or migrate existing records. PATCH validates the merged schedule/status. Matching committed retries remain recoverable before temporal validation; form serialization does not depend on the clock. See ADR-023 and the Events tests.

## Signed-in homepage entry

[ADR-026](decisions/ADR-026-signed-in-homepage-entry.md) refines `/`: signed-out visitors keep the public homepage, while Express-confirmed sessions open Dashboard or Wedding Setup according to current wedding membership. The root reads request cookies and validates existing access through the server API client. Access/CSRF-context cookie presence can request recovery but never authorizes a redirect. A browser recovery component shows the existing checking/Retry notice while the API client renews the existing narrowly scoped refresh cookie; confirmed expiry reveals the public homepage. Do not render marketing content during recovery or treat transient failures as logout. Existing explicit workspace routes and both SSR guards remain independent.

[ADR-038](decisions/ADR-038-bounded-homepage-session-recovery.md) bounds root recovery: the whole checking attempt has a 20-second limit alongside the client's existing per-request deadline. A confirmed session shows “Opening your workspace…” and uses one document replacement to the fixed Dashboard or Wedding Setup destination. If that opening takes 10 seconds, stop the pending document load so the page remains interactive and expose Retry plus Continue to the confirmed destination. Retry clears the old attempt and revalidates; an expired session then returns to the public homepage. Continue starts a fresh protected page load. Late/canceled responses and timers cannot replace newer state, and unmount clears the attempt without stopping a successful destination. No browser persistence, new cookie, endpoint or relaxed guard is involved. Other SessionRestore/login/logout behavior is unchanged.

Smoke includes forged/stale root-cookie checks. Focused browser regression should cover guest/member/setup entry, access expiry or absence with persistent refresh, revoked sessions, unavailable API/Retry and direct-route preservation. Use disposable accounts and a separate preview origin. No actual email or R2 writes are needed.

## Events Step 3 — ceremony activities

See [ADR-025](decisions/ADR-025-ceremony-activity-optional-end-time.md). Admin/Family Member may manage up to 50 embedded activities per ceremony; Viewer can read them. Name and start date/time are required, end date/time and notes are optional. Times display in IST and persist as UTC. Duration is calculated from endpoints, with no implied duration for start-only rows. Saved activities sort chronologically; schedule cards show actual counts.

The owner-approved UX follow-up uses a separate activity form with Save Activity and Save & Add Another, plus Edit/Remove on saved summaries. Create a new ceremony first; save or discard parent ceremony edits before managing activities. Each activity action saves through its child endpoint without submitting unrelated ceremony fields. A failed save retains its draft/key, and Save & Add Another starts the next draft only after confirmed success. The approved child POST/PATCH/DELETE activity routes also return the parent event and require its current If-Match plus an Idempotency-Key. IDs are server-generated and checked against their parent. Parent versions, role/tenant checks, transactional history and replay rules apply to all activity writes. Activity removal requires confirmation and saves immediately through its protected DELETE endpoint. The parent bulk API remains available for compatible callers. Granular history stores parentEventId; the later live Activity screen remains deferred.

Outside-parent and overlap warnings are advisory. Known intervals use strict overlap; adjacent endpoints are allowed. Missing endpoints generate only qualified same-start/start-inside-interval guidance, never an invented duration overlap. Parent time edits re-evaluate warnings without shifting activity times. Native and disposable Atlas suites cover bounds, serialization, warning parity, roles, retries, conflicts, atomic history/rollback and optional-end clearing. Browser checks cover the real drawer and responsive behavior; see PROJECT_STATUS.md for results. No new environment settings or dependencies are needed.

## Events Step 4 — Admin removal and restoration

[ADR-027](decisions/ADR-027-admin-event-removal-and-restoration.md) records the owner’s explicit Admin-only decision. DELETE `/weddings/:weddingId/events/:eventId` and POST `.../:eventId/restore` accept only `{}`, a UUID Idempotency-Key and the current parent If-Match. They preserve fields/activities/related records, change deletedAt/deletedBy and version, and commit history/receipt atomically. Restore recomputes warnings without rewriting saved status or times. No permanent event purge or event-specific seven-day expiry is added; the separate wedding recovery window stays deferred.

Admin-only GET `.../events/deleted?page=1&limit=20` supplies stable recent-removal pagination, retained activity counts and a current removal-actor display name. GET `.../events/:eventId/recovery` permits Admin inspection of current active/removed state for explicit conflict recovery. Normal reads/lists/warnings exclude removed events. Every recovery read/write checks current account, membership, wedding and Admin role; matching retries do not bypass these checks. A retry after an intervening opposite action returns current state rather than repeating the old mutation.

Events has a named confirmation with retained activity count; success closes the drawer and links to `/recovery`. That existing guarded route now connects only Stitch’s deleted-event recovery tray, with loading/empty/error/restore/conflict states and protected pending controls. Family Members and Viewers get an Admin-access explanation without removed records. Task and whole-wedding recovery retain Coming soon previews. Future task services must treat retained references to removed events as unavailable; this increment does not implement Tasks or cascade through unbuilt modules.

Native tests cover lifecycle contracts and HTTP protections; disposable Atlas tests cover current-role denial, retained data/activities, transactional rollback, concurrency, retries across state changes, pagination and restoration of legacy records. See PROJECT_STATUS.md for actual execution/browser evidence. No new configuration or dependencies are required.

## Events Step 5 — Google Places

See ADR-028 for the owner-approved replacement of permanent provider snapshots with place references and live details. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in ignored `apps/web/.env.local`, using the credential-free example. The value is browser-visible by design: restrict it to **Maps JavaScript API** and **Places API (New)** and the website origins actually used. Current local origins are `http://localhost:3000/*` and `http://127.0.0.1:3002/*`. Billing must be enabled; set usage quotas/alerts in Google Cloud. Restart development web after changing the file; rebuild production web when changing a public environment value. The runtime Express target stays server-only in `API_BASE_URL`. Never paste the key into chat or commit a real value.

The venue drawer offers optional India autocomplete (three characters, debounce, session tokens), keyboard selection, linked live details/attribution, unlinking and manual fields. Google text is not copied into saved fields; only `googlePlaceId` and the entered label/address/city/state reach Express. A linked venue may have no entered details. Open the ceremony for live Google details; list search covers entered text only. Errors/timeouts offer Retry and preserve the form. The SDK loads lazily; list cards make no Places calls. Public privacy/terms notices are linked beside search and in the homepage footer; public deployment still requires its separate readiness review.

`npm test` includes native Places adapter/contract checks. `npm run test:events:db` adds isolated Atlas reference persistence, role/tenant, retries, edits, unlinking and restoration checks. Browser checks should use a disposable wedding and the allowed test origin, cover real suggestions/selection/save/reload, rapid edits, keyboard/Escape, phones, provider failure/manual fallback and readonly roles. Do not send emails or change the owner's wedding to test venue search. Independent review/manual testing stays batched at Events completion.

## Tasks Step 1 — basic planner

`/tasks` now connects to the Express task service for bounded newest-first lists/counts, creation, details and versioned edits. Both workspace guards remain active. Current verified active Admin/Family Member may create/edit; Viewer reads. Optional fields are notes, ceremony and deadline. Tasks start unassigned with MANUAL source. Other form/table fields preserve the refined Stitch layout but remain disabled/Coming soon until their increment. Dashboard Add Task and ceremony-linked task lists are still future integrations; full dashboard metrics/activity are not implemented by this step.

Use IST date/time entry. A date without time becomes 23:59:59.999 in India, stored in UTC with `dueDateOnly=true` so reopening preserves an empty optional time. Both fields blank mean no deadline; a time without a date is rejected. Past deadlines show a prominent non-blocking warning for incomplete tasks; only incomplete tasks are overdue. Completed hides past-due guidance and uses a gentle informational after-wedding note. Reopening restores normal warnings. Dates after the wedding warn but save for incomplete tasks. Changing to Completed records the actor/time; reopening clears those markers. See ADR-029 for the owner-approved behavior and retained unavailable ceremony associations.

Writes require CSRF/trusted Origin, UUID Idempotency-Key and If-Match on PATCH. Receipts are account/wedding scoped, hashed and retained 24 hours; matching retries report current state rather than repeat old changes. Task/audit/receipt transactions lock the account/member/wedding and use taskRevision without modifying wedding settings versions. Drafts and keys survive failures; explicit conflict reload replaces the draft only after the user chooses it. Close/discard and inputs are blocked while saving. Owner-approved follow-up, 27 October: task and future-repeat dirty-close/scope-switch prompts use the shared centered `DiscardChangesDialog`, above the drawer with the current Stitch colors/Inter typography. Keep editing receives initial focus; Tab stays within the popup, Escape retains the draft, outside clicks cannot discard, and cancel returns focus to the initiating control. Explicit discard preserves the original close/view/future destination. Deletion keeps its separate fixed-footer confirmation. Transient session failures preserve the mounted task form and provide Retry, without changing the deferred homepage-entry behavior.

`npm test` includes task contract/date/warning/HTTP tests. `npm run test:tasks:db` uses a uniquely named disposable Atlas database for authorization, tenant boundaries, links/deletion survival, completion, audit rollback, retries, versions, concurrent edits, genuine counts and pagination; it removes its database afterward. Browser checks should use isolated accounts/API on 4002 and production preview on 3002, never the owner's wedding. Verify creation auto-close, no implicit save when entering Edit, no deadline/date-only/timed deadlines, past warnings, reload, stale edits, pending/dirty-close guards, session/API outages, Viewer/Family permissions and phones. No new credentials/dependencies are needed; do not rerun unrelated Gmail/R2 suites without cause.

Step 2 below adds multiple assignees/My Tasks. Next increments remain search/filtering, recurrence, task lifecycle, then delivered-task integrations and batched acceptance before Checklist templates. Family Members are permitted to delete tasks when lifecycle is built; restoration policy remains pending.

## Tasks Step 2 — assignment and My Tasks

See [ADR-030](decisions/ADR-030-task-assignment-and-my-tasks.md). POST/PATCH accept canonical deduplicated `assigneeIds` (up to 50), with `[]` to unassign. Omitted PATCH assignments are retained. Only active same-wedding members with active verified accounts qualify. Current Admin/Family Member may assign any role; assigned Viewers remain read-only. Selected memberships/accounts join the existing transaction write locks; stale versions, idempotency and atomic history protections still apply. Do not implement a public account/member lookup or copy emails/profiles into task storage.

GET `.../tasks/assignees?page=1&limit=50` is the minimal paginated member-picker read. GET `.../tasks/my?page=1&limit=20` uses the authenticated actor, never a user ID from the browser. Scoped counts/list pages and All/My totals share the same read snapshot. `/tasks?view=my` survives reload and Back/Forward; broader filter/URL pagination remains later. Member chips offer removal, with loading/error/Retry/refresh/Load more in the expandable picker. Unavailable members hide stale names and must be explicitly removed/replaced on editing; tasks remain readable. Future Members removal must provide transactional unassign/reassign, not leave dependencies silently. No membership mutation is built here.

The native and disposable Tasks Atlas suites cover assignment normalization/bounds, minimal member projection, current roles/tenants, My Tasks scope/counts/pagination, inactive assignees, canonical replay/audit rollback and concurrent member removal. Use isolated browser accounts for multi-selection, reassignment, unassignment, My view reload/history, Viewer denial, failed member-load/Save recovery and 320/390 px layouts. No new environment settings or real email/upload/provider requests are needed. Steps 1 and 2 await the owner's combined check; independent review remains batched.

## Tasks Step 3 — search, filters and pagination

See [ADR-031](decisions/ADR-031-task-search-and-filters.md). Both list routes accept literal `q` over titles/notes, status, priority, assigneeId (including `unassigned`), eventId (including `none`), optional inclusive India `from`/`to` deadline dates and `overdue=true/false`, plus bounded page/limit. Filter before counting/paginating; AND My Tasks with the authenticated actor rather than replacing it with a requested assignee. The minimal member-picker endpoint stays pagination-only. Missing deadlines do not match a date bound; completed tasks are never overdue. Keep stable newest-first createdAt/ID ordering and reject unknown/duplicate/invalid URL filter values rather than silently ignoring them.

The Stitch toolbar now has active controls with the owner-approved compact From/To row. Apply commits the draft, Reset preserves All/My, and view/page/filter values survive reload/Back/Forward in the URL. Controlled draft values must match the new URL when applying/navigating; do not reset uncontrolled selects to their initial options. Stale/failed requests hide old results/counts and preserve filters for Retry. Empty results offer Reset; invalid links offer repair. New creation keeps filters and offers View created task even if outside the slice; unassigned creation from My moves to All with filters retained. Canonicalize server-clamped pages without adding history. Has Recurrence and Due This Week are still disabled preview shortcuts.

Native Tasks tests cover query/schema/URL behavior, escaped literal text and India boundary conversion. Disposable Atlas tests cover actual title/notes matching, combined conditions, date/overdue/no-deadline/completed edges, current-user/tenant/deletion isolation, counts and filtered pagination after edits. Browser checks include visible field/URL agreement, Apply/Reset, page reload/history, invalid links, unavailable API/session recovery, creation outside filters and full-width date controls at 320/390 px. No new credentials/dependencies or unrelated cloud regressions are needed. Remaining increments start with recurrence; settle its generation/edit/end-date semantics before implementation.

## Tasks Step 4 — recurring tasks

See [ADR-032](decisions/ADR-032-task-recurrence.md). POST/PATCH tasks accept an optional strict recurrence object: frequency DAILY/WEEKLY/MONTHLY, integer interval 1–365, startDate, optional endDate and optional HH:mm time. Express defaults an omitted end to the wedding date; a past wedding requires an explicit upcoming end. Later ends warn but save. Monthly repeats retain their original day and clamp only the shorter month. New copies start TODO, each with its own UTC deadline/completion/history. Omitted time means end of the India day. A manual conversion retains the original ID; completed tasks must first be reopened.

Initial generation begins today/next scheduled date (no initial historical backfill), covering 90 days from that date, at most 100 per transaction. TaskSeries stores the template/cursor; a unique series/date task index includes retired/deleted identities. Express startup/15-minute passes process at most five due series, validate the current editor/assignees/ceremony and extend through today + 89 days. Saved cursors catch up after outages; ineligible dependencies pause with a generic issue and 15-minute retry. Eligible healthy/untried patterns precede due retries, then oldest retryAt/cursor/ID ordering rotates blocked work across passes. Recheck retry eligibility transactionally. Pattern repairs adopt the current authorized editor. Background cursor writes do not bump the editable pattern version. GET never generates tasks. Deployment remains deferred: ensure reliable production scheduling/lifecycle with the eventual approved hosting; this local timer is not proof of deployed durability.

GET/PATCH `/weddings/:weddingId/tasks/:taskId/series` reads/edits future patterns. PATCH requires a UUID retry key, series If-Match and the existing CSRF/current-role/tenant protections. Current Admin/Family may write, Viewer only reads. Effective boundary is max(today, selected occurrence date), with only not-yet-past deadlines reconciled. Preserve past/completed/customized copies. Untouched matches adopt new template/time while retaining status; obsolete untouched dates are hidden with recurrenceExcluded, not purged. Matching retired identities may reactivate only if their saved old deadline has not passed; future edits and worker catch-up preserve expired retired rows/history unchanged. Deleted task identities never regenerate. Stop prevents generation without removing copies. All task/series/audit/receipt mutations are transactional, with 24-hour scoped replay semantics.

The web uses existing local React/RHF state and api-client. Stitch's repeat checkbox, frequency/interval/start/end and notices now work, with next-date preview, optional common time, one-copy/future scope and stopped/attention/customized indicators. Unsaved scope switches confirm discard; pending saves block close; unavailable saves retain drafts and retry keys; stale versions require explicit reload. `recurring=true/false` combines with every existing filter and My Tasks; Has Recurrence includes stopped patterns. Due This Week remains Coming soon. Task recovery and dashboard/ceremony integrations remain later work.

`npm test` includes native recurrence math/contract/HTTP checks. `npm run test:recurrence:db` uses a unique disposable Atlas database, dropped at completion, to verify generation, boundaries, concurrency, protected edits, history rollback, retirement/reactivation, deleted uniqueness, stop/resume and cursor/dependency repair; retain `test:tasks:db` regression checks. Use isolated accounts/API/production web for browser creation, monthly dates, separate completion/customization, future edits, filtering, outage retry, roles and phone layouts. Actual results, skipped checks and pending batched acceptance are in PROJECT_STATUS.md. No new environment values or dependencies are needed.

## Tasks Step 5 — deletion and original-creator recovery

See [ADR-033](decisions/ADR-033-task-removal-and-restoration.md). Admin/Family may DELETE a task; POST `/weddings/:weddingId/tasks/:taskId/restore` allows current Admins or a current Family Member whose ID matches the task's original createdBy. Viewer and foreign scopes are denied. GET `.../tasks/deleted?page=1&limit=20` and `.../:taskId/recovery` apply the same restore scope, with bounded sorted/clamped pagination and no creator override. Do not let a Family deleter of someone else's task see/restore that removed record. Normal task reads/list/counts/edits and series entry exclude removed tasks.

Both lifecycle mutations require an empty JSON object, trusted Origin/CSRF, UUID retry key and current task If-Match. Lock current account/member/wedding, retain saved fields/history, increment the task version and atomically write its lifecycle audit and 24-hour scoped receipt. Exact replay acknowledges the current state rather than undoing an intervening restoration/deletion. Stale edits/actions require refresh/review. Unavailable assignee/ceremony references survive restoration, with neutral unavailable labels and existing explicit repair on later editing. Restore never silently changes completion, deadlines or assignees.

A recurring-copy deletion does not stop the series. Keep the unique series/date tombstone, and mark deletion/restoration as individually edited so the restored copy keeps its saved details after a pattern edit. Do not regenerate removed copies, restart stopped patterns or show recurrence-retired dates as user-deleted tasks. Recovery remains available while the active wedding exists; the seven-day whole-wedding window is separate and still deferred.

The Stitch task drawer's fixed-footer confirmation names the task, explains recurring-copy scope/unsaved edits and preserves the draft on cancel. Bounded scrollable drawer headers, footer and confirmation text keep Cancel/Confirm reachable with maximum-length titles at 320 px. Section headings match corrected Stitch Inter 20 px/600. Background session failures focus/scroll the inline notice into view in task and future-repeat editors, retaining draft values and Retry. Pending actions block close/discard/edit/future-pattern entry. Failed deletion/restore keeps the retry identity; conflicts require explicit review. The existing Recovery page has genuine task rows/notes/actor/time with role-specific guidance, pagination and restore feedback. Preserve mounted recovery actions through temporary API/session failures; both workspace guards and confirmed-session blocking remain intact. Event recovery stays Admin-only; whole-wedding lifecycle stays Coming soon.

`npm run test:tasks:lifecycle:db` uses and removes a uniquely named disposable Atlas database. Cover original-creator scope, current role/tenant/account state, retained fields/history, transaction rollback, concurrency/replay after opposite actions, unavailable references, recurring-copy uniqueness and pagination. Native Tasks HTTP/scope tests are in `npm test`; existing Tasks/recurrence Atlas suites remain meaningful regression checks. Use isolated accounts/servers for browser confirmation/cancel/pending, task/list refresh, creator/Admin/Viewer recovery, outage retention, phone navigation and production startup. PROJECT_STATUS.md records executed checks and pending batched acceptance. No new credentials/dependencies or unrelated provider regressions are needed.

## Tasks Step 6 — Dashboard and ceremony entry points

See [ADR-034](decisions/ADR-034-task-entry-points-and-ceremony-links.md). Dashboard Add Task opens `/tasks?create=1`. Saved ceremony Add Task uses the existing eventId filter plus fromEvent return context and a one-shot create intent; Manage Tasks opens the filtered list, and linked chips add a one-shot task ID. No second task editor or nested drawer is introduced. An authorized event read supplies preselection before creation opens, and Express checks the link again on save. Shortcut errors offer Retry/Dismiss. Back to ceremony generates only `/events?event=<id>`; that target opens through the current wedding's authorized event read and is consumed on close.

UI-only `create`, `task` and `fromEvent` are validated separately from filters and never reach Express as task query options. Consuming an intent preserves active filters/return context and does not change list request identity. Automatic server page clamping edits only page on the live URL: preserve a pending create/detail intent until the drawer opens, and never restore an already consumed/dismissed intent from an earlier request snapshot. Keep return context during filter/tab/page changes. Stale or canceled shortcut responses may not open a drawer for a newer URL. After save/cancel, reload must not reopen a blank create form.

Ceremony Linked Tasks follows Stitch's compact pills with status, a three-row preview, a genuine total and a more/manage action. Use bounded filtered task reads with loading/empty/error/Retry states. Event list taskCount uses one current-tenant aggregate for the visible page within the same authorized transaction, excluding removed/retired rows but including completed tasks. No new stored counter or cross-wedding read is added.

New ceremonies must be saved first. Dirty ceremony/activity fields prompt Keep editing (then Save) or explicit Discard before navigating away; a background session error focuses/scrolls the inline connection notice and Retry into view without unmounting the draft; pending/conflict/discard/deletion locks remain. Admin/Family may create/edit; Viewer links open read-only task details. Existing lifecycle, recurrence, unavailable-reference and session draft protections remain. Native route tests, the Tasks Atlas count/link regression and isolated production/browser checks cover this integration; actual evidence is in PROJECT_STATUS.md. No new credentials/dependencies or full dashboard progress/readiness/activity delivery is implied.

## Checklist Step 1 — catalog and preview

See [ADR-035](decisions/ADR-035-checklist-catalog-and-preview.md). Express serves GET `/api/v1/checklist-templates` after the existing verified session check. The four generic V1 packs live as versioned backend source in `apps/api/src/checklist/catalog.js`; each has stable id/version/item keys, suggested priority/timing and a derived item count. Planned Odia metadata has no fabricated items/count. The global read includes no tenant/account records, rejects unsupported filters and exposes no generation endpoint. There are no catalog database writes or new collections.

The protected `/checklist` route preserves layout/page guards and uses api-client/local React state for loading, selection and error/Retry with aborted/stale response protection. Sidebar Checklist, Tasks Browse Templates and Tasks Checklist Templates link here; All Tasks/My Tasks return to the existing planner. Use the refined Stitch catalog cards and detail-inspection styling, local original artwork and the existing shell/logo. Selection reveals/focuses the complete pack preview; relative timing is suggested, not a saved deadline. All roles may browse. Generate Tasks, planned Odia previews and generation history stay visibly Coming soon.

`npm test` includes catalog identity/count/timing/read-isolation and HTTP session/origin/all-role/no-write tests. Check the actual catalog/preview on desktop and phones, all entry points, each pack, artwork, reload and unavailable API/Retry using disposable accounts. Confirm no Task record is created. No fresh full cloud suite is needed for this read-only source catalog; record actual evidence in PROJECT_STATUS.md. Next is the catalog/preview checkpoint, then explicit generation, safe regeneration and history. Deployment, scheduler configuration, credentials, commit and push remain outside this increment.

## Checklist Step 2 — explicit generation and safe regeneration

See [ADR-036](decisions/ADR-036-explicit-checklist-generation.md), which supersedes Step 1’s Generate Tasks Coming soon state. Admin and Family Members may use GET `/weddings/:weddingId/checklists/preview?templateId=...&templateVersion=...` and POST `.../checklists/generate`; Viewers retain the generic catalog. The POST body is strictly templateId/templateVersion/previewHash, with UUID Idempotency-Key, JSON/trusted Origin/CSRF and current verified user/member/tenant checks. The preview computes real add/keep/deleted counts, exact date-only India deadlines, a past-due warning and a concurrency fingerprint. A changed task revision, wedding date, India day or template content requires explicit re-review before a first write.

Checklist tasks store required source type/templateId/templateVersion/itemKey. A permanent unique wedding/template/item index includes deleted rows and all content versions. Preserve every existing task’s fields, completion and original creator; generic catalog wording/counts for deleted items must not disclose their saved details/IDs. Manual same-title tasks are independent. Source provenance survives explicitly adding recurrence and later future edits/retired-copy reactivation. Restore stays Admin-any/original-Family-creator through Recovery.

The existing Tasks write-authorization helper serializes checklist writes with task edits/deletion/restoration using taskRevision and current user/member locks. Ordered Task creates, per-task activity, ChecklistGeneration summary/activity and hashed 24-hour ChecklistWriteRequest commit atomically. Replays check current authorization, then matching receipts before stale preview/version checks; they return the original generation outcome without reapplying task mutations. Replace expired receipts only after a fresh preview; retain generation summaries. History browsing is deferred, while its write-side data is delivered now.

The Stitch-style centered confirmation has safe Cancel focus, real counts/date review, pending dismissal locks and accurate success/View Tasks navigation. Uncertain failures retain the original key/body for Retry; definite preview conflicts require explicit Review latest preview. Checklist joins the existing in-memory session-preservation boundary, with an accessible local connection Retry inside the modal; confirmed session loss stays blocked. No browser persistence or new dependencies.

`npm test` covers the new pure plan/contracts/HTTP protections; `npm run test:checklist:db` creates/drops only a unique disposable Atlas database for role/tenant/identity/retry/concurrency/rollback/expiry/date/recovery/recurrence checks. Run `test:recurrence:db` when the provenance-preservation paths change. Browser-check the complete confirmation/retry/session/normal-Tasks interaction using disposable accounts; never mutate the owner’s wedding. Actual results are recorded in PROJECT_STATUS.md. The owner chose independent code review/manual testing after the complete Checklist feature, including history; no independent approval is implied by these checks.

## Checklist Step 3 — read-only generation history

[ADR-037](decisions/ADR-037-checklist-generation-history.md) supersedes history Coming soon/deferred statements in the earlier increment descriptions. All active wedding roles, including Viewers, may read GET `/weddings/:weddingId/checklists/generations?page=1&limit=20` and GET `.../generations/:generationId`. Express rechecks the current verified account/member/wedding in a snapshot transaction. Strict integer pagination rejects unknown keys/arrays, defaults to 20, caps at 100 and clamps missing pages. Saved createdAt/id ordering is newest first. History reads do not change taskRevision, tasks, receipts or activity.

An explicit DTO returns stored template name/version, wedding date used, generated timestamp and added/kept/deleted-skipped counts, plus current eligible initiator name. Removed/disabled/unverified initiators show Unavailable member. Neither read exposes addedTaskIds, saved/deleted task details, emails, raw actor identifiers or hashed write receipts. Summaries survive receipt expiry and catalog revisions. Historical counts remain fixed after task edits/completion/deletion; no history mutation/revert endpoint exists.

`/checklist` uses the corrected Stitch history table and Details control with accessible read-only dialog, IST timestamps, saved results, Refresh, real pagination and distinct loading/empty/error/Retry states. The owner-approved label is Results at the time of generation. Confirmed generation/replay refreshes page one; View Tasks opens the current planner. Keyed local requests reject canceled/stale completions, and each reopened Details selection starts a fresh read. Background session errors expose focused local Retry inside the dialog. Existing layout/page guards and generation retry preservation remain intact. No new dependency, environment or browser persistence.

The existing native and disposable Checklist Atlas suites cover strict pagination/HTTP boundaries, all-role read access, tenant/detail isolation, fixed outcomes, current/unavailable initiators, missing pages and no-write reads. Browser verification and actual limitations are recorded in PROJECT_STATUS.md. Next is the combined Checklist code review/manual-testing checkpoint requested by the owner.
