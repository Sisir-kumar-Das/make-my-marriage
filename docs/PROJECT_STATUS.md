# Make My Marriage — Project status

Last updated: 18 October 2026

This is the working handoff for development progress. Update it after each major feature or milestone so another agent can continue from the current checkpoint. Completed means implemented and checked locally; it does not imply deployment or a Git commit.

## Current checkpoint

The runnable scaffold and public product homepage are complete for their agreed local scope. The workspace still uses sample data and placeholder pages. Authentication and wedding-planning business features have not been implemented.

The next proposed milestone is V1 email/password authentication. Agree its scope with the user before starting implementation; creating this status file does not start that feature.

## Read before continuing

- [Development guide](DEVELOPMENT.md): startup commands, prepared dependencies, application boundaries and verification steps.
- Approved baselines: [PRD](Make_My_Marriage_PRD_v1.0.md), [system design](Make_My_Marriage_System_Design_Architecture_v1.0.md), [database design](Make_My_Marriage_Database_Design_v1.0.md) and [API design](Make_My_Marriage_API_Design_v1.0.md). Preserve these documents.
- [ADR-011](decisions/ADR-011-npm-workspace-monorepo.md): accepted npm-workspace architecture and subsequent dependency preparation.
- [ADR-012](decisions/ADR-012-public-homepage-preview.md): accepted public homepage, design reference and planned-feature preview scope.
- Root [AGENTS.md](../AGENTS.md) and applicable application instructions. Inspect the actual source and `git status` before editing; preserve existing user changes.

## Milestone history

| Milestone                                               | Status                                            | Recorded dates                                      |
| ------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| Runnable project scaffold and V1 dependency preparation | Complete locally; business features deferred      | 13–14 October 2026                                  |
| Public product homepage                                 | Complete locally; future features remain previews | 17 October 2026; photo crop refined 18 October 2026 |
| V1 authentication                                       | Planned; not started                              | Next proposed milestone                             |

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
- Future guest, RSVP, finance and accommodation details remain visible with “Planned” labels. Unavailable actions, including registration/login, are disabled.
- Follow-up on 18 October: adjusted the wedding-website preview photo's vertical crop so the groom's full hairstyle remains visible on desktop and mobile.

Key locations: `apps/web/src/app/page.jsx`, `apps/web/src/features/home/`, `apps/web/public/brand/`, `apps/web/public/images/` and the expanded homepage checks in `scripts/smoke.mjs`. Scope decision: ADR-012.

Agreed behavior to preserve:

- Use the approved Admin, Family Member and Viewer role names when describing permissions. Role enforcement is not implemented yet.
- As destinations are implemented, connect Start Planning to registration and Log In to login. See How It Works already scrolls to its explanation section.
- Preserve the full logo. The product homepage keeps its chosen brand imagery. A couple's future personal wedding page may use the supplied couple image as a placeholder until that couple uploads a replacement; uploads and personal wedding pages are not implemented.
- Keep original Stitch exports and Word documents ignored and unchanged. Only the selected assets needed by the public page are served publicly.

Latest application verification, 18 October: lint, formatting, production build and HTTP smoke checks passed, including checks against independently started production web/API servers. The photo was visually checked on desktop and mobile; mobile navigation worked and neither viewport had horizontal overflow.

## Remaining V1 development

Proposed incremental order, to confirm with the user one feature at a time:

1. Authentication and account flows, following the approved API/security designs.
2. Wedding setup and a real planning-workspace entry flow.
3. Dashboard structure for the authenticated wedding, then members/invitations, events, tasks/recurrence and checklist templates in agreed increments.
4. Live dashboard/activity, profile/settings and recovery, completing the remaining V1 requirements.

Real business endpoints, authentication/authorization, MongoDB persistence, email and uploads are not wired into the scaffold. Future-version guest/RSVP, finance/vendor, accommodation, gallery and public wedding-site functionality remains outside current V1 implementation, even where the homepage previews it.

Deployment remains deferred. Amplify support for the chosen Next.js version is unresolved; local build success does not establish hosting compatibility. Do not change hosting providers or deploy without the user's instruction.

## How to maintain this file

- Update the last-updated date, current checkpoint and relevant milestone after major feature work. Preserve the delivered milestone history.
- Record what actually works, useful source paths and ADR links, checks performed with results, limitations and the next step. Clearly label partial work and checks that were skipped or blocked.
- Add a new milestone for a major feature; fold small refinements into the milestone they belong to. Do not treat installed packages, mock UI or disabled previews as implemented features.
- Keep requirements in the approved documents and architecture changes in `docs/decisions/`. Keep credentials, private exports and transient server/process details out of this file.
