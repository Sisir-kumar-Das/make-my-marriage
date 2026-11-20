# ADR-017: Wedding setup and membership-based workspace entry

Date: 21 October 2026

Updated: 22 October 2026 — review fixes and user-approved creation-date rule

Status: Accepted for the basic local V1 increment

Subsequent cover increment, 23 October: [ADR-020](ADR-020-private-wedding-cover-uploads.md) implements optional custom covers and narrowly supersedes the default-only/disabled-upload scope below. The atomic creation, retry, date, money and membership rules remain in force.

Subsequent visual alignment, 23 October: [ADR-021](ADR-021-stitch-page-alignment.md) supersedes the provisional workspace styling and warm setup palette with the owner-approved corrected Stitch references. Creation, retry, date, money and membership rules remain unchanged.

## Context and scope

The user approved basic wedding setup before custom cover uploads. Use the corrected three-step Stitch setup flow and desktop review HTML in the ignored local export, adapt the older mobile reference to the same flow, and preserve the homepage's full logo, Inter/Playfair Display fonts, colors and existing couple artwork. Original reference files remain unchanged and ignored. The user initially requested an editable name such as “Sisir weds Priyanka”, with Playfair names, a smaller italic “weds” and subtle plum outline hearts. In the 21 October visual follow-up, the user approved matching the original Stitch setup screens more closely. The setup uses clean, compact name styling without the large decorated preview; the workspace heading remains part of the separate dashboard foundation.

This delivers creation, initial Admin membership and entry into a real wedding workspace. Member invitations/role editing, wedding editing/deletion/recovery, custom uploads, events, tasks, templates and activity feeds remain subsequent increments. Guest/public wedding-site access is outside V1. A role-test fixture is not an implemented invitation feature.

## Setup flow and presentation

- Explicit protected `/wedding-setup`, outside the planning layout: Your Wedding → Place & Tradition → Cover & Review. A verified account with no active wedding goes here; an existing member goes to `/dashboard`.
- Collect wedding name, bride/groom names, main date, city/state and tradition. India and Asia/Kolkata are fixed initial defaults. The estimated INR budget is optional. Supported initial tradition keys follow the supplied selector: ODIA, NORTH_INDIAN, BENGALI, SOUTH_INDIAN, PUNJABI, GUJARATI and OTHER.
- Suggest the first groom name + “weds” + first bride name. Keep auto-suggestions until the user edits the title; Generate from names restores suggestion mode. Custom wording remains intact. Hearts are decorative UI icons and are not added to the stored name.
- Keep form values in React Hook Form across Back/Next. Temporary background session-check errors must keep the same setup subtree mounted in React memory, including form values, the current step, custom-title state, completion state and retry key. Show a visible retry banner and make setup inert until successful revalidation. Confirmed logout/invalid sessions still remove it; other workspace guards retain their existing blocking behavior. Do not persist a partial wedding or store a draft in browser storage. Refresh/navigation can discard an unsubmitted draft. Only the final Create action submits; separate Continue/Create buttons and cancellation of the Continue click's default action prevent accidental submission during their transition.
- Follow the setup-flow reference for the first two forms and the desktop review reference for the final step: completed detail cards with Edit controls, three cover cards, and a right-hand summary recap. Preserve actual entered values and the existing warm ivory/plum brand palette, full logo and local fonts. The completion view uses the reference’s plum welcome panel with disabled upcoming planning actions. This does not implement the separate master-dashboard design.
- Use the existing default cover. Custom upload and the minimalist cover option remain visible but disabled/labelled coming soon. Date suggestions, invitation acceptance and unimplemented support/privacy destinations are also explicitly unavailable; do not copy simulated uploads, sample dates, false existing-membership banners or production-readiness claims from the design demo. No R2 credential, upload handler or media record is required. References disagree on upload limits; settle those when implementing uploads.
- Creation shows confirmation and an explicit Enter your workspace action. Do not generate events/tasks or accept invitations. Workspace identity/date/location are real, with clear planning empty states and disabled future actions. Remove sample wedding counts/names from the live dashboard; legacy `sample-data.js` is an unused scaffold reference.

