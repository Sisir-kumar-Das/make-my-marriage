# Make My Marriage — Project status

Last updated: 22 October 2026

This is the working handoff for development progress. Update it after each major feature or milestone so another agent can continue from the current checkpoint. Completed means implemented and checked locally; it does not imply deployment or a Git commit.

## Current checkpoint

The public homepage and full authentication increment (registration/email verification, login/persistent sessions/logout and forgot/reset password) are implemented locally. Basic three-step wedding setup is now implemented: verified accounts without a wedding enter `/wedding-setup`, final confirmation creates one wedding with its Admin membership, and existing members enter the protected `/dashboard`. The dashboard shows real wedding identity/date/location and planning empty states. Events, tasks, invitations and other planning business features remain deferred. Custom wedding cover uploads are the next agreed increment.

Frontend state decision, 21 October: retain local React state, session Context and React Hook Form/Zod. Redux/Redux Toolkit is not in use. TanStack Query for API caching and Redux Toolkit for complex shared client state remain candidates to assess only when needed; neither is selected or installed. See ADR-016 and the development guide.

Review follow-up, 22 October: fixed background session errors discarding setup state, same-key retry conflicts and maximum-budget display precision. New wedding creation now requires today or a future Asia/Kolkata date; existing weddings remain usable after their date. The browser also permits unchanged, previously attempted creation requests to reach Express with their original retry key after midnight. See milestone 6 for regression evidence. Custom cover uploads remain the next agreed feature after user review.

Git checkpoint: the user authorized committing and pushing basic wedding setup and its review fixes (milestone 6) to `DEV` on 22 October. This handoff records that accepted scope; use Git history for its commit identifier. Authentication/password recovery, shared logo refinement and frontend state decision (ADR-016) were previously committed and pushed as `6dfc298`. Earlier login/session review fixes are in `29c249a`, with acceptance/status commit `92117fb`. Deployment remains deferred.

Atlas registration and session tests are passing. The user previously reported receiving and completing a real Resend verification link using the onboarding test sender; broader sending still requires an owned verified domain. Current login checks used a disposable verified fixture with no real email. Private MongoDB/Resend settings and the stable generated signing secret belong only in ignored `apps/api/.env`. Keep credentials out of examples and chat.

Resend delivery diagnosis, 22 October: read-only provider logs confirmed verification attempts to another mailbox were rejected with HTTP 403 because the configured `resend.dev` test sender permits only the Resend account's own recipient address. The affected account remains active and unverified. The generic inbox acknowledgement does not assert delivery. No account, environment or application changes were made and no additional email was sent during diagnosis. Discuss an owned verified sending domain and a corresponding private `EMAIL_FROM` update next; do not change the generic public responses to disclose account status.

## Read before continuing

- [Development guide](DEVELOPMENT.md): startup commands, prepared dependencies, application boundaries and verification steps.
- Approved baselines: [PRD](Make_My_Marriage_PRD_v1.0.md), [system design](Make_My_Marriage_System_Design_Architecture_v1.0.md), [database design](Make_My_Marriage_Database_Design_v1.0.md) and [API design](Make_My_Marriage_API_Design_v1.0.md). Preserve these documents.
- [ADR-011](decisions/ADR-011-npm-workspace-monorepo.md): accepted npm-workspace architecture and subsequent dependency preparation.
- [ADR-012](decisions/ADR-012-public-homepage-preview.md): accepted public homepage, design reference and planned-feature preview scope.
- [ADR-013](decisions/ADR-013-registration-email-verification.md): first auth increment, email-link verification, private configuration and remaining session work.
- [ADR-014](decisions/ADR-014-login-persistent-sessions.md): login, rotating persistent sessions, same-origin relay, cookie scope and protected page guards.
- [ADR-015](decisions/ADR-015-password-recovery.md): password recovery, transactional all-session revocation and the local email-dispatch/deployment boundary.
- [ADR-016](decisions/ADR-016-frontend-state-management.md): current frontend state approach and criteria for assessing additional libraries.
- [ADR-017](decisions/ADR-017-wedding-setup-and-workspace-entry.md): basic wedding setup, atomic Admin membership, retry safety and membership-based workspace entry.
- Root [AGENTS.md](../AGENTS.md) and applicable application instructions. Inspect the actual source and `git status` before editing; preserve existing user changes.

## Milestone history

| Milestone                                               | Status                                                                       | Recorded dates                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| Runnable project scaffold and V1 dependency preparation | Complete locally; business features deferred                                 | 13–14 October 2026                              |
| Public product homepage                                 | Complete locally; future features remain previews                            | 17 October 2026; refinements 18–19 October 2026 |
| Registration and email verification                     | Implemented; Atlas checked; user reports real email verification             | 19–20 October 2026                              |
| Login, persistent sessions and logout                   | Implemented and checked locally; dashboard remains sample data               | 20–21 October 2026                              |
| Password recovery                                       | Implemented and checked locally; user reports real inbox/reset/login success | 21 October 2026                                 |
| Basic wedding setup and workspace entry                 | Implemented locally; verification recorded in milestone 6                    | 21 October 2026                                 |

### 1. Runnable project scaffold

Delivered:

