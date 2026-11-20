# ADR-049 — Wedding Settings, editable details

Date: 11 November 2026

Status: Owner-approved implementation; independent review and owner acceptance pending.

## Decision and scope

Sisir approved the first Wedding Settings increment after discussion. Current verified, active wedding Admins may edit the workspace title, bride and groom names, city, state, tradition and optional estimated INR budget. Other current members may view the permitted details. The title is independent of the couple's names. An explicit **Generate from names** action uses the existing setup suggestion; name edits never replace a custom title automatically. **Discard Changes** restores the last confirmed values.

Clearing the budget removes the optional value and displays **Not specified**. Admins may read it, Family Members may read it only with current `financeAccess`, and Viewers never receive it. Money remains exact integer paise in BSON Int64 with a safe-integer API boundary. The form converts decimal strings using BigInt, including the maximum accepted amount.

This increment does not edit the wedding date. An existing wedding with a past date remains editable. Country stays India and schedules use Asia/Kolkata. Tradition changes alter metadata only and never rewrite tasks, recurring rules or generated checklists. Wedding date management is the next discussion, followed by the remaining Settings cover/overview increment and Wedding Recovery; implementation of those increments needs separate owner approval.

## Express boundary and atomic saves

`PATCH /api/v1/weddings/:weddingId` uses the existing session, trusted Origin, JSON and signed CSRF protections. Express accepts a strict partial object containing only the approved fields. `location`, when present, contains city and state; country and timezone are excluded. No client role or identity is trusted.

The request requires the wedding's quoted numeric ETag in `If-Match` and an `Idempotency-Key`. A transaction locks the current active verified account and current active Admin membership. It rechecks that the wedding is available, then checks an actor/wedding/key-scoped receipt before comparing the initial version. Concurrent edits use the wedding version and cannot silently overwrite one another. Account/membership locks serialize removal or demotion with a settings save and receipt replay.

The settings update, version increment, audit and 24-hour receipt commit together. `weddingSettingsRequests` stores hashes of the key and normalized request plus original version, with a unique wedding/actor/key index and expiry index. It stores no budget snapshot or plaintext key. A retry with a different payload/version conflicts. Exact authorized replay performs no second wedding mutation or audit, returning the current permitted wedding DTO with `replayed: true` so a later Admin's edit is never replaced by an old receipt snapshot. Expired receipts are not replayable. Replays never bypass current account, membership or Admin checks.

The immutable audit action is `WEDDING_UPDATED`, marked `feedHidden`. It records actor, wedding and time without budget values or private contact data. Extending the public activity categories is outside this increment.

### Review follow-up, 11 November

Owner-authorized fixes separate the membership lock from its business version: increment the private `settingsLockVersion` field with timestamps disabled, retaining a real transaction write conflict with concurrent permission changes. Settings operations and authorized replay no longer change the membership's `__v` or invalidate otherwise current role/removal previews. A database check uses an actual signed role preview before saving Settings, then successfully demotes the saving Admin with that original preview; subsequent Settings receipt replay is refused.

If the normalized requested values already match, save an `unchanged` receipt without a wedding version increment or audit. Authorization and version checks still precede that decision. An exact replay returns current permitted settings and does not reapply old values. Actual changes still atomically write wedding/version/audit/receipt.

Profile, setup and Settings share the dependency-free `lib/visible-text.js` helper. It rejects hidden formatting and bidi controls while preserving the existing script-specific joiners and emoji policy. This ordinary shared utility is not an API import in web code or a new package. Field-specific length limits remain unchanged. Server validation messages are readable and do not echo private input.

## Browser behavior

The existing Express API client remains the only data transport. Both SSR/RSC workspace guards stay in place. Settings drafts live in React memory, preserved during recoverable background session errors. Confirmed logout, account/wedding change or role/finance-access change replaces the scoped form. Late callbacks are rejected on unmount. Saved wedding data is applied only to the matching current Admin/account/wedding context, followed by session revalidation and a cross-tab `wedding-changed` notification.

An uncertain save keeps its original body, version and key. Fields and Discard are locked until **Retry unchanged save** resolves the operation. A recognized terminal rejection releases that attempt. A version conflict keeps the draft and offers an explicit **Discard draft and load latest** action. A failed reload retains the draft and access-denial lock. Refreshing or closing the tab loses an unsaved draft; browser storage and server-side drafts are not introduced.

Conflict and access-denial locks are independent of the last displayed error. A failed latest-settings GET, including a second network failure after a denial, cannot unlock editing or hide recovery. Only an authorized matching Admin GET clears them. A confirmed denial hides the budget while identity/permissions are rechecked. Scope-local feedback survives a permission-driven form remount, explains the read-only state and scrolls into view. It resets on account/wedding change and clears on an authorized recovery or save. Uncertain request bodies, keys and versions remain unchanged.

## Visual reference

Use ADR-021's corrected Settings/Profile/Recovery HTML, `tab-wedding-settings`, Wedding Details section. Match the 8/4 desktop split, 2-column identity fields from 768 px, 3-column city/state/country row from 640 px, full-width timezone and budget panels, title celebration icon, form subtitle, settings icon and right-aligned Discard/Save controls. Smaller screens stack fields and columns; tabs scroll horizontally within their own strip.

The approved additions are explicit name generation, real permission/read-only states, exact optional-budget entry, save feedback, validation and retry/conflict states. Show current Admin/Family Member/Viewer labels rather than the reference's Lead Host wording. Preserve the current right-side cover and Coming soon overview until their agreed increment. Existing cover policy remains JPG/PNG up to 15 MB. See STITCH_DEPARTURES entry 18.

The review follow-up restores a same-row budget badge at narrow widths and formatted `₹`/Indian-grouped `INR` values, without rounding paise. Settings accepts valid Indian or thousands comma grouping, optional currency notation, `.5` and `5.`; invalid grouping, negative/scientific notation and values above the safe-integer boundary are rejected. Valid input is formatted on blur and after save. Clearing still removes the optional budget. The truthful timezone copy remains “Wedding schedules and deadlines use India time.” Country/timezone are fixed; the reference's automatic-city inference and future guest/vendor alerts are not implemented claims.

The second review found commas in the decimal part were being removed. Validate that part before normalization and strip commas only from the validated integer portion. Reject extra decimal points. Nested API errors map through an allowlist to the actual City/State/Budget controls, with visible and accessible field messages. For long amounts on phones, use a compact 13 px input font and 8 px horizontal padding within the existing input, so the maximum valid amount fits at 320 px without altering its value or introducing another control. These are owner-authorized review corrections, recorded in STITCH_DEPARTURES entry 18.

## Deployment packaging checkpoint

The source repository uses an ordinary root `lib/visible-text.js` utility. An API release artifact must include that file at the same relative root alongside `apps/api/src/`, or bundle it through the approved deployment build. Copying only the `apps/api` directory is insufficient. Before deployment, inspect the real artifact and run an import/startup smoke check in a clean Node.js 24 runtime with production dependencies. No deployment configuration currently proves this, and a local web build does not close that checkpoint. This records a prerequisite; it does not authorize deployment or a hosting change.

## Verification and limits

See PROJECT_STATUS and AGENT_HANDOFF for attributed test results, isolated fixtures, cleanup and independent review status. Those records distinguish implementation checks from owner acceptance. No Git handoff or deployment is authorized by this ADR.
