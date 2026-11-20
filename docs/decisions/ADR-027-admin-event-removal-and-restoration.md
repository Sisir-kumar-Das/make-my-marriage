# ADR-027: Admin-only event removal and restoration

Date: 25 October 2026

Status: Accepted; implemented locally on 25 October 2026. Accepted by the owner after their check on 25 October; independent review/manual testing remains pending at the batched Events checkpoint.

## Owner decision

The owner explicitly selected **Admin-only removal and restoration of whole events** on 25 October 2026 and requested a permanent note for future agents. This resolves the API baseline's “Admin / policy” deletion access and “limited by resource policy” Family Member access. Admin, Family Member and Viewer remain the approved roles; there is no Manager role. Family Members retain event create/edit and individual ceremony activity management under ADR-025. Viewers remain read-only. Hiding a button is not authorization; Express must recheck the current role for every recovery read and mutation, including retries.

## Scope and safeguards

- DELETE an event means soft delete (`deletedAt`/`deletedBy`); preserve its activities and all related business/history data. Normal reads, lists, filters and overlap calculations exclude deleted events. No permanent event purge or cascade is introduced.
- Restore events while their active wedding exists, consistent with the database design. The wedding's separate seven-day deletion window does not impose a seven-day event expiry. Whole-wedding recovery/purge remains deferred.
- Keep the current parent event version and 24-hour idempotency protections for both removal and restore, with transactional immutable history and fresh eligibility checks. A matching retry reports current state without repeating the old action after an intervening restore/removal. Stale changes require explicit reload. Restoring preserves existing fields/status/times and recomputes advisory timing warnings; it does not silently rewrite historical data.
- Use the existing Stitch Events removal location with a clear confirmation naming the ceremony and its retained activity count. Recovery uses the corrected Settings/Profile/Recovery export's Data Recovery Tray and actual removed-event rows with restore actions. Task and wedding lifecycle previews remain visibly Coming soon. A new Admin-only paginated deleted-event read supports this slice of `/recovery`; the full Recovery milestone stays later in the agreed sequence.
- Future Tasks must treat a retained reference to a removed event as unavailable and preserve their own data/history; future guest/finance modules must follow the approved non-cascade rules. This increment introduces no fake related-record counts or unbuilt module APIs.
- Keep both workspace SSR guards and client recovery/session-error protection, the existing API relay and save locks. No new dependencies, credentials or hosting changes are introduced. The owner subsequently authorized committing/pushing the accumulated checkpoint on 25 October; deployment remains deferred.

## Verification and next step

Cover current-role and tenant denial, retained embedded/related data, audit rollback, retry/intervening-state recovery, concurrent edit/remove/restore conflicts, paginated recovery reads and UI confirmation/retry/session behavior. Record actual checks in PROJECT_STATUS.md; independent review/manual testing remains batched. Google Places with manual fallback follows before closing Events/V1.