- One npm-workspace repository with `apps/web` and `apps/api`, JavaScript/JSX, ES modules, Node.js 24 and one root lockfile.
- Next.js web application with a responsive sample dashboard and explicit `/dashboard`, `/events`, `/tasks`, `/checklist`, `/members`, `/profile`, `/settings` and `/recovery` routes. The other workspace pages are placeholders.
- Express API with `/api/v1/health`, request IDs, consistent error responses, CORS, security headers, payload limits and graceful startup/shutdown.
- Central browser API client with timeout, cancellation and response/error handling, plus the dashboard's API connectivity indicator.
- Root development/build/check commands, credential-free environment examples and selected V1 dependencies prepared for later implementation.

Key locations: `apps/web/src/app/(workspace)/`, `apps/web/src/components/layout/`, `apps/web/src/features/dashboard/`, `apps/web/src/lib/api-client.js`, `apps/api/src/`, `scripts/smoke.mjs` and `scripts/api-client.test.mjs`.

Boundary: Express owns business rules, authorization and future database access. The web application must use the API client and must not import API source/models or connect to MongoDB. Installed dependencies do not mean their features exist.

Verification recorded during scaffold/homepage work: lint, formatting, production build, HTTP smoke checks and all nine API-client regression tests passed. Independent and combined development startup, production web startup, dashboard API connected/unavailable/retry behavior and desktop/mobile workspace navigation were verified.

### 2. Public product homepage

Delivered:

- Public landing page at `/`, separate from the sample planning workspace at `/dashboard` and the future couple-specific wedding website.
- Layout based on the user-selected Stitch Platform 2 landing-page HTML, with the complete “M” logo, local couple artwork and self-hosted Inter/Playfair Display fonts.
- Hero, planning overview/features, celebrations, family collaboration, guest/wedding-website preview, explanation, cultural fit, privacy, closing call to action and footer sections.
- Desktop navigation and an accessible mobile menu. Section links use native anchors such as `#features`, `#how-it-works` and `#wedding-website`.
- Future guest, RSVP, finance and accommodation details remain visible with “Planned” labels. Unavailable actions are disabled. Registration was enabled in the first auth increment; login was enabled in milestone 4.
- Follow-up on 18 October: adjusted the wedding-website preview photo's vertical crop so the groom's full hairstyle remains visible on desktop and mobile.
- Follow-up on 19 October: restored spaces after the three family-section labels, clarified Admin/Family Member/Viewer responsibilities including Viewer read-only access, and aligned the mobile Haldi description/venue with the desktop sample (Morning Floral Ritual, Poolside).

Key locations: `apps/web/src/app/page.jsx`, `apps/web/src/features/home/`, `apps/web/public/brand/`, `apps/web/public/images/` and the expanded homepage checks in `scripts/smoke.mjs`. Scope decision: ADR-012.

Agreed behavior to preserve:

- Use the approved Admin, Family Member and Viewer role names when describing permissions. Role enforcement is not implemented yet.
- As destinations are implemented, connect Start Planning to registration and Log In to login. See How It Works already scrolls to its explanation section.
- Preserve the full logo. The product homepage keeps its chosen brand imagery. A couple's future personal wedding page may use the supplied couple image as a placeholder until that couple uploads a replacement; uploads and personal wedding pages are not implemented.
- Keep original Stitch exports and Word documents ignored and unchanged. Only the selected assets needed by the public page are served publicly.

Application verification, 18 October: lint, formatting, production build and HTTP smoke checks passed, including checks against independently started production web/API servers. The photo was visually checked on desktop and mobile; mobile navigation worked and neither viewport had horizontal overflow.

Follow-up verification, 19 October: lint, formatting, production build/startup and HTTP smoke checks passed after the copy refinements. Browser checks confirmed spaces after all three family labels, the three approved role names with Viewer read-only access, the consistent mobile Haldi venue, working mobile navigation and no mobile horizontal overflow or browser console warnings/errors. Before/after screenshots were captured for review.

### 3. Registration and email verification

Implemented, 19–20 October:

- Responsive `/register` and `/verify-email` routes using the corrected V1 Authentication & Verification States HTML as the visual reference, with the homepage's full logo, fonts, colors and local artwork.
- Display name, normalized email, password and confirmation; accessible validation, password visibility controls and requirements. Passwords require at least eight characters, uppercase/lowercase letters and a number; special characters are optional. Confirmation stays in the browser.
- Express `POST /api/v1/auth/register`, `/resend-verification` and `/verify-email`; Mongoose users/authTokens, Argon2id password hashes and hashed opaque one-time verification tokens. Transactional verification, expiry enforcement, atomic resend replacement/cooldown, duplicate-account protection and disabled-account checks.
- Resend email adapter with bounded requests and safe errors. Links use a URL fragment and an explicit Verify email action. Opening a link does not automatically consume it, log in, create a wedding or accept an invitation.
- Generic registration/resend acknowledgements, exact Origin/JSON requirements, local IP/email rate limits and safe configuration/provider errors. No credentials or raw tokens are logged. API-client errors expose safe validation details and Retry-After; auth calls can use a longer bounded timeout.
- Homepage desktop/mobile Start Planning actions now lead to registration. Sign-in remains clearly unavailable until its increment.
- Credential-free examples, setup guidance, native Node tests and ADR-013. Private MongoDB credentials were supplied by the user directly in the ignored API environment file.
- Visual follow-up, 20 October: the desktop editorial/image card stretches to match the form card, including when validation messages increase its height. The couple image grows with the available space and a closing tagline, “Less to juggle. More to celebrate.”, balances the text area. Mobile keeps the existing form-first layout.
- Privacy follow-up, 20 October: registration and verification resend retain the same generic HTTP 202 acknowledgement when email delivery fails. This prevents provider errors from revealing which addresses have eligible accounts. The service records only a constant delivery-failure message, retains the unverified account and releases the failed token claim so it can be retried. Configuration failures remain a uniform unavailable response before account lookup. See ADR-013.