## API and persistence

Express owns strict validation, business rules, session eligibility and MongoDB access. Browser calls use the existing central API client/relay. Add authenticated `POST /api/v1/weddings` and member-only `GET /api/v1/weddings/{weddingId}`. Mutations require exact Origin, JSON and signed CSRF; creation also has an authenticated-user rate limit and a bounded Idempotency-Key. Responses are no-store, with resource version/ETag; the relay forwards ETag.

Creating Wedding, initial ACTIVE ADMIN WeddingMember and a creation-request record is one MongoDB transaction. An eligible verified ACTIVE user write serializes creation with account-changing writes. Membership has the baseline unique wedding/user index and a partial unique user index for ACTIVE membership, enforcing one active wedding even across tabs/retries. A collision or member-write failure cannot leave an orphan wedding. A second wedding returns WEDDING_ALREADY_EXISTS and the UI offers the existing workspace.

`weddingCreationRequests` stores user/key hashes, normalized-input hash, wedding ID and a 24-hour TTL. The preflight and duplicate-key recovery read request/membership/wedding through one read-only snapshot transaction, so a winner committing between reads cannot produce a false membership conflict. The creation transaction repeats the check before writing. Same-key/same-input retries return the existing wedding after checking current membership; same-key/different-input retries return IDEMPOTENCY_CONFLICT. Never store/replay a privileged response snapshot. The unique active membership still prevents duplicates after key expiry. Slugs are server-generated with a random suffix and reserved for later compatibility; no public site is created.

Store mainDate as YYYY-MM-DD with wedding timezone. The user-approved 22 October rule supersedes the original permissive creation behavior: new weddings require today or a future calendar date in Asia/Kolkata, enforced in the browser and authoritatively by Express. Evaluate the rule at actual new creation, after replay resolution. Existing weddings remain readable/usable after their main date; a still-valid identical creation retry returns its existing wedding even after midnight. Both the React Hook Form resolver and the final request serializer exempt only a normalized API payload matching the in-memory previous attempt body with its original key. New or changed past-date submissions remain blocked in the browser. Express remains authoritative: if the prior request never committed or its replay record expired, this client exception cannot create a new past-date wedding. Do not apply the creation-date restriction to read/session/membership checks. Store optional money as BSON Int64 paise using Mongoose BigInt; validate safe integer API amounts and convert decimal input with integer arithmetic. API serialization emits safe integer minor units. No floating-point currency is persisted. Format display using BigInt whole rupees and remainder paise with Intl parts; never divide into a fractional Number before display. Preserve all accepted paise, including Number.MAX_SAFE_INTEGER.

## Session and authorization boundary

The production auth service and wedding service share the existing lazy MongoDB connection. Production login/session/refresh resolve current wedding and membership from the database; roles never enter the access JWT. Resolve fallible wedding-context reads before refresh-token rotation commits, preserving refresh eligibility during an outage.

Return budget data only for Admin or Family Member with finance access, including in session responses. Viewer never receives it. Wedding reads require active membership and use the same not-found response for inaccessible weddings. Revoked/disabled/unverified account checks remain in existing authentication. Do not assign roles at registration or from client input.

Retain both layout and all eight page-level SSR/RSC guards. They require a valid session and current wedding; otherwise restore authentication or redirect to setup, without serializing planning content. The setup page independently checks its session and redirects existing members to their workspace. Browser session rechecks coordinate redirects/refresh when membership changes; setup keeps its own post-creation confirmation until the user enters the workspace.

## Verification and remaining work

Use native HTTP/client checks and an isolated Atlas wedding suite for single membership, concurrent retries, second-wedding rejection, transaction rollback, BSON money/date integrity, role-filtered reads and session-context refresh failure. Retain registration/session/recovery regression suites. Record actual production/browser, responsive, unavailable-service and startup results in PROJECT_STATUS.md. Browser fixtures use a disposable database, no real email and a separate host from the user's localhost session; remove the fixture database afterward.

Next agreed increment: custom wedding cover uploads. This decision does not authorize deployment, a new state-management library, commit or push. Approved baseline documents remain unchanged.
