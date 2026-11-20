# ADR-013: Registration and email verification as the first auth increment

- Status: accepted for local development
- Date: 19 October 2026
- Scope: registration, verification and verification resend only

Follow-up, 22 October: [ADR-019](ADR-019-existing-email-registration-login.md) supersedes the identical new/duplicate registration response at the owner's request. Existing emails now receive a conflict and lead to login; resend and forgot responses remain generic. The decision below records the original increment.

## Decision

Implement the approved first authentication increment in the existing npm workspaces. Use the corrected `make_my_marriage_v1_authentication_verification_states/code.html` for registration/verification and the existing homepage logo, artwork, fonts and palette. The sign-in desktop and authentication-states gallery remain references for the next increment. Ignore stale PNG content and older drafts specifying OTP codes, disabled persistent sessions, automatic invitation acceptance or alternate roles.

The web provides explicit `/register` and `/verify-email` routes. All Start Planning actions link to registration. Log In remains unavailable until the next increment. Existing workspace routes remain clearly labelled public sample pages with no authenticated wedding data. This increment is not complete authentication or protected dashboard access.

Express provides `POST /api/v1/auth/register`, `/verify-email` and `/resend-verification`. Zod validates input, Argon2id hashes passwords, and MongoDB stores users and hashed one-time tokens. Registration requires display name, email and password; confirmation is a frontend check and is not persisted. Duplicate registration never replaces an existing account's credentials and receives the same accepted response.

## Token and email behavior

- Links carry a random 256-bit token in the URL fragment, keeping it out of normal web request/referrer logs. The page submits it by POST only after the user selects Verify email, so GET prefetch and ordinary link scanning cannot consume it. No auth tokens are put in browser storage.
- Default verification expiry is 24 hours, configurable. Consumption queries enforce expiry independently of delayed TTL cleanup.
- Consume the token and mark the user verified in one transaction. Used, expired and superseded tokens fail; disabled-account failures roll back consumption.
- Keep one replaceable token per user/purpose through a unique `{ userId, type }` index. This refines the baseline token indexing and permits atomic resend claims without overlapping active tokens. Resend replaces the previous token after a default 45-second cooldown.
- Resend responses do not disclose whether an account is missing, verified, disabled or awaiting verification. Apply per-IP and hashed-email request limits. These local in-memory limits need review before distributed deployment; the database resend claim works across processes.
- Send through Resend using a fixed endpoint, bounded timeout and per-token idempotency key. Never log/return provider response contents, passwords, raw tokens or connection strings. Delivery failure retains the unverified account, releases only its token claim and permits resend.
- Privacy correction, 20 October: provider delivery failures retain the same public HTTP 202 acknowledgement as successful or ineligible registration/resend requests. Record only a constant server-side delivery-failure message, without identity, tokens or provider details. Missing service configuration still returns a uniform unavailable response before account lookup. A 202 acknowledges the request and does not guarantee delivery.

## Configuration and boundaries

Private `MONGODB_URI`, `RESEND_API_KEY` and `EMAIL_FROM` values belong only in the ignored `apps/api/.env`; the user supplies them directly. The cluster name is not a connection string. `MONGODB_DB_NAME` explicitly selects the development application database.

The homepage, sample workspace and health endpoint still start without these values. Registration/resend return a safe unavailable response until their required configuration is ready. Real inbox delivery must not be claimed as verified while Resend is pending.

Public auth mutations require the exact configured browser Origin and JSON content. This increment issues no login cookies. Login/refresh/logout, persistent secure-cookie sessions, cookie-authenticated CSRF protection, password reset, protected account routes and invitation acceptance remain subsequent work under the approved designs. Hosting/deployment is unchanged.

## Verification

Use Node's existing test runner for validation, HTTP contracts, Origin/content-type checks, rate limits, safe errors, token/email construction and API-client deadlines. Atlas integration tests use a unique test-owned database and a test email sender, then remove only that temporary database. They never send a real email. Real Resend/inbox delivery is a separate check after sender configuration.

Verification-screen correction, 23 October: verification UI results are scoped to the current URL fragment, so another link cannot retain an older error, pending state or success. Link changes/unmount abort the old browser request, and completion checks its request identity/current fragment before altering state or removing the token. An aborted client request may already have reached Express; server-side token consumption remains transactional and one-time. Success still clears the fragment and does not automatically log in. Native state regressions and a disposable real-backend browser fixture cover link replacement and late completion; see PROJECT_STATUS.md for results.

Cancellation follow-up, 23 October: cleanup also releases the canceled request reference and clears its matching pending attempt. Returning A → B → A with browser Back therefore presents an enabled action, without waiting for a request that no longer exists. Operation identity protects newer pending work and completed results from stale cleanup. Native and synthetic production-browser regressions cover this sequence; no backend/token rule changed.

Stale-completion follow-up, 23 October: the shared request lifecycle also clears its matching pending attempt in `finally`, independently of effect cleanup. This covers a response finishing after the URL changes but before cleanup, including both success and rejection. It preserves completed results and a newer operation, even when the newer request uses the same token. Controlled deferred-response tests exercise the actual async lifecycle with queued state updates and both cleanup/completion orders; the browser remains responsible only for API transport and fragment updates.