Key locations: `apps/api/src/auth/`, `apps/api/src/lib/api-error.js`, `apps/web/src/app/(auth)/`, `apps/web/src/features/auth/`, `apps/web/src/lib/api-client.js`, `scripts/auth.test.mjs`, `scripts/auth-db.test.mjs` and ADR-013.

Verification, 20 October:

- `npm test`: 21 passing API-client/auth checks. The new regression reproduced the original 503-versus-202 disclosure before the fix, then passed with the real service/router and disconnected database models. It checks identical public acknowledgements, token-claim cleanup and safe server logging during provider failure.
- `npm run test:auth:db`: the latest run passed all ten checks against a uniquely named Atlas test database with a fake email sender; that database was removed. Covered hash-only storage, duplicates, concurrent resends/verification, expired/replayed links, delivery failure and disabled accounts. The new HTTP regression compares missing, verified, disabled and eligible unverified accounts during a provider failure, also covers new/duplicate registration, and verifies that failed sends can be retried immediately. An interim connection failure earlier on 20 October was resolved after the user updated the Atlas IP access list. No real emails were sent.
- Lint, formatting, production build and HTTP smoke checks passed. Independent production web/API startup and combined development startup were checked. The web page also loaded while the API was stopped.
- Browser checks covered desktop/mobile registration, required fields, password mismatch/show-hide behavior, safe unavailable-service responses, invalid-link/resend UI, mobile homepage-to-registration navigation and no horizontal overflow at 320/390 px. Dashboard connectivity showed connected, unavailable and recovered states as Express was stopped/restarted.
- Layout follow-up checks: equal card heights at 1440 px and 1024 px, with and without registration validation errors; the shared verification screen also aligns. Mobile at 320/390 px has no horizontal overflow. Lint, formatting, production build, independent production web/API startup and smoke checks passed after the visual change. A clean screenshot was captured without personal form data.
- Privacy follow-up checks: lint, formatting, production build, independent production web/API startup and HTTP smoke checks passed. The backend correction was checked with the HTTP/service/Atlas regressions above; browser and responsive-navigation checks were not repeated for this correction.
- Real-email follow-up, 20 October: after privately configuring the Resend key and onboarding test sender, the user reported receiving the verification link and completing verification. The agent has not independently inspected that real-account success screen or database record. The automatic Atlas checks use a fake sender and remain separate evidence. Successful verification should display “Email verified” and a Return to homepage link; automatic login/dashboard navigation is subsequent work.

Current handoff: the user has supplied the private Resend settings and reports successful email verification with the onboarding test sender. If that report did not include the “Email verified” success screen, clarify and inspect the actual result before treating verification as successful. For other recipients, verify an owned sending domain in Resend and update the sender accordingly. That next code increment was delivered in milestone 4 below. Atlas database checks are passing after the access-list update; rerun them if the network or configuration changes. No secrets should be sent in chat. Current local rate limits use process memory; deployment needs a separate review. The user authorized committing and pushing this increment to `DEV` on 20 October. Deployment remains deferred.

### 4. Login, persistent sessions and logout

Delivered, 20–21 October:

- Responsive `/login` using corrected Stitch sign-in/authentication-state references and the shared branded auth shell. Email/password only, accessible errors and show/hide control, no Remember Me or social login. Correct-password unverified accounts can request verification. Homepage, registration and verification-success links now reach login.
- Express `/auth/login`, `/auth/session`, `/auth/refresh`, `/auth/logout` and `/auth/csrf` under `/api/v1`. Verified active account enforcement, safe identity DTOs, Argon2id verification, 15-minute signed access JWTs and rotating opaque refresh tokens with absolute 30-day persistence. Private signing configuration is stable across restarts.
- Hash-only database refresh storage, atomic rotation, five-second concurrent-tab conflict handling, consumed-token replay revocation, bounded 8,192-token history, expiry before TTL cleanup and current-device logout. Other device sessions remain usable. Tokens are not returned in public JSON or stored in local/sessionStorage.
- Host-only HttpOnly cookies, production Secure cookie prefixes, exact Origin/JSON and signed double-submit CSRF protection. The browser API client coordinates refresh and stale-CSRF retries; network failures preserve cookies and show a recoverable state. Same-origin Next transport relay uses server-only `API_BASE_URL`; Express remains authoritative. See ADR-014 for the root-scoped access-cookie exception and deployment implications.
- Protected workspace layout **and page-level guards** prevent anonymous HTML/RSC from serializing workspace content. The browser restores access from its refresh cookie, invalid sessions return to login, and logout broadcasts to other tabs. Focus/page restoration/visibility and periodic checks revalidate sessions.
- Existing `/dashboard` is the user-approved interim destination, retaining sample labels; the remaining planning routes are protected placeholders. Forgot password remains disabled with a clear next-increment note. No wedding is created/joined and no invitation is accepted by authentication.

