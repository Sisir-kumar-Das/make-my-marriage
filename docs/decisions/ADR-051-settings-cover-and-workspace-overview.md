# ADR-051: Settings cover controls and workspace overview

Date: 13 November 2026

Status: Accepted for implementation by Sisir; verification and owner acceptance are recorded separately in PROJECT_STATUS.md.

## Scope and design

Complete Wedding Settings Step 3 after ADR-049/050: connect the corrected Settings reference's right-hand Cover Presentation and Workspace Overview cards. Keep the existing desktop 8/4 split and stacked mobile order, row icons, labels and real figures. The applicable source is `make_my_marriage_settings_profile_7_day_recovery_refined/code.html` under the ignored Stitch export. Existing approved departures remain: the private 2:1 cover/label, JPG/PNG up to 15 MB, current role names, and no guest-facing functionality or claims. The owner approved loading placeholders, retained figures with Retry after transient errors, restricted invitation copy and the count definitions below.

Admin Change Cover and Remove Cover use the existing private uploader and Express cover endpoints, with the existing preview/drag/zoom and version checks. Cover operations save independently from wedding-details Save/Discard. Retain unsaved metadata and its original version so concurrent/independent saves never silently overwrite newer changes. Clean forms can adopt current confirmed context. Failed cover operations preserve the original photo, expose errors/reload recovery, and cannot run duplicate pending saves. Apply successful cover context through the existing wedding-change channel; ignore unmounted/account/wedding/role-stale callbacks. Family Members and Viewers see the saved cover without mutation controls. Preserve the existing neutral loading/error state for a saved custom cover rather than flashing signature artwork.

## Real figures and privacy

Add authenticated `GET /api/v1/weddings/:weddingId/overview`, a count-only Settings read. Express rechecks active verified account, current active eligible membership and non-deleted wedding in the same snapshot as the counts. It returns no member rows/contact details, invitation recipients/tokens, task content, audit history or budget.

- **Collaborators:** current ACTIVE Admin/Family Member/Viewer memberships whose accounts are active and verified, including the caller. Pending invitees, removed/disabled/unverified accounts are excluded, matching the directory.
- **Pending Invites:** current PENDING invitations with expiry strictly after the captured request time, matching existing Admin invitation totals. Only current Admins receive this field; skip its query entirely for other roles. Family Member/Viewer keep the row with **Admin only**, as explicitly approved.
- **Scheduled Ceremonies:** non-deleted PLANNED/CONFIRMED events ending at or after the request instant. Include ongoing events; exclude past unfinished, COMPLETED, CANCELLED and deleted events. This is intentionally narrower than Dashboard's total ceremony count.
- **Tasks Progress:** all non-deleted/non-retired wedding tasks, using the existing task-query scope; completed / total rounded to whole percent, with zero tasks = 0%. No assignment-based restriction is introduced.
- **Days to Mandap:** derive from the current saved wedding date and India calendar day. Show days remaining, Today, or days since; no negative countdown. Recompute on focus and the existing periodic refresh.

Read counts with database count/aggregate operations; never load growing histories or full directories to count in JavaScript. No new persisted schema/counter or background worker is needed.

## Client lifetime and recovery

Key the overview by account/wedding/current role. Abort stale requests on teardown and reject mismatched-role responses. Before first success show Loading, never a fabricated zero. Keep last successful figures through temporary network/5xx failures and while Retry runs. Clear privileged/loaded figures after confirmed authorization loss and request session revalidation. A denied read never authorizes access from cached data. Refresh on visible-page timer/focus with the existing 30-second throttle, page restoration and applicable wedding/member/task change signals; no live-stream promise is added. Cover saves do not reset the separate details draft.

## Boundaries and verification

Keep both SSR/RSC workspace guards, current session checks and API-client transport. No credential/provider/storage policy change, owner-server restart, deployment, commit or push is authorized by the implementation request. Wedding deletion/seven-day recovery is the next separate feature. Test real isolated count/permission boundaries, private-field omission, zero/retired/deleted/date cases, refresh failures/retries, pending locks, independent saves and desktop/mobile reference alignment. Existing media lifecycle tests cover storage behavior; stubbed storage is not proof of new real R2 delivery.

## Review follow-up — 14 November

Sisir supplied the independent Code Reviewer and Manual RUN 33 results and authorized correcting the reported focus paths and conflict wording. Escape remains unchanged for the inline cover editor; overview Retry remains disabled while session revalidation is required. These accepted behaviors are not pending defects.

### Remaining focus cases — 15 November

Sisir approved fixing the two remaining cases reproduced by Codex's independent desktop/390/320 recheck. A failed current-cover reload now has its own error-focus intent: focus the visible error while retaining the conflict lock and enabled Reload action. Do not clear the conflict merely to change focus.

Before a recoverable session error makes preserved content inert, SessionProvider remembers whether that content currently holds focus. After the alert mounts, transfer displaced focus to the existing external session alert only if focus is still in the preserved content or has fallen to the document body. Do not steal focus from a separate control, repeat the transfer on unrelated renders, remove inert protection or change session checks, expiry, drafts or save/retry semantics. This also covers an outage arriving after an earlier inline result has already received focus. Verification and owner acceptance remain separately recorded in PROJECT_STATUS and AGENT_HANDOFF.

Cover completion now queues a focus intent and resolves it in an effect after React commits the result and re-enables the controls/fieldset, rather than scheduling focus from the request callback. Successful save/removal targets Change Cover; a conflict targets Reload current cover; other failures target the existing focusable error; reload targets its mounted status/error. Skip disconnected, disabled (including fieldset-disabled) and inert descendants. When preserved content is inert, use the existing external session connection alert. Consume each intent once, without refocusing on later background renders or applying unmounted callbacks.

Plain metadata saves use the existing mounted-result focus mechanism as well as date-dialog recovery: success targets saved feedback, conflict/denial targets enabled recovery, uncertain writes target unchanged Retry, and other API failures target the error. Existing dialog focus/locks, drafts, receipt bodies/keys/versions and data writes remain unchanged. An explicit overview Retry focuses its heading on success or its error after failure; background reads never request this focus.

Cover version conflicts now say **Wedding details or the cover changed. Reload the current cover before saving again.** Details and cover share the wedding version, so neither another tab nor a changed photo is presumed. No authorization, database, upload or overview-count rule changes. Record attributed checks and owner acceptance separately.
