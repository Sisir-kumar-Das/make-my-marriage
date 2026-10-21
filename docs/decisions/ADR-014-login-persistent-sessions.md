# ADR-014: Login, persistent sessions and protected workspace

Date: 21 October 2026

Status: Accepted for local V1 development

## Context

ADR-013 delivered registration and email-link verification. The user approved login, persistent sessions, protected pages and logout as the next increment, with the existing sample `/dashboard` as the interim destination. Password recovery follows in a separate increment. Corrected Stitch sign-in/verification desktop HTML and the authentication states gallery supply the visual reference; homepage branding is retained. There is no Remember Me checkbox, social login or automatic wedding/invitation joining.

## Decision

Express owns password verification, account eligibility, session creation, refresh, revocation and safe identity responses. The web application uses its central API client. Login requires a verified active account and the correct password. Unknown, disabled and wrong-password accounts receive the same credential error; the verification reminder requires the correct password first.

Each device login creates a MongoDB `Session`. A signed HS256 access JWT lasts 15 minutes by default; an opaque refresh token lasts an absolute 30 days. Refresh rotates the token without extending that absolute expiry. MongoDB stores only refresh hashes and bounded consumed-token hashes, with a TTL index for eventual cleanup. Eligibility and expiry are checked before TTL cleanup, and every authenticated session read checks the database so revocation takes immediate effect. Signing uses a persistent, private `AUTH_JWT_SECRET` of at least 43 characters. Missing signing configuration fails safely; the application never generates a replacement key on startup.

A refresh token contains its session ID and a random 256-bit secret. Rotation atomically replaces the current hash. A consumed-token replay after five seconds revokes that device's token family; other device sessions remain usable. During a five-second concurrency grace, consumed tokens receive a retryable 409 without being reissued or revoking the winner. An arbitrary guessed secret cannot revoke a session just by naming its ID. After 8,192 rotations, the bounded history requires a new login rather than growing indefinitely. Logout revokes the current device session and clears its cookies; it does not revoke other devices. When access is expired, an exact current or retained consumed refresh hash can authorize revocation of that same session, so a rotation that finishes first cannot evade logout. Knowing only a session ID or a guessed refresh secret cannot authorize revocation. Refresh finishes user eligibility lookup and signing before its atomic token replacement; a transient lookup failure therefore leaves the browser token unconsumed. The final replacement still checks active status/expiry to prevent a concurrent logout from issuing usable credentials.

### Same-origin transport and cookies

The browser calls `/api/v1` on the web origin. A Next.js Route Handler relays requests to the server-only `API_BASE_URL` (default `http://127.0.0.1:4000/api/v1`). This is transport only: it forwards allow-listed headers, bounded bodies and Express response cookies, without making authentication/business decisions or accessing MongoDB. Responses are not cached, and upstream failure returns a safe unavailable response. Direct Express requests remain useful for API checks.

This supersedes the scaffold's public `NEXT_PUBLIC_API_BASE_URL` setting. It avoids cross-site cookie dependencies and allows the web server to forward a host-only access cookie to Express when rendering protected pages. It does not select or deploy a hosting provider.

Access cookies use `Path=/`, a deliberate change from the API baseline's narrow cookie scope so server-rendered page gates can authenticate. Refresh cookies remain limited to `/api/v1/auth`. All auth/CSRF cookies are HttpOnly and host-only, with no Domain attribute. Production uses Secure cookies, `__Host-` names for root cookies and `__Secure-` for the narrow refresh cookie. SameSite defaults to Lax; None is allowed only in production with Secure. Local HTTP uses unprefixed cookies. HTTPS and compatible runtime/proxy handling remain production prerequisites.

### CSRF and browser behavior

Login, refresh and logout require JSON, the exact approved Origin and a signed double-submit CSRF header/cookie pair tied to a random HttpOnly browser-context cookie. CSRF tokens are bootstrapped by GET `/auth/csrf`, kept only in JavaScript memory and rotated on login. A stale token gets one bootstrap/retry. Registration, verification and resend preserve their existing unauthenticated Origin/JSON protections.

The browser shares one in-flight refresh per page; concurrent tabs receiving a refresh conflict retry the session check. A temporary API outage does not clear cookies or announce logout. Workspace errors hide content behind a retry state. Focus, page restoration, visibility changes and a periodic check revalidate sessions; logout also broadcasts to other tabs on the same origin.

Both the workspace layout and each explicit page call a request-cached Express session check. Page-level checks prevent Next.js from serializing protected child content into an anonymous RSC payload even when the layout hides it. An expired/missing access cookie yields a neutral restore screen; the browser can use its narrowly scoped refresh cookie and refresh the server-rendered page. Invalid/expired sessions go to `/login`. Each page guard also returns an embedded restore component on failure: Next.js can reuse the existing layout during navigation, so relying only on the layout restore component leaves an empty route. The page-level restore refreshes the current route after a successful session check, without rendering a nested main landmark or duplicate content ID. Future planning endpoints must independently authorize in Express; these web gates do not provide wedding role authorization.

## Scope and consequences

Implemented endpoints: GET `/auth/csrf`, POST `/auth/login`, GET `/auth/session`, POST `/auth/refresh`, POST `/auth/logout`, under `/api/v1`. Auth tokens are absent from public JSON responses and browser storage. The homepage Log In link, registration sign-in link and verified-account continuation now reach `/login`.

The existing dashboard remains sample data, and all other workspace sections remain placeholders. Password recovery is visibly deferred. Verification does not automatically log in, create a wedding, accept an invitation or grant a wedding role.

Local limits remain in process memory. Behind the same-origin relay, Express observes the web server's outbound IP, so production must define a trusted client-IP chain and shared rate-limit storage before deployment. Do not trust arbitrary forwarded-IP headers. Existing email-based limits still apply locally. Amplify/Next.js 16 support and deployment remain unresolved and out of scope.

The current local signing secret was generated securely in the ignored API `.env`. Fresh checkouts must generate their own strong secret there; keep it stable across restarts. Changing it invalidates existing access tokens. Never copy credentials into tracked examples, logs or chat.

## Verification

Native Node HTTP/client tests cover signed CSRF, cookies, uniform credential errors, refresh coordination and outages. Isolated Atlas tests cover hash-only storage, expiry, concurrent rotation, replay, history bounds, device-specific logout, disabled users and restoration through a fresh database connection. Live smoke checks assert that anonymous workspace HTML/RSC excludes protected content. Current results and browser/startup validation are recorded in `docs/PROJECT_STATUS.md`.

References: approved PRD, API and database designs; [csrf-csrf documentation](https://github.com/Psifi-Solutions/csrf-csrf), [jose](https://github.com/panva/jose), and [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