Key files: `apps/api/src/auth/session-service.js`, `cookies.js`, `models.js`, `router.js`; `apps/web/src/features/auth/login-form.jsx`, `session-provider.jsx`, `workspace-gate.jsx`; explicit workspace pages; `apps/web/src/app/api/v1/[...path]/route.js`; central API client; `scripts/sessions.test.mjs`, `scripts/sessions-db.test.mjs`; ADR-014.

Verification:

- `npm test`: 29 passing native Node HTTP/client/auth tests, including CSRF binding/rotation, persistent and production cookie attributes, token-free JSON, logout clearing, refresh coordination and network failure handling.
- `npm run test:auth:db`: 10 passing checks; `npm run test:sessions:db`: 16 passing checks after the review fixes. Each uses an isolated temporary Atlas database and fake email sender, then removes its own database. Session checks include concurrent refresh, expiry, tampered JWTs, consumed-token replay, guessed-token non-revocation, bounded history, device-specific logout, disabled users, restoration through a fresh backend connection, both logout/refresh orderings and retry after an injected user-lookup failure.
- Lint, formatting, production build and live production smoke checks passed. Smoke covers relay health/CSRF cookies/body limits, anonymous session denial and all eight workspace routes with no protected content in their anonymous payloads.
- Independent Express and production web startup and combined development startup were checked. Browser checks covered invalid-password feedback, successful login, reload/new-tab/server-restart persistence, desktop and mobile workspace navigation, logout and browser Back protection. A temporary API outage hid the workspace; retry after Express restarted restored it without a new login. The disposable browser-test account and its sessions were removed afterward. Login layouts at 320/390 px had no horizontal overflow; a clean desktop screenshot was captured.
- Persistence is supported by cookie expiry and tested refresh/backend restart behavior. A literal browser-app restart was not performed to avoid disrupting the user's tabs. No production deployment or HTTPS end-to-end test was performed; Secure cookie attributes are covered by HTTP tests.

Review follow-up, 21 October:

- Fixed logout racing with token rotation when access has expired. Logout accepts proof from a retained consumed refresh hash to revoke only that session; guessed secrets still cannot revoke it. A refresh paused at user lookup also cannot win over completed logout.
- Moved the eligible-user lookup and token signing before atomic refresh replacement. A temporary user-read failure returns a safe unavailable response while preserving the browser token for retry. The final replacement still enforces expiry/revocation and one rotation winner.
- All eight page guards now render embedded session recovery on failure instead of returning empty content. This supports client navigation where Next.js reuses the authenticated layout. Recovery avoids nested main landmarks and duplicate content IDs. Profile placeholder wording now correctly describes only deferred profile editing.
- Added four Atlas regression cases. Both reported backend failures were reproduced before the fix; the expanded session suite now passes all 16 checks, including both logout/refresh orderings and guessed-token non-revocation. The 29 local tests, lint and formatting also pass.
- A targeted browser wrapper rejected exactly one server page-session check for only the disposable fixture. Client navigation retained the workspace shell, showed recovery, and then restored the same page automatically without a reload. An earlier temporary test-clock run also exercised renewal of expired access. Saved environment files were unchanged. All temporary wrappers, clock and lifetime overrides were removed, normal combined development startup was restored, and the disposable fixture was cleaned up. The final build and production smoke checks passed, as did all 10 registration database checks. Browser checks also covered production desktop/mobile navigation, corrected Profile copy and API-unavailable retry recovery. A stale production test server held old browser connections during the mode switch and was stopped; this required no source change.

Limitations at the login milestone: password reset was the next increment (delivered below); wedding setup/membership/role authorization and planning APIs remain unimplemented. Production requires HTTPS, a trusted client-IP chain through the relay and shared rate-limit storage; current limits are in process memory and see the relay's IP. Hosting compatibility remains unresolved. The milestone and review fixes are committed in `29c249a` and were pushed along with status commit `92117fb`. Password recovery is delivered separately below.

### 5. Forgot and reset password

Implemented, 21 October:

- `/forgot-password` and `/reset-password` use the corrected V1 authentication/reset HTML and existing shared auth branding, logo, fonts, artwork and equal-height desktop cards. Login's Forgot password link is enabled. Forms include email validation, a generic inbox confirmation, request cooldown, password/confirmation validation, visibility controls, invalid/expired/used-link recovery and a password-updated screen leading to sign-in. Registration/reset now share their web password policy and requirements component.
- Express `POST /auth/forgot-password` and `/auth/reset-password` under `/api/v1`, strict input/Origin/JSON checks and IP/email/token-fingerprint rate limits. Reset links use trusted-origin fragments and 256-bit random tokens stored only as hashes with `PASSWORD_RESET` purpose, a 30-minute default lifetime and a 45-second request cooldown. New claims replace older links; opening a link does not consume it.
- Generic forgot acknowledgement precedes account lookup and email delivery. Bounded work in the local long-lived Express process handles lookup/claim/send, catches safe errors and drains on graceful shutdown. Missing global configuration and capacity errors are uniform. Delivery failure releases only its own claim. This best-effort dispatch is not durable and must be replaced before serverless deployment; see ADR-015.
- A transaction consumes the valid unused token, updates the Argon2id password hash and revokes all sessions for that account with `PASSWORD_CHANGE`. Failures roll back the entire operation. Login/refresh races cannot bypass revocation. Other accounts remain usable; unverified accounts stay unverified and disabled accounts cannot consume reset links.
- Success clears auth/CSRF cookies, broadcasts logout to same-origin tabs and offers explicit sign-in without auto-login. A best-effort change-notification email contains no credentials. No wedding setup, invitation acceptance or authenticated Profile/Settings password editing is included.
- Existing private MongoDB/Resend configuration is reused; no new credential is needed. Credential-free optional reset defaults are in the API example. No actual user credentials or accounts were edited by the agent.

