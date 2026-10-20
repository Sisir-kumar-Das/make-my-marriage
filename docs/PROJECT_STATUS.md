# Make My Marriage — Project status

Last updated: 20 October 2026

This is the working handoff for development progress. Update it after each major feature or milestone so another agent can continue from the current checkpoint. Completed means implemented and checked locally; it does not imply deployment or a Git commit.

## Current checkpoint

The runnable scaffold and public product homepage are complete for their agreed local scope. The first authentication increment now implements registration and email verification, with Express account/token storage and responsive web forms. Start Planning opens `/register`. Login, persistent sessions, logout, password reset and wedding-planning business features remain deferred; the public sample workspace still contains no real wedding data or protected pages.

Atlas connectivity is verified: after the user updated the Atlas IP access list on 20 October, the database tests passed again. The latest expanded suite passes all ten checks, including the email-failure privacy regression. The temporary test database was removed. This resolves the earlier connection blocker for the current development connection; future network/IP changes may require another access-list update. On 20 October the user supplied a Resend key and the standard onboarding test sender privately in the API environment file. The user subsequently reported receiving the real verification email and completing verification. This is user-reported validation, separate from the agent's automated tests; the agent has not independently inspected the real-account success screen or database record. The intended endpoint of this increment is the “Email verified” screen with a Return to homepage link. Login and dashboard navigation require the next increment. Broader sending requires a verified owned domain. The next approved implementation increment is login/protected pages/persistent sessions/logout, followed by forgot/reset password.

## Read before continuing

- [Development guide](DEVELOPMENT.md): startup commands, prepared dependencies, application boundaries and verification steps.
- Approved baselines: [PRD](Make_My_Marriage_PRD_v1.0.md), [system design](Make_My_Marriage_System_Design_Architecture_v1.0.md), [database design](Make_My_Marriage_Database_Design_v1.0.md) and [API design](Make_My_Marriage_API_Design_v1.0.md). Preserve these documents.
- [ADR-011](decisions/ADR-011-npm-workspace-monorepo.md): accepted npm-workspace architecture and subsequent dependency preparation.
- [ADR-012](decisions/ADR-012-public-homepage-preview.md): accepted public homepage, design reference and planned-feature preview scope.
- [ADR-013](decisions/ADR-013-registration-email-verification.md): first auth increment, email-link verification, private configuration and remaining session work.
- Root [AGENTS.md](../AGENTS.md) and applicable application instructions. Inspect the actual source and `git status` before editing; preserve existing user changes.

## Milestone history

| Milestone                                               | Status                                                           | Recorded dates                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| Runnable project scaffold and V1 dependency preparation | Complete locally; business features deferred                     | 13–14 October 2026                              |
| Public product homepage                                 | Complete locally; future features remain previews                | 17 October 2026; refinements 18–19 October 2026 |
| Registration and email verification                     | Implemented; Atlas checked; user reports real email verification | 19–20 October 2026                              |
| Login, persistent sessions and password recovery        | Approved next increments; not implemented                        | After registration/verification                 |

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
- Future guest, RSVP, finance and accommodation details remain visible with “Planned” labels. Unavailable actions are disabled. Registration was enabled in the first auth increment; login remains disabled.
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

Current handoff: the user has supplied the private Resend settings and reports successful email verification with the onboarding test sender. If that report did not include the “Email verified” success screen, clarify and inspect the actual result before treating verification as successful. For other recipients, verify an owned sending domain in Resend and update the sender accordingly. The next code increment is login, protected pages, persistent sessions and logout. Atlas database checks are passing after the access-list update; rerun them if the network or configuration changes. No secrets should be sent in chat. Current local rate limits use process memory; deployment needs a separate review. The user authorized committing and pushing this increment to `DEV` on 20 October. Deployment remains deferred.

## Remaining V1 development

Agreed incremental order, continuing one feature at a time:

1. Continue with login, protected pages, persistent sessions and logout; follow with forgot/reset password, including expired-link/error states. Preserve the distinction between automated tests and the user-reported real email flow above.
2. Wedding setup and a real planning-workspace entry flow.
3. Dashboard structure for the authenticated wedding, then members/invitations, events, tasks/recurrence and checklist templates in agreed increments.
4. Live dashboard/activity, profile/settings and recovery, completing the remaining V1 requirements.

Account/token persistence and verification endpoints are implemented; their current cloud limitations are recorded above. Login sessions, wedding authorization, real planning endpoints and uploads are not implemented. Future-version guest/RSVP, finance/vendor, accommodation, gallery and public wedding-site functionality remains outside current V1 implementation, even where the homepage previews it.

Deployment remains deferred. Amplify support for the chosen Next.js version is unresolved; local build success does not establish hosting compatibility. Do not change hosting providers or deploy without the user's instruction.

## How to maintain this file

- Update the last-updated date, current checkpoint and relevant milestone after major feature work. Preserve the delivered milestone history.
- Record what actually works, useful source paths and ADR links, checks performed with results, limitations and the next step. Clearly label partial work and checks that were skipped or blocked.
- Add a new milestone for a major feature; fold small refinements into the milestone they belong to. Do not treat installed packages, mock UI or disabled previews as implemented features.
- Keep requirements in the approved documents and architecture changes in `docs/decisions/`. Keep credentials, private exports and transient server/process details out of this file.
