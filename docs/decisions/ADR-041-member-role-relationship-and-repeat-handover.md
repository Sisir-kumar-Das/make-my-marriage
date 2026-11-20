# ADR-041: Member role/relationship edits and explicit repeat handover

Date: 29 October 2026

Status: Owner authorized Members Step 3. Supplements PRD roles/last-Admin rules, API member PATCH and database membership integrity. Removal remains the next increment. No commit, push or deployment authorized.

## Scope and owner decisions

Only a current verified active Admin may preview/confirm changes to an active member's Admin/Family Member/Viewer role and wedding-specific relationship. Use the corrected Stitch Members screen and its existing invitation-modal styling for the approved old-role → new-role confirmation. Preserve required common/Other relationship choices for non-creators and the original creator's exemption. Never change global account details or infer a relationship. Export, removal and finance management remain deferred.

A wedding must retain at least one eligible active Admin, including concurrent changes and self-demotion. Express enforces the invariant transactionally, sharing the wedding member-revision and current-account/member locks with existing writes. Current server reads remain authoritative for every operation; a role change does not preserve obsolete privileges in an existing session. The actor rechecks their session after saving; other tabs also recheck through the existing channel/focus/timer mechanisms. No websocket service is introduced.

Pending invitations retain the existing issuing-Admin requirement. Before demoting an Admin, show their unexpired pending-invitation count and explain that a current Admin must resend those links afterward. Do not silently transfer issuer authority or revoke invitations as a side effect.

## Repeat handover

The repeat worker currently authorizes the member who last configured a pattern (`TaskSeries.updatedBy`). Before an editor becomes a Viewer, show the count and bounded preview of their active rules ending today or later. Require explicit handover confirmation and an eligible other Admin as recipient. Default to the acting Admin when changing someone else; a self-downgrade requires explicitly choosing another Admin. Do not silently select or hand over rules during a relationship-only change. Show the member's open assigned tasks and explain that Viewer cannot complete them; retain assignments until an explicit task edit or the later removal increment.

Handover changes only the repeat rule's current manager/version and clears an old manager-unavailable retry reason. Preserve cadence, cursor, date boundaries, template/assignees, original creator, stopped/past rules and all generated tasks/completion/history. Write the membership edit, repeat metadata and immutable member-change audit atomically. The worker and future-repeat edits share wedding/task/member locks with these changes. Genuine unavailable-assignee/event errors are not cleared.

## Preview, concurrency and retries

Admin GET `/weddings/:weddingId/members/:memberId/management` returns only the managed member, current version, last-Admin/assigned-work impact, bounded repeat titles and eligible handover candidates. A ten-minute server-signed preview binds the actor, member version and wedding member/task revisions. It contains no arbitrary redirect or secret credential. PATCH uses strict role/relationship/handover input, If-Match and a UUID idempotency key. Recompute current impact and recheck authorization, recipient eligibility and last-Admin safety inside the transaction. Stale impact/version requires a fresh reviewed preview; never silently replace it and save.

Twenty-four-hour receipts retain only the result of that exact member-change request, not emails or session data. Recheck current verified active account, membership and live wedding before replay. Current Admins may replay their own matching receipts. A still-active member may recover only their own already-committed self-demotion receipt, read-only; it cannot authorize a new write, re-promote them or restore removed access. All other non-Admin requests remain forbidden. Replay precedes stale preview/version checks and cannot repeat audit/handover writes.

Keep form choices and the original unchanged retry key in React memory through recoverable errors. Retain the submitted preview as well, scoped to wedding/account/member, when a recovery GET fails. Within the same wedding/account/member, Preview Retry is non-destructive; only explicit reload replaces choices and resets the old attempt. Remount the complete editor on wedding/account/member changes so its draft, confirmation, preview, errors and immutable request are reset together; ignore late saves from an unmounted editor. During failed-preview recovery keep the submitted fields visible/read-only while allowing the original exact retry; confirmed access denial must still block submission until a fresh authorized preview succeeds. Starting a preview retry, a transient retry failure or explicit draft reload cannot clear that denial. The dedicated role-dialog title follows the corrected Stitch Playfair typography. Lock dismissal during writes, use the established centered discard confirmation and restore focus. Explicit reload replaces choices after a conflict; no local-storage draft. Pending permission loss blocks new writes. These are local-state/API changes under ADR-016, with no new dependency or credential.

## Verification

Use native strict-contract/route/preview tests and isolated Atlas transaction tests for all roles/tenants, creator exception, stale preview/version, retries, rollback, self-demotion recovery, simultaneous Admin demotions and concurrent repeat generation. Confirm existing sessions lose write permissions immediately on the server. Browser-check modal focus, old/new confirmation, handover selection, assigned-Viewer warning, dirty/pending/error states and desktop/mobile layouts with disposable data. Record actual results and gaps in PROJECT_STATUS.md. Batch independent review as agreed.