Key files: `apps/api/src/auth/password-recovery.js`, `email.js`, `service.js`, `router.js`, `validation.js`; auth page routes and `forgot-password-form.jsx`, `reset-password-form.jsx`, `password-fields.jsx`; central API client; recovery test scripts; ADR-015.

Verification, 21 October:

- `npm test`: 35 passing local checks, including recovery validation, Origin/JSON, rate limits, cookie clearing, acknowledgement independence from deferred lookup, safe email adapters and all previous contracts.
- `npm run test:recovery:db`: 14 passing checks; existing registration and session suites also pass all 10 and 16 checks respectively. Each isolated temporary database was dropped and all email senders were fake. Coverage includes complete HTTP reset, hash-only storage, expiry/purpose, concurrent claims/consumption, replacement delivery races, all-device revocation, unrelated-account isolation, disabled/unverified users, transaction rollback and login/refresh races.
- Browser checks used synthetic non-account addresses and fabricated tokens: required email, generic confirmation/cooldown, password requirements/mismatch, server invalid-link response, Request a new link navigation and reset/forgot layouts without overflow at 320/390 px. No real password was changed through the browser. Desktop/mobile screenshots were captured with no personal data.

- Final lint, formatting, production build and live smoke checks passed. Independent production web/API startup and combined development startup were checked. The request form showed a safe error with the API stopped and retained its input; after Express restarted, resubmission returned the generic confirmation.
- An isolated UI-only mock on `127.0.0.1:3001`/port 4100 verified the success transition, token-fragment removal, persistent confirmation and explicit Continue to sign in navigation. It used a fabricated token, no database or email sender, and changed no real credentials. Both mock servers were stopped afterward and normal development mode restored.

Review follow-up, 21 October:

- The user reports a clear code review and completed manual regression testing with no functional bugs reproduced. The supplied tester report records 75 passing automated checks, disposable-account session revocation and new-password sign-in, desktop/mobile recovery and authentication regression checks, plus lint, formatting, build and smoke checks. Its success-screen check used an isolated UI mock; it did not validate a real Resend inbox-to-browser reset.
- The shared above-the-fold brand logo in `apps/web/src/features/home/brand.jsx` now loads eagerly, addressing the tester's minor loading warning while preserving the existing image and dimensions.
- Logo follow-up verification: lint, formatting, production build and live production smoke checks passed. A fresh browser check confirmed `loading="eager"`, a loaded logo at desktop/mobile sizes, no horizontal overflow at 390 px and no captured warnings/errors on the checked production recovery page. The viewport override was reset afterward. The 75 automated checks above are the supplied tester's results; database suites were not repeated for this image-loading change.

- Real-email follow-up, 21 October: the user confirms completing the actual email → reset link → new password → login flow. This is user-reported success; the agent did not independently inspect the real account or inbox. Automated HTTP/Atlas checks with fake senders remain separate evidence.

Commit handoff, 21 October: `npm test` passed all 35 checks, lint and formatting passed, and live development smoke checks passed. The first sandboxed test attempt could not bind temporary HTTP listeners; rerunning with local-listener access passed. The production build/startup, desktop/mobile and API-unavailable checks recorded above remain the latest evidence for the unchanged application code. Atlas suites and browser checks were not repeated solely for this commit; the tester's 75-check report and the user's real-email result remain separate evidence.

The remaining real-inbox check is complete based on the user's report for the configured sender/recipient. The onboarding sender's recipient restrictions still apply to broader delivery. The user authorized commit and push on 21 October. Wedding setup is for discussion next; implementation and deployment are not included in this handoff.

### 6. Basic wedding setup and workspace entry

Delivered, 21 October:

- Protected `/wedding-setup` follows the corrected Stitch three-step flow: Your Wedding, Place & Tradition, Cover & Review. Uses the full homepage logo, Inter/Playfair Display, existing plum/ivory colors and local couple cover. Original exports remain ignored and unchanged.
- Editable name suggestions use first groom name + “weds” + first bride name; manual edits are preserved. The original decorated setup preview was replaced in the visual follow-up below; the workspace foundation retains its Playfair name treatment. Budget is optional; Back/Next retains form values. Only the final confirmation saves; unsubmitted drafts do not survive reload/navigation.
- Collects couple names, title, main date, city/state, tradition and optional INR budget. India/Asia-Kolkata defaults are fixed. Dates remain calendar strings; budget is persisted as Int64 paise. The custom-upload control is visible but disabled for the following increment.
- Express `POST /api/v1/weddings` and member-only `GET /api/v1/weddings/{weddingId}` validate input, exact Origin/JSON, session, signed CSRF and create limits. Version/ETag are returned and forwarded by the relay.
- A transaction creates wedding, ACTIVE Admin membership and a 24-hour hashed creation-request record. A partial unique membership index enforces one active wedding per user, including parallel tabs. Same-key retries safely return the existing wedding; changed input/key conflicts and second weddings are rejected without orphan records.
- Production login/session/refresh include current wedding/membership from MongoDB. Fallible context reads precede refresh rotation. Budget fields are excluded for Viewer and Family Member without finance access; client input cannot assign roles.
- Both the layout and all eight planning pages preserve server/RSC guards, now requiring active wedding membership. New accounts enter setup; existing members enter their workspace. The dashboard/sidebar use real wedding details and empty planning states instead of sample names/counts. Existing `sample-data.js` is an unused legacy fixture. Other planning pages remain explicit placeholders.

