# ADR-015: Forgot and reset password

Date: 21 October 2026

Status: Accepted for local V1 development

## Context

The user approved Forgot Password → Reset Password after the login/session milestone. The PRD, API and database baselines require email-link recovery, hashed single-use tokens, approximately 15–30 minute expiry and generic request acknowledgements. Corrected V1 Authentication & Verification States HTML supplies the reset, confirmation and expired/used-link designs; the Authentication States Gallery supplies the forgot form and errors. Existing homepage/auth branding is preserved.

## Decision

Add public `/forgot-password` and `/reset-password` web pages and Express `POST /api/v1/auth/forgot-password` and `/reset-password` endpoints. The login link enables this flow. The browser uses the existing central API client and same-origin relay. Both endpoints require exact Origin and JSON, with request validation and IP limits; forgot also has an email limit, and reset also has a hashed token-fingerprint limit. The high-entropy reset token authorizes the password change; these public operations do not require a login session or cookie CSRF token.

A reset link contains a random 256-bit token in the URL fragment, under the configured trusted `WEB_ORIGIN`. It is not sent to web-server logs or HTTP referrers. Opening a link does not change a password or consume the token. The token is sent in the explicit reset POST and stored only as a SHA-256 hash in `authTokens` with type `PASSWORD_RESET`. The default lifetime is 30 minutes, configurable up to 30; the default request cooldown is 45 seconds. The unique user/type index arbitrates concurrent sends. A newer issued link replaces the older link; requesting during cooldown does not replace it.

Unknown and disabled accounts receive the same generic HTTP 202 acknowledgement as eligible active accounts. Public responses never wait for account lookup or provider delivery, so missing accounts, cooldowns and provider failures cannot change the public message or introduce provider-dependent response timing. Missing global configuration and a full work set return uniform unavailable responses before account lookup. A failed send releases only its own token claim and logs a constant message, permitting a later retry without deleting a newer replacement.

### Local email dispatch boundary

The current long-lived Express process tracks pending recovery work in memory, with a 32-job admission limit for forgot requests. It catches background failures and drains work before closing the database during graceful shutdown, within the server's existing shutdown deadline. It does not persist raw reset tokens or introduce a new queue service. Email delivery is best effort: a forced process exit or crash can lose pending work, so acknowledgement does not guarantee delivery and users can request another link.

This implementation is for the currently authorized local Express runtime. Before Lambda/serverless deployment, replace in-process dispatch with a durable delivery design that preserves the uniform response and token confidentiality; do not return from a serverless handler while depending on untracked background work. Deployment remains deferred and no hosting provider is changed.

### Reset transaction and account safety

The password policy and visible requirements match registration: 8–128 characters, uppercase, lowercase and a number; special characters are optional. Confirmation remains browser-only. Browser registration/reset share their policy and requirements presentation, while Express independently validates authoritative input.

Reset performs a preliminary token check before Argon2id hashing, then transactionally consumes the still-valid unused token, updates the active user's password hash and revokes **all existing sessions for that account** with `PASSWORD_CHANGE`. A failure rolls back all three changes, so a transient error cannot burn the link while leaving the password unchanged or sessions active. Concurrent consumption has one winner. Disabled accounts cannot consume links. Other accounts' sessions remain usable, and unverified accounts remain unverified.

Login already writes the user conditionally against the password hash it verified; that write serializes with the reset user update, preventing an old-password login from creating a post-reset session. Refresh's final session compare-and-swap respects reset revocation even if its preceding user read completed before the reset. Every session read continues to check database eligibility.

Success clears browser auth/CSRF cookies, announces logout to other tabs on the same origin and displays a password-updated screen with an explicit sign-in link. It does not automatically log in, verify email, create/join a wedding or accept an invitation. A separate best-effort notification email informs the owner that the password changed; it never includes passwords or a reset token. Notification failure cannot turn an already committed password change into a reported reset failure.

Malformed/missing links show recovery immediately. Well-formed links are validated when the user submits; invalid, expired and used tokens share one safe error and a Request a new link action. The browser removes the fragment after success and keeps no token/password in localStorage or sessionStorage. Changing to a different link remounts its form state, so a previous invalid-link state cannot block the new link.

## Verification and remaining work

Native Node HTTP/client tests cover validation, Origin/JSON, rate limits, cookie clearing, response timing independence from deferred lookup, trusted-origin email construction and safe provider errors. Isolated Atlas tests cover token storage/purpose/expiry, generic acknowledgements, concurrent sends/reset, replacement delivery races, transaction rollback, session revocation, login/refresh races, unverified/disabled accounts and the complete HTTP reset flow with fake email. Current results and browser checks are recorded in `docs/PROJECT_STATUS.md`.

Real inbox delivery still depends on the configured Resend sender; the onboarding sender's recipient restriction remains. Password recovery does not implement authenticated password editing in Profile/Settings. Wedding setup and planning features remain subsequent milestones. Existing deployment prerequisites from ADR-014, including HTTPS, trusted client IP forwarding and shared rate limits, still apply.

Security reference: [OWASP Forgot Password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). Approved requirements remain unchanged; the explicit all-session revocation and local dispatch choices are recorded here.
