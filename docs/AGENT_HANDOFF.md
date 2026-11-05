# Shared Codex / Claude Code handoff

Last updated: 3 November 2026 (Asia/Kolkata)  
Updated by: Claude Code — Dashboard review fixes

Both Codex and Claude Code work in this repository. Use this file to see who is handling the current increment, what changed and what the next assistant should check. [PROJECT_STATUS.md](PROJECT_STATUS.md) remains the milestone, feature-order and verification record. Approved requirements and ADRs remain authoritative; this file does not grant implementation, testing, Git or deployment approval.

## Current ownership

| Participant   | Current responsibility                                             | Next action                                                                                                         |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Sisir         | Product/design decisions and acceptance                            | Review findings before approving any fixes.                                                                         |
| Claude Code   | Dashboard Steps 1–2 and latest UI implementation                   | Preserve the current implementation for the requested review checkpoint. New changes still require owner approval.  |
| Codex         | Coordinate the two existing agents at the owner's explicit request | Review requests sent; do not run tests or implement fixes personally. Results pending.                              |
| Code Reviewer | Independent current-diff review                                    | Check summary correctness, authorization, retry/privacy and design contracts; report findings without code changes. |
| Manual Tester | Independent isolated production/browser checks                     | Check functional flows and Stitch desktop/mobile alignment; preserve owner servers/data and retain tagged fixtures. |

## Feature map

Keep these IDs stable so notes from either assistant refer to the same increment.

| ID      | Feature / increment                                              | Current state                                                                                                                             | Evidence / main status                                                                                    |
| ------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| INV-043 | Recipient inbox and shared Accept/Reject, including later polish | Committed in `b2bd171` on DEV, 1 November. Owner acceptance remains pending.                                                              | ADR-043; PROJECT_STATUS invitation follow-up/polish entries. Built across Codex and Claude Code sessions. |
| DASH-01 | Live progress, task counts, schedule status and My Tasks         | Implemented by Claude Code; uncommitted. Independent review requested 2 November, including the later approved UI corrections.            | PROJECT_STATUS → Remaining V1 development, item 6, Step 1.                                                |
| DASH-02 | Upcoming ceremonies, past milestone and Attention Required       | Implemented by Claude Code; uncommitted. Latest 2 November alignment/cover changes are included in the requested review. Results pending. | PROJECT_STATUS → Remaining V1 development, item 6, Step 2 and alignment correction.                       |
| DASH-03 | Recent Activity and full activity view                           | Planned; no delivered implementation recorded. Discuss/confirm the next scope and missing Stitch states before building.                  | PROJECT_STATUS → Remaining V1 development, item 6, Step 3.                                                |

Current Git baseline: `DEV`, latest local commit `b2bd171`. Recheck Git at every handoff; this is not a live lock or a fresh remote synchronization check. Preserve existing uncommitted work, including untracked Dashboard source and tests.

## Current implementation boundaries

- Dashboard backend changes: task-summary route/service and `apps/api/src/tasks/summary.js`.
- Dashboard frontend changes: `dashboard.jsx`, `task-summary.jsx`, `dashboard-data.js`, shared workspace components/styles under `apps/web/src/features/dashboard/`.
- Checks added by Claude Code: `scripts/dashboard.test.mjs`, `scripts/dashboard-db.test.mjs` and root npm test commands.
- Latest owner-approved 2 November scope: Family Tasks card, Coordinator Actions, metric/schedule presentation, ceremony/attention styling, sidebar active-member badge, removal of the scaffold Connection status panel, and shared 4:3 cover/dashboard banner under ADR-044. Cover, shell and reference-document changes are part of the review.
- Workflow/status changes: root AGENTS.md and PROJECT_STATUS.md. Local `.claude/launch.json` is tooling configuration, not a delivered application feature.
- Verification recorded by Claude Code on 1 November: 199 native checks, 7 Dashboard database entries, lint/build/smoke and project formatting. An untracked tooling JSON formatting exception was recorded separately. Codex has read the notes and current files; it has not independently rerun those checks.

## Open Dashboard decisions

Historical questions from Claude Code's 1 November handoff follow. The later owner-approved 2 November corrections in PROJECT_STATUS.md and ADR-044 supersede settled points (including Family Tasks and cover framing). Review the latest approval record and actual implementation before treating any older question as still open; do not infer approval for other departures.

