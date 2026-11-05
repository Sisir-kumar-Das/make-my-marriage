# ADR-044: Stitch 4:3 cover frame and full-height dashboard banner

- Status: Accepted (owner decision, 2 November 2026)
- Supersedes: the 2:1 frame sentence in ADR-020 and the "non-destructive 2:1 framing" wording in ADR-021. Everything else in both ADRs stands.

## Context

ADR-020 fixed the setup preview, cover editor and dashboard cover to one 2:1 frame so saved drag/zoom framing looked the same everywhere. A side-by-side check against the corrected Stitch export showed two mismatches: the Stitch dashboard banner places the photo flush to the card's right edge, filling the full banner height (details 8 columns, photo 4 columns, with a soft fade into the details), and the Stitch setup review uses 4:3 cover cards. The owner chose a full Stitch match (Option B) under the strict Stitch design rule.

## Decision

- The shared cover frame used by setup, setup review, the Settings cover preview and the dashboard Change cover editor is **4:3**, matching the Stitch setup review cards. Framing stays non-destructive: the original file is kept and only `x`, `y` and `zoom` presentation values are saved.
- On the dashboard at 1024px and wider, the photo sits in the right third of the banner, flush to the edges with no inset or rounding, fills the banner height (at least 13.75rem) and fades into the details from the left, as in Stitch. Saved framing is applied with the same object position and zoom; the visible box is close to 4:3 at common desktop widths.
- Below 1024px the photo keeps ADR-021's placement above the wedding details, as a full-width 4:3 box (height capped at 22rem) with a bottom fade.
- The signature artwork remains the fallback, and the cover labels/Change cover button stay above the fade and clickable.

## Consequences

- Existing saved framings were chosen in a 2:1 box, so they now show more of the photo's height. Admins may want to re-adjust their cover once; no data migration is needed.
- No API, storage or upload limit changes.

## Revision — owner decision, 3 November 2026 (supersedes the 4:3 and fade points above)

After seeing the 4:3 banner and the agent reviews, the owner chose a cover-like look and accepted a deliberate departure from Stitch here:

- The shared cover frame (setup, review, Settings preview and the Change cover editor) returns to **2:1**, so a normal 4:3 phone photo can be moved vertically at 100% zoom. A slider that has nothing to move is disabled with a hint ("Zoom in to move sideways / up or down") instead of looking broken. The editor preview is about half the available width (at least 32rem, never wider than its container) so it reads as a cover.
- Dashboard banner at 1024px and wider: details and a **wider** photo (about 45% of the banner, `1.2fr / 1fr`). The photo is flush and always fills the full banner height. Its box is at least 2:1 and becomes taller only when the details column is taller, so the editor framing matches on wide screens and differs slightly on narrower laptops.
- **No fade** over the photo, and **no "Your wedding cover"/"Signature cover" label** on the dashboard banner (the Settings preview keeps its label). Change cover stays for Admins.
- Below 1024px the photo stacks **below** the wedding details, as in Stitch, superseding ADR-021's "mobile stacks above" placement.

## Revision 2 — owner decision, 4 November 2026 (dashboard cover controls)

The white "Change cover" pill over the photo looked heavy. Stitch has no cover control on the dashboard, so the owner approved a profile-photo style instead (recorded in `docs/STITCH_DEPARTURES.md`):

- Hovering the dashboard cover dims it slightly and shows a small round icon in the top-right corner; on touch screens (no hover) the icon is always shown. Clicking the photo or the icon opens a small menu.
- **View photo** opens the full, uncropped original in a dark viewer with a Close button (Esc also closes; focus returns to the icon). It is offered to every member (Admin, Family Member, Viewer), only when a custom photo is saved and loaded. The signature artwork has no View photo.
- **Change cover** opens the existing editor and is offered to Admins only; the server still refuses cover changes from other roles. Admins see a camera icon; other members see an expand icon. Members who can do neither (non-Admins on the signature artwork) see no control.
- The Settings cover preview is unchanged (read-only, keeps its label).

Follow-ups approved the same day after ManualTester's retest:

- "Cover saved" / "Signature cover restored" use the Stitch toast (bottom-right card with a plum check) for 2 seconds, bottom-centre on phones, instead of inline text under the banner (which made the card taller than the photo). The "Current cover loaded…" conflict note now shows inside the editor. Errors with Retry stay inline.
- Clicking the dark area around the picture closes the photo viewer; clicking the picture itself does not.
- Change cover scrolls the editor into view and moves focus to its heading (on phones the editor is below the fold).