Key files: `apps/api/src/weddings/`; shared auth database/session integration; `apps/web/src/app/(setup)/wedding-setup/page.jsx`; `apps/web/src/features/weddings/`; workspace gates, session provider, login, dashboard and shell; wedding test scripts; ADR-017.

Verification, 21 October:

- 90 automated checks passed: 39 local HTTP/client/form checks, 11 wedding Atlas checks, 10 registration Atlas checks, 16 session Atlas checks and 14 recovery Atlas checks. Each Atlas suite uses its own temporary database and fake senders, and drops its database afterward.
- Wedding coverage includes concurrent same/different-key submissions, single Admin membership, rollback/no orphans, optional budget, exact BSON money/date storage, second-wedding rejection, inactive/nonmember access, role-filtered budget data, real HTTP/session integration and refresh eligibility after a context lookup failure.
- Final lint, formatting, production build and smoke checks passed against independently started production web/API servers and the restored normal combined development servers. No new dependency was installed. All eight planning pages rejected nonmember workspace content in both HTML and RSC checks; the check follows Next.js's preliminary RSC canonical redirect before assessing the membership redirect.
- Browser checks used a disposable verified account in a separate temporary database and host: login to setup, validation, automatic/custom name handling, optional/invalid budget, Back/Next state, completion, workspace entry, reload, existing-member redirect, logout and returning-member login. Setup passed at 320/390 px; mobile workspace menu/navigation passed. API unavailable submission showed a safe error while retaining review details, and retry after restart succeeded.
- Browser testing reproduced an unintended submission when Continue became Create. Distinct button keys and cancellation of the Continue click's default action fixed it. The rerun reached review with zero wedding/membership/request records, then saved only on explicit final confirmation.
- Final desktop/mobile workspace checks confirmed the title styling, full logo, a responsive cover crop preserving both faces, no horizontal overflow at 320/390 px and no captured console warnings/errors on the clean production page. The dashboard showed API unavailable after stopping Express and API connected after restart/retry. Temporary test sessions were logged out, tabs closed and viewport overrides reset; the isolated browser database and fixture file were removed. Only the normal localhost development servers remain running.

Visual follow-up, 21 October:

- At the user’s request, aligned setup with the original Stitch HTML more closely: spacious first/second-step form cards, logo/header/stepper, compact wedding identity and locale review cards with Edit actions, three cover cards, a right-hand recap and a plum creation-confirmation panel. Removed the oversized heart-flanked name preview from setup. Preserved the full logo, self-hosted fonts, existing ivory/plum palette, editable name generation and existing creation behavior.
- Custom Upload and Minimalist & Clean stay visible, disabled and labelled Coming soon; the supplied local couple image remains selected. Reference-only date suggestions, invitation acceptance and unfinished support/privacy destinations are explicitly unavailable. No simulated upload progress, fabricated date suggestions, public wedding site, sample membership status or production-readiness claims are presented as working features. The detailed master dashboard is still a future increment.
- Relevant files: `apps/web/src/features/weddings/wedding-setup.jsx`, new `setup-review.jsx`, `weddings.module.css` and the presentation clarification in ADR-017. No backend, database schema or dependency changes were needed for this refinement.
- Verification: all 39 local regression checks, lint, formatting, production build, isolated production smoke and normal combined-development smoke passed. The initial sandboxed tests could not open their HTTP listeners; rerunning with local-listener access passed. The restricted production build was stopped while stalled; the build with required process access passed.
- Production browser checks used a disposable verified account and isolated Atlas database: required-field/budget validation, automatic and custom names, Back/Next retention, optional blank budget, review Edit actions, disabled cover choices, loaded local artwork, desktop and 320/390 px layouts without horizontal overflow. Review was reached with zero wedding/membership/request records before final confirmation. An API outage preserved the review and showed a safe error; retry after restart created the wedding and displayed the new success view. The test account entered the real protected dashboard, completed mobile menu/task navigation and desktop return navigation, then logged out. Local logo/cover assets loaded and no browser warnings/errors were captured. The temporary database was dropped, preview servers/tabs closed and viewport reset; normal development servers remain running. This browser fixture exercises the real existing creation API; the full Atlas regression suites recorded above were not repeated solely for the visual refinement.

Regression review, 22 October:

