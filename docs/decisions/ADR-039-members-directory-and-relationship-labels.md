# ADR-039: Members directory, email visibility and relationship labels

Date: 28 October 2026

Git handoff update, 29 October: the owner reported no findings from the latest checks and authorized committing/pushing the accumulated Members Steps 1–2 checkpoint to DEV. This supersedes earlier no-Git authorization notes for that checkpoint only; deployment and later member-management mutations remain deferred.

Status: Owner authorized Members Step 1 after approving the directory, count, privacy and relationship rules. Invitations, role changes and removal remain later increments. No Git action or deployment is authorized.

## Approved scope

Replace `/members`' current-user preview with the real current wedding directory, following `make_my_marriage_members_collaborator_invitations_refined/code.html` under ADR-021. Preserve the existing shared shell, logo, plum palette, Playfair page heading, Inter table/section text and horizontally scrollable table on phones. All current roles may browse; only Admins see the disabled management/export/invitation previews. Family Members and Viewers cannot manage membership. Show loading, empty-role, unavailable/Retry and bounded pagination, without demo people, invitation totals or claims that unbuilt last-Admin management is active. Existing layout and page-level SSR/RSC guards stay intact.

Show real names/initials, You, role, relationship tag when present, active status and open-task counts. Add the approved Viewer filter alongside All/Admins/Family, with genuine counts over all eligible active members of this wedding. Eligible means ACTIVE membership and an ACTIVE, verified account. Sort by current display name and user ID, never by a private email. Deleted weddings, removed memberships and unavailable accounts do not authorize reads or appear in the active directory.

## API, counts and privacy

GET `/api/v1/weddings/:weddingId/members` accepts strict optional role (ADMIN/FAMILY_MEMBER/VIEWER), positive page and limit (default 20, maximum 100). Unknown/injected/duplicate query fields fail validation. Clamp emptied/out-of-range pages. Re-read the viewer's active verified account, current membership role and non-deleted wedding in the same read-only snapshot transaction as the directory/counts. Return bounded rows, global role counts and filtered pagination. Reads create no records and trigger no recurring generation or email/provider calls.

Open tasks are assigned TODO or IN_PROGRESS, including overdue, with no deadline restriction. Exclude deleted and recurrence-retired copies. Count existing generated occurrences only; do not invent future occurrences or count the pattern itself. A shared task counts once per distinct assigned member. Use one aggregate constrained to wedding ID and only visible-page user IDs, not a task query for each member. No saved counter can drift from task state.

The owner explicitly restricts member emails to current Admins or that account owner. Omit unauthorized email fields in the server projection and DTO, not merely CSS. Return only directory fields; no password/session data, finance permissions, removed-user details or invitation records. Do not reuse the task-assignee picker to disclose emails or replace its existing bounded contract.

## Required relationship, creator exception

The owner requires a wedding-membership Relationship label for everyone added after original wedding creation, including later Admins. The original creator is exempt and needs no new setup field, guessed tag or backfill. Determine that exemption from `Wedding.createdBy`, not current role or a client flag. Relationship describes the person (Bride's father, Groom's brother, Friend, Planner); it confers no access. Render it beneath the name with the existing permission role separate.

Step 1 adds a trimmed, bounded (80-character) relationship storage/display field, but no membership mutation endpoint. Keep the storage field nullable for old rows/test fixtures; a non-creator legacy row without it displays Relationship not set, never an invented relationship. Future invitation acceptance/membership writes must require a non-empty relationship for non-creators and Admin updates may not clear that requirement. Implement that write validation with those endpoints rather than cross-document Mongoose hooks. Do not relax auth, rewrite old memberships or add relationship data to global user roles.

## Verification and next increment

Native tests protect strict reads, server DTO email exclusion, the creator exception and HTTP session/origin/no-write boundaries. A uniquely owned disposable Atlas suite verifies actual scoped counts, shared/duplicate-assignee deduplication, status/deletion/retirement exclusions, privacy for every role, role-filter counts, pagination, current authorization and no read mutations. Browser-check the actual production UI with disposable fixtures: creator alone, multiple roles, relationship and long names/email wrapping, filters/empty/pagination, unavailable/Retry, visible loading and desktop/phone navigation. Record actual checks and cleanup in PROJECT_STATUS.md. No need to repeat Gmail/R2/Places or unrelated full cloud regressions for a directory read.

Next: discuss and implement the complete email invitation/explicit acceptance increment; then role/removal management including the owner's explicit task/future-repeat reassignment choice. The creator exception, privacy policy and one-active-wedding rule remain in force. Independent review/manual testing follows the agreed batched cadence.