1. Keep **Review** for all Attention links, or use Stitch's differing action labels? Current links open records rather than performing inline actions.
2. Confirm the approaching-ceremony **Coming up** card style, which is absent from the checked Stitch reference.
3. Keep or remove **Showing the 4 most important of N**, which is absent from Stitch.
4. Reconfirm the accepted scope of timing/date/notes additions: **in N days**, full time ranges, India date format and one-line notes.
5. Settle **My Tasks** versus Stitch's **Family Tasks**, the count pill, View all and absence of inline completion checkboxes.

Claude Code recorded desktop 1280/mobile 390 screenshot checks after the 2 November corrections. Independent screenshot comparison is now requested, with results pending. Compare the current build against actual corrected Stitch HTML and approved exceptions at desktop/mobile/breakpoint widths; report remaining differences. Codex has not checked or changed the owner's server state during dispatch.

## Rules for each handoff

1. Read root AGENTS.md, PROJECT_STATUS.md and this file, then inspect the current Git state and relevant approved documents. Never rely on a saved conversation or status note instead of the actual files.
2. Record the feature ID, current implementer and approved scope before taking over. Avoid editing files another assistant is actively changing; agree the transfer with Sisir first.
3. After a meaningful checkpoint, update this operational handoff and the relevant milestone in PROJECT_STATUS.md. Link the milestone instead of duplicating its full history.
4. Attribute evidence: distinguish **performed by this assistant**, **reported by another assistant**, **owner accepted**, **pending** and **not run**. A report or passing build alone is not feature acceptance.
5. Preserve pre-existing work, owner servers and owner accounts. Keep tagged test-data inventories and follow the owner's no-deletion rule. Never put credentials, invitation tokens, private environment values or raw conversation logs in either status file.
6. Written handoffs do not authorize agent-to-agent messages, new code, fixes, commits, pushes or deployment. Follow the current explicit owner approvals and strict Stitch rule in AGENTS.md.

Use this compact entry when transferring an increment:

```text
Date / updated by:
Feature ID / increment:
Implementer / next verifier:
Owner-approved scope:
Delivered changes / files:
Git baseline / committed or uncommitted:
Checks actually run / evidence / checks not run:
Open findings / decisions / exact next action:
Main PROJECT_STATUS milestone or section:
Tagged test-data inventory / owned test resources, if applicable:
```

## Latest handoff

3 November 2026 — Claude Code

- Feature ID / increment: DASH-01, DASH-02 review fixes.
- Implementer / next verifier: Claude Code / Code Reviewer, Manual Tester or Codex when Sisir requests.
- Owner-approved scope: fixes 1–16 from the combined ManualTester/CodeReviewer/Codex review (privacy scoping, Attention row, 2:1 cover revision per ADR-044, refresh limits and count-only badge route, Stitch breakpoints/colours, Completed-only milestone, no notes in My Tasks, Viewer note, days label, undated order, tests). Full detail: PROJECT_STATUS → Remaining V1 development, item 6, "Review findings and fixes (3 November 2026)".
- Files: `apps/api/src/tasks/service.js`, `apps/api/src/members/{service,router}.js`, dashboard files under `apps/web/src/features/dashboard/`, `apps/web/src/components/layout/app-shell.jsx`, `apps/web/src/app/(workspace)/dashboard/page.jsx`, `apps/web/src/features/weddings/{cover-data.js,cover-editor.jsx,cover.module.css,dashboard-cover.jsx}`, ADR-020/021/044, tests `scripts/dashboard*.mjs`, `package.json`.
- Git: DEV at `b2bd171`; all Dashboard work uncommitted.
- Checks run by Claude Code: npm test 202/202, test:dashboard:db 8/8, lint, formatting, build, smoke; browser 1280/1024/768/390 with test account `mmm-test-d72716`. Not run: cover drag/zoom with a real upload after the 2:1 revision; independent re-review.
- Test data: `mmm-test-d72716` (dev database; inventory in PROJECT_STATUS). Owner's 3000/4000 servers left running.
- Follow-up (same day, after ManualTester/CodeReviewer recheck): live-session scope check on the summary cards, start-based 30 s refresh gap (summary and badge), badge keeps last good count on failure, planning row stacked below 1280px. Claude Code ran npm test 203/203, lint, formatting, build, smoke and a 1024px browser check. Open: summary-only Retry untested; ManualTester's lost inventory for older tags (see PROJECT_STATUS).
- 4 November: owner-approved small-issue fixes (kept data + slim refresh note, friendly error text, aria-busy, no old-scope request, badge 15 s/one retry/keep on hiccup/hide on 401-403-404, provider render tests). Claude Code ran npm test 206/206, lint, formatting, build, smoke and a browser check of the note. Owner's 3000/4000 restarted after being found stopped.
- 4 November: ManualTester retest of the small fixes: all checks (a)–(e) passed; findings P2 badge no retry after timeout (by design: one quick retry per hiccup spell, reset on a good count; owner agreed no change), P2 small Retry tap target (fixed: 44 px tap area below 640px, banner height unchanged; Claude Code ran npm test 206/206, prettier and a 375px browser check: 44×44 button, no overflow), P1 note placement above Planning Completion (owner kept), P1 rare stale-header race (server refuses, no change). CodeReviewer re-review requested, report pending.