- Lint, formatting, production build and all 39 local tests passed. Registration, sessions and recovery Atlas suites passed all 10, 16 and 14 checks respectively, using disposable databases and fake senders. Normal combined development startup/smoke and independent API/production-web startup/smoke passed.
- The wedding Atlas suite passed 9 of its 10 subtests. The concurrent same-key retry subtest failed with WEDDING_ALREADY_EXISTS; Node also counts the failed parent, so its output is 9 passed / 2 failed across 11 entries. This supersedes the earlier all-pass result for the current review. A separate controlled interleaving reproduced the cause: the initial creation-request lookup can see no record, another request commits, and the subsequent membership lookup returns a conflict before replaying the now-existing same-key result. Exactly one wedding, membership and request remain, and a subsequent serial retry succeeds. Relevant code: `apps/api/src/weddings/service.js`, `existing()` and its initial call outside the transaction. Open priority: P2.
- Browser testing reproduced a display-only precision issue: input `90071992547409.91` is accepted as the maximum safe paise amount, but both review summaries show `₹9,00,71,99,25,47,409.90`. `budgetLabel()` divides the integer by 100 before formatting. Normal input `350000.75` displayed correctly and persisted as BSON Int64 `35000075`. The dashboard uses the same formatter. Relevant file: `apps/web/src/features/weddings/form-data.js`. Open priority: P3.
- Real production-browser checks passed for anonymous/unverified gating, verified login to setup, required fields, automatic/custom names and regeneration, negative/overprecision budget rejection, Back/Next and review Edit retention, loaded default artwork, disabled future covers, and draft discard on reload. Review was reached with zero wedding/membership/request records. API-outage submission retained the review and showed a safe error; explicit retry created exactly one wedding and ACTIVE ADMIN membership. Confirmation required an explicit workspace-entry action.
- Dashboard checks passed for saved identity/date/location/budget, full reload persistence, existing-member setup redirect, desktop navigation through all eight workspace pages, mobile menu/task navigation, 320/390 px layouts without horizontal overflow, API unavailable/retry recovery, logout/Back/direct-access protection and returning-member login. A second account successfully saved a past leap-day wedding (`2024-02-29`) with no budget field and no generated planning collections. No captured hydration/uncaught runtime error appeared during these checks.
- Recovery browser checks covered invalid email, the generic unknown-account acknowledgement/cooldown, and missing-reset-link recovery. Real inbox delivery and manual password submission were not repeated; reset expiry, single use and transactional session revocation were covered by the passing recovery suite.
- Application source was not changed to fix these findings. Temporary browser accounts were logged out, testing tabs closed and viewport reset; disposable test data was removed and normal development servers restored. No real user account or real wedding was modified, no real email was sent, and nothing was committed, pushed or deployed.

Review fixes and date-rule decision, 22 October:

- Setup opts into preserving its mounted React subtree during recoverable background session errors. A sticky connection banner offers retry; the form stays in memory but is inert until successful session revalidation. This retains entered values, Back/Next position, title-edit mode, confirmation state and the idempotency key. No localStorage, sessionStorage, IndexedDB or server draft was added. Confirmed logout/invalid sessions still remove protected setup content; other workspace guards retain their existing error behavior.
- Wedding preflight and duplicate-key recovery now read the request, membership and wedding from a single snapshot transaction. A concurrent commit between reads cannot incorrectly appear to be a different wedding. The write transaction rechecks membership and retains uniqueness, rollback and role-filtered response protection.
- Budget display now formats BigInt whole rupees and remainder paise with Intl parts, preserving `.91` at the maximum accepted amount. Storage and API bounds remain unchanged. No rounding workaround or new dependency was introduced.
- The user approved today/future dates for new wedding setup in Asia/Kolkata. Both the form/date picker and Express enforce it. Express checks only actual creation after resolving an existing identical request, so existing weddings remain usable and a still-valid retry can succeed after the date passes. This supersedes the earlier permissive creation rule in ADR-017; the approved baseline documents remain unchanged.
- Relevant files: setup page; `features/auth/session-provider.jsx`; wedding setup/form helpers; API wedding service/validation; wedding local/Atlas tests; ADR-017 and the development guide.
- All 95 automated checks passed: 41 local checks, 14 wedding Atlas checks, 10 registration Atlas checks, 16 session Atlas checks and 14 recovery Atlas checks. The deterministic retry interleaving and maximum-budget tests reproduced failures before their fixes. Coverage includes India-midnight/leap/year boundaries, rejected past-date creation without orphan records, creation on today, existing-wedding reads after midnight and same-key replay after midnight. Atlas suites use isolated databases/fake senders and clean up after themselves.
- Lint, formatting, production build and smoke checks passed for independent production web/API preview and normal combined development servers. Production browser checks confirmed a real minute-timer session failure keeps review mounted and blocks interaction, repeated session retry preserves it, recovery restores the same review, and the next create uses the same idempotency key. Exactly one wedding/Admin/request was saved. The maximum amount persisted as Int64 `9007199254740991` and displayed the final `.91` in both review summaries and dashboard. Past input was blocked and today accepted. The retry banner/review fit the checked 320 px viewport without overflow; desktop setup/navigation and mobile task navigation worked. A second draft retained its custom title during another session outage. After the disposable account was disabled, Retry received a confirmed invalid-session response, removed the draft and returned to login. Returning-member login and explicit logout passed; no captured browser warnings/errors appeared. All temporary browser accounts/data were removed, preview tabs/servers closed and viewport reset. Normal development servers remain running; no real account or email was used.

Independent focused retest, 22 October:

- Both previously reported issues passed: concurrent same-key requests and the deterministic commit-between-reads case now return the same wedding, and maximum-budget input displays the exact final `.91` in both review summaries and the saved dashboard. All 41 local checks and 14 wedding Atlas checks passed; lint, formatting, production build, isolated production smoke and normal development smoke also passed. Registration/session/recovery Atlas suites were not repeated in this focused retest.
- A disposable production-browser fixture confirmed past-date rejection, today acceptance, no records before final Create, retained/inert review during a real background session outage, successful session recovery and submission, exactly one wedding/Admin/request, and BSON Int64 `9007199254740991` storage. Mobile review/dashboard had no horizontal overflow at 390 px; mobile task navigation, desktop return/reload persistence and logout passed. The fixture database/file were removed, preview servers stopped, test tab closed and viewport reset. Normal development servers were left running. No new issue was found in these targeted checks and no application source was changed.

