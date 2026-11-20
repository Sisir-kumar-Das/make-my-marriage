# ADR-030: Multiple task assignees and My Tasks

Date: 25 October 2026

Status: Owner authorized Tasks Step 2 while reviewing Steps 1 and 2 together. Actual verification belongs in PROJECT_STATUS.md.

Step 3 follow-up: [ADR-031](ADR-031-task-search-and-filters.md) extends the initial pagination-only task lists with filters and URL pagination; the member picker remains pagination-only.

Step 4 follow-up: [ADR-032](ADR-032-task-recurrence.md) now implements recurrence and its filter/editing/generation rules; earlier recurrence Coming soon statements below describe their original increment.

## Scope

Extend ADR-029's basic Tasks planner with multiple assignees, removal/reassignment, current names in table/details and a working My Tasks view. Keep invitations/role administration, broader filters, recurrence, task deletion/recovery and dashboard/ceremony task integrations at their scheduled later increments. Existing Step 1 changes remain in place. No new dependency, credential, commit, push or deployment is needed or authorized.

The refined Stitch Tasks drawer is the visual source: plum selected-member chips with individual remove buttons and Add Member; the All Tasks/My Tasks tabs and assignee table column become functional. Use an expandable, labeled checkbox picker with member roles, loading/error/Retry, refresh and bounded Load more, with clear focus and responsive wrapping. Add Member selects existing collaborators; it does not send an invitation. Preserve empty/unassigned tasks and all save/dirty/pending/conflict behavior from Step 1.

## API and integrity

- Accept `assigneeIds` in POST/PATCH. Store only user IDs, never copied profile names/emails. Normalize duplicate IDs and sort before hashing a retry request. Bound raw input to 100 IDs and deduplicated assignments to 50; an empty array explicitly unassigns everyone. Omitted PATCH fields retain current assignments. Reject invalid/nonexistent/foreign/inactive membership and disabled/unverified accounts. Any active role, including Viewer, may receive an assignment; assignment never grants editing rights.
- Current verified Admin/Family Member may change assignments, and Viewer remains read-only even on an assigned task. Every read/write still authorizes the requesting account and wedding. Use the existing version, CSRF, retry, audit and transaction protections. Reassignment is TASK_UPDATED in the existing immutable history; notification delivery and the live Activity UI remain deferred.
- During a write, validate and lock each selected current membership/account in deterministic user-ID order, in addition to existing actor/wedding locks. Concurrent removal/disable that reaches those documents forces a transaction retry and fresh validation. Matching committed retries return the current authorized task without reapplying old assignments.
- GET `/weddings/:weddingId/tasks/assignees?page=1&limit=50` is a minimal current-member picker read, not member-management functionality. Return only user ID, display name, role and availability for active verified accounts/members of this wedding, with bounded stable name/ID pagination. Do not expose email, financial permissions, other weddings or account details. Register this and `/my` before the task-ID route.
- GET `/weddings/:weddingId/tasks/my` derives the assignee from the authenticated actor; it accepts only bounded page/limit, never a caller-supplied user ID. Apply wedding/deletion/assignee constraints before counting and pagination. Summary cards reflect the selected view; All/My tab totals are computed in the same snapshot. Keep the scoped assignee index from the approved database design.

## Membership changes and UX

Names are resolved from current eligible accounts on each read. A rejected save identifies unavailable selections by echoing only those submitted IDs, without revealing account existence or profile details, so the editor can mark the affected chips while keeping the draft. A retained assignment whose member/account became unavailable displays a neutral Unavailable member chip without its old name/profile. The task remains readable. Saving requires explicitly removing or replacing unavailable IDs; explain this rather than silently dropping selections or preventing access to the task. Fresh assignments cannot use an unavailable member. Future member removal must implement the baseline's transactional unassign/reassign workflow for affected tasks; this increment does not build a member-removal endpoint or silently mutate assignments during reads.

`/tasks?view=my` preserves the selected tab across reload and Back/Forward. Task-page pagination is bounded and resets for a changed view; general filter/URL pagination work remains the next increment. On an edit that removes the current assignee, refresh My Tasks without that row while leaving saved details available. A new task created from My Tasks without assigning the current user opens All Tasks so the result is visible, with the usual View created task notice. Preserve current assignee chips/drafts when member loading or a save fails. No local persistent draft copy is added.

Original approved documents are preserved. This ADR extends ADR-029's intentionally unassigned Step 1 contract; its other task/date/security rules remain unchanged. The owner will check Steps 1 and 2 together, with independent reviews still following the agreed batching cadence.