2 November 2026 — Sisir explicitly requested both existing agents to test now, renewing coordination authorization for this checkpoint. Codex sent separate independent requests to Code Reviewer and Manual Tester for current staged/unstaged/untracked Dashboard work since `b2bd171`, including ADR-044, cover/shell changes and approved Stitch corrections. Recent Activity remains planned. No functional changes/fixes, commits, pushes, provider mail or deployment are authorized. Each agent must avoid the owner's 3000/4000 servers/account, preserve source/private environments, use isolated execution, keep a unique tagged inventory and retain persistent fixtures until owner cleanup approval. Reports are pending; dispatch is not a passing review or owner acceptance. Codex performs coordination only, as requested.

2 November 2026 — Codex: created the shared handoff and entry-point rules at Sisir's request. Claude Code continues the current feature; Codex verification will begin only when Sisir requests it. No application code, tests, configuration, test data or server state was changed; no agents were contacted and no commit/push was performed.

- 4 November: owner-approved dashboard cover controls (ADR-044 revision 2, `docs/STITCH_DEPARTURES.md` #7, new register of all owner-approved Stitch departures, linked from AGENTS.md). `dashboard-cover.jsx`: the white Change cover pill is replaced by a hover corner icon (always visible on touch screens) and a click-the-photo menu; View photo (full uncropped viewer, Esc/Close, focus back to the icon) for all members when a custom photo is loaded; Change cover for Admins only; no View photo on the signature artwork. Claude Code ran npm test 206/206, lint, prettier (only the untracked `.claude/launch.json` is unformatted), build and smoke, and browser-checked it as Admin at 1440/1280 and 375 (menu, viewer showing the whole photo, keyboard Enter/Esc, no horizontal overflow). Non-Admin roles and the real hover dimming were not browser-checked by Claude Code. Test data: uploaded a generated 1600×1200 JPG labelled `mmm-test-d72716` as the cover of Claude Code's own test wedding `6ae8cbc3efe208eaf1825761` (tag `mmm-test-d72716`); not deleted.
- 4 November (later): owner-approved cover follow-ups, implemented by Claude Code, uncommitted. (1) Stitch toast for "Cover saved" / "Signature cover restored", 2 s, bottom-right, bottom-centre below 640px (STITCH_DEPARTURES #8); the inline notice that left a gap under the banner photo is gone, and the conflict "Current cover loaded…" note moved into the editor. (2) Viewer closes on a click outside the visible picture. (3) Change cover scrolls the editor into view and focuses its heading. Claude Code ran npm test 206/206, lint, build and smoke, and browser-checked as Admin: phone Change cover scrolled to the editor (heading focused, 88 px from the top), toast bottom-centre at 375 and bottom-right at 1280, measured 2007 ms on screen, viewer stays open on a picture click and closes on a letterbox click with focus back on the icon. ManualTester regression pass (Chrome only) passed every earlier small fix; P1 note: four cards each show their own Retry on a first-load failure (existing design). Test data: two more generated `mmm-test-d72716` JPGs (portrait and landscape) uploaded as covers of Claude Code's own test wedding; the cover was then removed (signature artwork showing); nothing deleted.
- 5 November: owner-approved fixes for the combined ManualTester + CodeReviewer list (#1–16), implemented by Claude Code, uncommitted.
  - Dashboard data: a 401/403/404 on refresh drops the loaded numbers (`failedResult` + shared `noAccessStatuses`); the note stays during a retry ("Trying again…", disabled "Retrying…"); a first-load failure shows one shared note with one Retry and quiet "Unavailable right now." cards (owner, 5 Nov; STITCH_DEPARTURES #9).
  - Cover: focus moves to the editor heading from the menu's `onCloseAutoFocus` (works when the editor is already open); the viewer keeps the last loaded photo across the 4-minute signed-link refresh (no flicker or Loading flash; `SavedCoverPhoto` keyed by photo, not URL); the viewer closes only when the press starts and ends outside the picture; a click right after the menu was dismissed doesn't reopen it; Cancel resets a conflict; the "Current cover loaded" note scrolls to the centre; focus returns to the cover icon after Save/Remove; hover dimming only on `(hover: hover)`.
  - Toast: an always-present `sr-only` live region carries the text, the visual card is `aria-hidden` and `pointer-events: none`; no unused id.
  - Helpers `coverActions` / `onContainedPicture` in `cover-data.js`; `CoverToast` and `useMemberCount` exported for tests.
  - Tests: provider (no-access drop, retrying, shared first-load state, focus/tick 30 s gating) and new `scripts/dashboard-cover.test.mjs` (role matrix, letterbox clicks, toast timer restart/unmount, badge 15 s / one retry / none on 403), added to `npm test`.
  - Claude Code ran npm test 214/214, lint, prettier, build, smoke, and browser checks with real clicks/keys at 1280 and 375: focus on the heading after Change cover (mouse and keyboard, also with the editor open); Save returns focus to the icon; live region text present; toast pointer-events none; viewer drag stays open, band click closes, page still clickable; second photo click closes the menu; simulated 409 conflict → Cancel → reopen leaves Remove enabled and no Reload button; reload note centred on phone; shared error note with one Retry, then "Loading your planning data again…" and recovery. Not verified by Claude Code: real touch device, screen-reader speech, reduced-motion emulation.
  - Test data: one more generated `mmm-test-d72716` JPG saved as the cover of Claude Code's own test wedding (custom photo now showing). Simulated failures used a patched page fetch only; nothing deleted.
- 5 November (later): owner-approved fixes for the combined ManualTester + CodeReviewer re-review (#1–9), implemented by Claude Code, uncommitted.
  - (1) `SavedCoverPhoto` loads a refreshed signed link in the background (`new window.Image()`) and swaps it in only on success; after the first load `onError` is not attached, so a failed refresh keeps the shown photo and the viewer stays open.
  - (2) The editor heading gets a plum `:focus-visible` ring; the cover icon shows on any `:focus` (also after the scripted focus following Save/Remove).
  - (5) The viewer closes only when the press starts AND ends outside the picture (`viewerPressCloses`, pointerdown/pointerup).
  - (6) The menu guard compares the dismissing press (`onPointerDownOutside` timeStamp) with the photo press (`sameMenuPress`) instead of a 300 ms timer.
  - (7) The toast carries an alternating zero-width marker so identical text is re-announced.
  - (9) No-access answers show "You no longer have access to this wedding." with no Retry and stop background refreshes (`noAccess`, STITCH_DEPARTURES #10, owner-approved wording).
  - (3, 4, 8) `scripts/dashboard-cover.test.mjs` now fails on unlisted imports and renders the real `DashboardCover` with a small recursive renderer: role matrix before and after load, a failed then successful link refresh, failed and successful Save (toast, focus back to the icon, editor closed), and the dismissing-press guard. It also covers the toast restart and repeat, and the badge: a fresh retry after a success and the 30 s focus gap. A provider test covers no-access with stopped refreshes.
  - Claude Code ran npm test 221/221, lint, prettier, build and smoke. Browser checks at 1280: no-access note with no Retry, numbers cleared, no request on later focus; keyboard Change cover shows the 2px plum ring on the heading; the focused icon is visible; reverse drag keeps the viewer open, a band click closes it, and focus returns to the icon. The refresh-failure path is verified by the render test only (the signed-link failure was not reproduced in the browser).
- 5 November (final round): owner-approved fixes for the combined final reviews (ManualTester run 17 passed all 9 earlier fixes; CodeReviewer found #1 half-fixed plus smaller items), implemented by Claude Code, uncommitted.
  - (1) A failed signed-link request keeps the working link (`setLink` keeps `previous.url` for the same wedding/photo); the photo and viewer stay.
  - (3, 6) `SavedCoverPhoto` renders up to two layers keyed by URL: the refreshed link loads in a hidden layer and becomes visible as the same element (downloaded once). A failed hidden layer is dropped; a failure of the visible photo shows the unavailable state with Retry.
  - (2) `noAccessNotes`: 401 "You've been signed out. Please sign in again." + Sign in link (/login), final; 403 unchanged, final; 404 "This wedding is no longer available.", not final, the slow refresh continues (STITCH_DEPARTURES #10, owner wording).
  - (7) The viewer's pointerup uses `document.elementFromPoint` (touch keeps the first target).
  - (8) The toast marker is an alternating trailing full stop.
  - (4) Tests: rendered refresh test (link request failure, image failure, single-layer swap, visible failure); rendered viewer press test incl. touch and the Close button; repeat marker through two real saves; provider 401/404 test. Mutation check: removing fix 1 makes the refresh test fail.
  - Claude Code ran npm test 223/223, lint, prettier, build and smoke. Browser checks at 1280: 401 note with a Sign in link; 404 note then recovery; with the 4-min refresh shortened to 3 s and link requests failing, the banner photo and open viewer stayed through 3 failures; successful refreshes downloaded each new photo once (resource timing) with one layer left. Not verified: real touch, screen-reader speech.
- 5 November (closing round): owner asked to fix every item from the last combined review and to self-review before handing back. Implemented by Claude Code, uncommitted.
  - (1) The viewer recovers from an expired link: on an image error it fetches a fresh link once (also given to the banner, guarded so it never overwrites a newer photo's link), then shows "Couldn't load the full photo." + Retry (STITCH_DEPARTURES #11). An attempt counter ignores late answers after the viewer is reopened.
  - (2) If the shown banner photo breaks while a newer link is loading, the newer one takes over.
  - (3) The 404 note has a Retry button (#10 updated).
  - (5) The toast marker is now a non-breaking space.
  - (6) Reproduced in Claude Code's browser: right after page load, Enter, Down, Down, Enter opened View photo instead of Change cover. Likely cause, confirmed by a render test but not reproduced in the browser: "View photo" was inserted while the menu was open as the photo finished loading. The menu now keeps the items it opened with until it closes. At human speed (and at about 5 ms between keys once loaded) keyboard selection was correct in the browser.
  - Self-review found two more problems, now fixed: the viewer could reopen by itself after the photo recovered (it now stays closed), and the page could show through behind the viewer message (now a solid panel).
  - (4) Test helper: requestAnimationFrame now runs on the next frame, `choose()` follows Radix's order (select → close → onCloseAutoFocus → default focus to trigger), and focus history is recorded. New tests: banner fallback, viewer recovery (renew, failure, Retry, late answer), frozen menu items, viewer stays closed, conflict/Cancel/reload-note scroll, repeat marker exactness, focus never stopping on the icon.
  - Every fix was mutation-checked: each was removed in turn and its test failed (link-request keep, viewer recovery, late-answer guard, banner fallback, editor focus, menu-press guard, viewer drag rule, focus after Save, conflict reset, reload-note scroll, marker, menu freeze, viewer auto-close, no-access stop).
  - Claude Code ran npm test 228/228, lint, prettier, build and smoke. Browser checks: viewer renew → message → Retry while down → Retry when up (1280), message panel and 44 px Retry at 375 with no overflow, 404 Retry → "Retrying…" → recovery, fast keyboard menu selection. Not verified: real touch, screen-reader speech.
- 5 November (polish after the closing-round reviews: ManualTester run 19 all pass; CodeReviewer nothing at P5–P3): implemented by Claude Code, uncommitted.
  - Clicks on the viewer's loading/"couldn't load" panel no longer close the viewer (`data-viewer-message` counts like the picture).
  - Keyboard focus moves to Retry when the full photo can't be loaded.
  - An open cover menu closes if the photo becomes unavailable meanwhile, so no dead "View photo" is offered.
  - A rendered test now clicks the 404 note's Retry (Retrying… disabled, then the note goes).
  - The test renderer gained createContext/useContext; its pointer stub can place an element under the pointer.
  - All four were mutation-checked (the panel test first passed for the wrong reason; fixed so it now fails without the fix).
  - Claude Code ran npm test 230/230, lint, prettier, build and smoke. Browser checks with real clicks: focus on Retry; clicking the message text and the panel keeps the viewer open; a dark-area click closes it, focus returns to the icon and the page stays clickable.
  - Left as accepted notes: the harness's Radix model is an assumption (mutation checks are the stronger evidence); screen readers may read a repeated toast as the same words (a deliberate trade-off); drags and long presses in agent runs were simulated events.
