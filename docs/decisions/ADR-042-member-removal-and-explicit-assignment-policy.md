# ADR-042: Member removal and explicit assignment choices

Date: 29 October 2026

Status: Owner authorized implementation after discussion. Members Steps 3 and 4 await owner/independent review together. No Git or deployment authorization.

## Approved scope and reference

Only a current verified active Admin can preview/confirm removal from this wedding, including their own membership if another eligible Admin remains. Protect the last active eligible Admin transactionally across removal, role edits and concurrent writes. Mark membership REMOVED; never delete the account, global sessions, created tasks or prior activity. Rejoining requires a new invitation and explicit matching-email acceptance, not a Restore button or replay of an old acceptance/removal receipt.

Use the corrected Stitch `make_my_marriage_member_role_removal_management/code.html` removal modal: member summary, access explanation, real affected work and explicit reassignment choices. Supersede its preselected radio with no default, as the owner requires an explicit choice. Reuse its typography, plum/neutral colors and responsive modal structure. No sample members or invented task totals.

## Assignment policy

The owner explicitly approved including **all unfinished To Do/In Progress tasks, including overdue tasks and tasks without deadlines**. This narrowly supersedes the earlier future-only unfinished-task policy. Exclude completed, deleted and recurrence-retired task records. Preserve their saved fields/history; unavailable historical members resolve through existing neutral labels. Reassign changes only the departing member's slot to a chosen current eligible wedding member, deduplicating if that recipient is already assigned. Leave unassigned removes only the departing member. Other assignees stay; an empty `assigneeIds: []` represents an unassigned task. Assignment never grants Viewer edit access; warn when choosing a Viewer.

Apply the same explicit policy to active repeat-rule templates ending today or later which contain the departing member. Preserve cadence, dates, cursor, original creator and stopped/past rules. Changes to generated task copies mark those copies customized so later reconciliation cannot overwrite that explicit decision. Keep completed/past-completed work unchanged; overdue **unfinished** work is included by the latest owner decision.

Separately show active future repeat rules managed by the departing member, including rules assigned to other people. Require explicit handover to another eligible Admin. Propose the acting Admin when removing someone else; self-removal requires selecting another Admin. The final confirmation includes this handover; it is separate from task assignment or leaving tasks unassigned. Clear only an old manager-unavailable retry reason. Keep unrelated dependency errors. Pending invitations issued by a removed Admin keep ADR-040's current-issuer requirement and must be resent by a current Admin; show that impact, with no silent issuer transfer.

## API, concurrency and history

Admin GET `/weddings/:weddingId/members/:memberId/removal` returns a current scoped preview, exact counts, bounded live-task/rule samples, current Admin handover choices, member version and ten-minute signed impact token. Replacement choices use the existing paginated minimal task-assignee endpoint; exclude the departing member in the UI and revalidate the chosen recipient in Express. Tokens bind the removal purpose, actor, membership version and wedding member/task revisions plus affected work. No emails, deleted-task IDs or private receipts are exposed by this preview.

DELETE on the member path requires strict JSON policy/recipient/handover/confirmation/preview fields, trusted Origin, CSRF, If-Match and Idempotency-Key. Recompute impact and authorization inside a snapshot transaction with existing account/member/wedding locks. Preserve both workspace guards. Atomically update assignments, rule templates/managers, membership status, task/member audit and a dedicated 24-hour removal receipt. Task versions change and recurring customized flags prevent stale drawer edits from overwriting reassignment. Retain all original task creators, statuses, due dates and source/checklist identities. A bounded transaction handles up to 1,000 unfinished tasks and 200 affected active rules; larger previews block confirmation with an instruction to reduce the affected work first rather than partly removing access.

Current eligible Admin authorization precedes receipt replay. A matching receipt returns the original saved result without repeating changes, even if the removed person has since rejoined. It never removes their new access. Removed/self-removed actors cannot use a receipt to regain wedding access; ordinary authentication remains valid and current session lookup returns no wedding. A conflicting key/body fails. Expired/stale first attempts require a new reviewed preview. New membership/assignment/worker writes share the same revisions and version locks, rejecting stale previews rather than silently changing the confirmed work.

React keeps choices/keys only in memory through recoverable errors, locks dismissal while pending, uses the centered discard popup and restores focus to the team heading after success. Confirmed membership loss blocks the workspace; temporary session failures preserve drafts. Existing session rechecks/channel update current permissions. No new credential, provider, email dispatch, state dependency, removed-member directory or automatic restoration is introduced.

## Verification

Native tests protect strict choice semantics, shared-assignee preservation, no-default policy, authorization/CSRF/origin/header forwarding and purpose-scoped signatures. Isolated Atlas tests cover all roles/tenants, overdue inclusion/completed/deleted/retired preservation, recurring assignment/manager handover and worker races, last-Admin races with role edits/removal, rollback/audit, exact retries after rejoin, removed-actor denial, current sessions/assignee reads and invitation rejoin. Browser-check actual production UI, focus, pending/discard/error/retry/stale states and desktop/mobile layouts. Record actual results and gaps in PROJECT_STATUS.md; do not infer independent acceptance.
