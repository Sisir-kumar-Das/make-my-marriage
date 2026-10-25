# ADR-026: Session-aware homepage entry

Date: 24 October 2026

Status: Owner-approved for local implementation before ceremony activities.

## Context

The public product homepage at `/` was introduced by ADR-012. Login already chooses Dashboard for a verified member with an active wedding and Wedding Setup for a verified account without one. The owner requested the same entry behavior when returning to `/`, rather than showing marketing content to an already signed-in user, and approved this small correction before the next Events increment.

## Decision

- Keep `/` as the public landing page for signed-out visitors. For an Express-confirmed session, redirect to `/dashboard` when current wedding context exists, otherwise `/wedding-setup`. Do not infer authentication from a cookie, role, local storage or a query parameter. Roles and membership remain authoritative in Express, with both existing workspace SSR/RSC guard levels preserved.
- The root page reads request cookies and uses the existing no-store server session reader for access-cookie validation. Valid sessions redirect before the homepage is displayed. Request cookie access makes this a dynamic route; do not cache an authenticated redirect as a shared public response.
- With neither an access cookie nor an existing root-scoped CSRF-context cookie, render the public homepage directly. Cookie presence is only a hint to check/restore a possible session, never authorization. Recognize the existing development and secure production names. Do not introduce a new session-hint cookie or widen the refresh cookie's `/api/v1/auth` path.
- If a session hint exists but server access validation does not succeed, render the existing neutral session notice. The browser's central API client checks the session and coordinates the existing CSRF-protected refresh/rotation flow. Keep public homepage content out of the visible DOM during checking/recovery; do not flash the old homepage before opening the workspace.
- Confirmed session expiry/revocation reveals the public homepage at `/`. A transient network/API/configuration failure shows Retry and preserves the possibility of session recovery; it must not be treated as logout or guest status. Abort/ignore work after the component unmounts. Successful recovery replaces the root entry with the validated destination and refreshes its protected server content.
- This behavior is limited to opening `/`. Existing direct routes such as `/events`, `/tasks`, auth pages and explicit setup/workspace navigation retain their own behavior and guards. No remembered last-route store, new role-specific dashboard or arbitrary return URL is added.
- Reuse the existing session-notice styling. Preserve the public homepage's approved Stitch layout/logo/artwork and honest future previews. This supersedes ADR-012 only for signed-in/recovering root-entry behavior and leaves its public-page design intact.

## Scope and verification

This correction adds no backend endpoint, credential, database schema, email/storage operation or dependency. It does not implement ceremony activities; their optional end time/derived duration remains the approved pending scope in ADR-025. The overall feature order is unchanged after this owner-requested entry correction.

Extended smoke checks reject forged/stale cookie hints as authorization. Focused browser checks cover guest/member/setup destinations, refresh-only and expired access, revoked sessions, transient failure/Retry, direct-route preservation and mobile appearance. Actual results and limitations are recorded in PROJECT_STATUS.md. Independent code review/manual testing remains batched as agreed. No commit, push or deployment is authorized by this decision.
