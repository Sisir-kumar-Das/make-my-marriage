# ADR-038: Bounded homepage session recovery and workspace opening

Date: 27 October 2026

Status: Owner authorized fixing the repeated root checking-screen stall after reviewing the controlled reproduction and Retry/Continue proposal. The Checklist owner's walkthrough remains pending; this follow-up does not change the agreed business-feature order or authorize commit/push/deployment.

## Problem and scope

ADR-026's HomeEntry checks/restores the session, then calls router.replace and router.refresh while retaining a checking notice until navigation completes. A controlled production reproduction with a synthetic successful session and held Dashboard RSC response remained on that notice for over 75 seconds with no recovery controls. The owner's exact original dev/network trigger was not established, and the HMR warning alone does not identify it.

This decision supersedes only ADR-026's browser success-navigation/wait behavior at `/`. Preserve server-confirmed root redirects, signed-out public entry, current membership routing, central API refresh/CSRF behavior, refresh-cookie scope and both workspace SSR/RSC guards. Other login, page-level SessionRestore, logout and workspace draft-recovery mechanisms retain their existing behavior.

## Root-entry state and navigation

- Checking: run the existing api-client session check with cancellation and its existing per-request deadline. Bound the whole checking attempt at 20 seconds as well, including refresh coordination. Timeout invalidates/aborts the attempt and exposes Retry, never Continue or guest content on an unconfirmed transient failure.
- Guest: only confirmed SESSION_EXPIRED reveals the public homepage at `/`. Old canceled checks cannot overwrite later guest/member/error state.
- Opening: after a successful identity response, display Opening your workspace. Choose only `/dashboard` for a wedding or `/wedding-setup` otherwise; never use a provider/query/API-supplied return URL. Perform one fresh same-origin document replacement, preserving server authorization on the destination. Remove the root success replace/refresh pair.
- Delayed opening: after 10 seconds, stop the pending document load before showing the recovery message, so the current page and its controls remain usable. Show Retry plus an ordinary Continue to Dashboard or Continue to Wedding Setup link to the fixed confirmed destination. Immediate browser-navigation failure exposes the same safe recovery state. No automatic retry loop or authentication bypass.
- Retry: clear old destination/errors, abort/invalidate earlier checks and clear their timers; stop an earlier opening request if it is still pending, then run session validation again. A now-expired/revoked session returns to the public homepage. Continue initiates a fresh protected page load; it never grants access from a remembered destination alone.
- Cleanup: dispose the active attempt, abort request and clear timers on unmount/StrictMode cleanup. Do not stop a successful new document during cleanup. New attempts reject late old successes/failures and stale deadline callbacks.

Use local React state and a small lifecycle controller, with no dependency, browser persistence, cookie/security-setting or backend schema/API changes. Extend SessionNotice with optional title/description/actions while preserving all existing default consumers and the approved neutral plum/ivory appearance. Public homepage and workspace visuals remain unchanged.

## Verification

Native tests protect checking/opening deadlines, active cancellation, guest versus transient errors, fixed setup/member destinations, retry clearing, stale response rejection, cleanup, invalid success data and immediate navigation failure. Run existing native/lint/format/build/smoke checks. Browser-check ordinary guest/member/setup recovery, the formerly held RSC condition, actual held document loads reaching recovery controls, Retry/Continue, revocation between attempts, API error/Retry, responsive bounds and ordinary development entry. Use isolated synthetic session/navigation fixtures without touching owner data or private environments; their results do not replace prior real-database auth evidence. Record actual results/limits in PROJECT_STATUS.md and keep independent acceptance separate.
