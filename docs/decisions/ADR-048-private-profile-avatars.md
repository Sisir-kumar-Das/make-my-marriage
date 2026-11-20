# ADR-048 — Private profile avatars

- Date: 10 November 2026
- Status: Owner approved and implemented. Independent review and owner acceptance pending.
- References: V1 API Design §10.1 and media catalog, Database Design user and media records, ADR-020, ADR-047 and corrected Stitch My Profile.

## Decision

- My Profile uses the Stitch avatar and photo monogram section. The owner approved JPG, PNG and WebP up to 10,000,000 bytes and a circular drag, arrow-key and zoom preview. Use photo confirms the frame. Avatar changes save separately from name and phone. Removing the photo restores initials. The profile section shows actual progress and errors in context.
- The account owner can upload, replace or remove their own avatar. The current wedding team can see it in Members. Workspace header, account menu and sidebar use the owner’s avatar. Reads require a verified session and a current active shared wedding for viewers other than the owner. Only the currently attached avatar receives a short-lived signed read URL for the processed display image.
- Express reuses private R2 storage with the existing dev/prod separation and a distinct avatars prefix. The avatar purpose, owner and generated keys are checked through upload, completion, attach and read. Uploads have a 40-megapixel decoding limit. The server preserves the private original and makes a metadata-free WebP display image with a maximum 960 px edge. The same stored frame drives all displays.
- The account stores the avatar media reference, frame and its own revision. Express binds attachment/removal to the verified account and revision, and changes the account reference and attachment state transactionally. Exact retries can recover the current state after a lost response. Replacement and removal queue the old media for the existing bounded cleanup worker. Profile-photo saves share the existing profile-change notification to refresh other open tabs.

## Review follow-up

When the display image fails to load, request one fresh signed URL through the same authorized endpoint. A successful load restores the retry allowance. Repeated failures fall back to initials. Initials use the first grapheme of each word, and the zoom input has a 44 px mobile touch area. The optional `scripts/avatar-db.test.mjs` regression requires `MONGODB_AVATAR_TEST_URI` for an isolated loopback replica set. It forces the final write in a replacement to fail and verifies rollback before retrying.

The owner approved a 40 px workspace header avatar starting at the existing 1024 px desktop breakpoint. The compact Members avatars retain the approved density.