Midnight retry follow-up, 22 October:

- Fixed the frontend gap reported by code review: both the React Hook Form resolver and final request serializer now allow a past date only when the entire normalized API payload matches the in-memory previous attempt and retains its original idempotency key. New or edited past-date submissions still fail browser validation. Structural validation remains active; Express still decides whether the original request committed and whether replay is eligible. No browser storage or backend behavior change was needed.
- Relevant files: `apps/web/src/features/weddings/form-data.js`, `wedding-setup.jsx`, `scripts/weddings.test.mjs`, `scripts/weddings-db.test.mjs`, ADR-017 and the development guide. Added controlled-clock resolver/serialization tests and extended the Atlas midnight-replay case to use the actual web serializer.
- All 43 local checks and 14 wedding Atlas checks passed. The controlled clock crosses India midnight and confirms an unchanged attempted payload recovers the original saved wedding, while changed/new past-date submissions remain rejected. The Atlas test confirms exactly one wedding, Admin membership and creation-request record. Registration/session/recovery Atlas suites were not repeated for this frontend correction.
- Lint, formatting, production build, independent production web/API startup and production smoke passed. Normal combined development smoke also passed after restarting the local API to clear rate limits accumulated by repeated smoke runs. No source or saved environment change was needed for that restart.
- A disposable production-browser fixture replaced the first successful creation response with a simulated transport error after the real database transaction committed. The review remained available; retry reused the same key, recovered the saved wedding and left exactly one wedding/Admin/request. Workspace entry, reload, mobile navigation at 390 px without horizontal overflow and logout passed. Midnight itself was tested with the controlled-clock resolver/Atlas checks, not by changing the browser clock. The fixture database/file were removed, preview servers and test tabs closed, and viewport reset; normal development servers remain running. No real account or email was used.
- Independent focused retest passed all 43 local and 14 wedding Atlas checks, including controlled-clock resolver/serializer replay across India midnight and rejection of new/edited past-date requests. Lint, formatting, production build and isolated production smoke passed. A separate Chrome fixture returned one intentional 503 after the real creation committed; the unchanged browser retry reused the identical key/body and recovered the same wedding, with exactly one wedding/Admin/request. Mobile confirmation/navigation, workspace entry, desktop reload persistence and logout passed. Midnight was verified with the controlled-clock tests rather than a changed browser clock. No new issue was found in this scope; the disposable database/file, preview servers and test tab were removed and viewport reset. Application source and existing development processes were left unchanged; the registration/session/recovery Atlas suites and combined development startup were not repeated for this focused follow-up.

Acceptance and Git handoff, 22 October: the user authorized committing and pushing this milestone, including the review fixes and updated documentation, to `DEV`. The final pre-commit checks reran all 43 local tests, lint, formatting, production build and development smoke. The Atlas, production-startup and browser evidence above remains the latest verification for the unchanged application code; those longer checks were not repeated solely for the commit. Private environments, original Stitch/Word exports, dependencies and generated output remain excluded.

Remaining scope: discuss the confirmed Resend test-sender restriction, then custom wedding cover uploads, followed by real events/tasks/checklists/members/dashboard activity in agreed increments. No invitation acceptance, event/task generation, public guest site, wedding editing/deletion/recovery or upload functionality is claimed by this milestone. No real account was edited and no real email was sent by these tests. Deployment remains deferred.

## Remaining V1 development

Agreed incremental order, continuing one feature at a time:

1. Complete user review of the corrected basic wedding setup, then custom wedding cover uploads (the agreed following increment).
2. Events, tasks/recurrence, checklist templates and members/invitations in individually agreed increments.
3. Live dashboard/activity, profile/settings and recovery, completing the remaining V1 requirements.

Discussion decision, 20 October: the user selected the existing `/dashboard` as the interim destination after successful login. Authentication protection is delivered there while retaining the sample-data labels and placeholder scope. Milestone 4 implemented that interim destination. Milestone 6 now supersedes its sample-data entry behavior with setup routing and a real wedding workspace foundation.

Account/token persistence and verification endpoints are implemented; their current cloud limitations are recorded above. Login sessions and wedding membership/read authorization are implemented; planning CRUD, invitation/role management and uploads remain deferred. Future-version guest/RSVP, finance/vendor, accommodation, gallery and public wedding-site functionality remains outside current V1 implementation, even where the homepage previews it.

Deployment remains deferred. Amplify support for the chosen Next.js version is unresolved; local build success does not establish hosting compatibility. Do not change hosting providers or deploy without the user's instruction.

## How to maintain this file

- Update the last-updated date, current checkpoint and relevant milestone after major feature work. Preserve the delivered milestone history.
- Record what actually works, useful source paths and ADR links, checks performed with results, limitations and the next step. Clearly label partial work and checks that were skipped or blocked.
- Add a new milestone for a major feature; fold small refinements into the milestone they belong to. Do not treat installed packages, mock UI or disabled previews as implemented features.
- Keep requirements in the approved documents and architecture changes in `docs/decisions/`. Keep credentials, private exports and transient server/process details out of this file.
