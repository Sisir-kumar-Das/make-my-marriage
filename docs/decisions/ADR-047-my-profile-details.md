# ADR-047 — My Profile details

- Date: 9 November 2026
- Status: Owner approved scope. Implemented for local verification.
- References: V1 PRD, API Design §10.1, Database Design §5.1 and the corrected Stitch My Profile HTML.

## Decision

- In the protected workspace, Admins, Family Members and Viewers can edit their own display name and optional Indian mobile number. The login email is read-only. Discard restores the last loaded or saved details. Clearing the number removes it.
- Express exposes account-scoped `GET /users/me` and `PATCH /users/me` using the verified session. The patch accepts only display name and phone, normalizes phone to `+91` plus ten digits, and requires the trusted origin, JSON and CSRF. A version tied to the account prevents stale edits or edits across account switches. Legacy profiles start at version zero. An unchanged retry can recover a lost response if the requested values are already saved.
- Members reads return a phone only to the current wedding Admin or that member. The UI shows it below the email when present, per the owner’s direction. The session response contains no phone. The workspace name display updates after save, and Members reloads current profile details.
- Keep the existing workspace shell and the Stitch identity form structure. Show actual Account Security and Workspace Access with a password-reset link. Profile photo controls remain Coming soon. Profile photo upload, Wedding Settings editing and Wedding Recovery are separate increments.

## Review follow-up

Registration and profile updates share display-name validation in Express. Keep the existing trimmed length limit and reject names with no visible content, direction overrides and other hidden formatting. Contextual script joiners, variation selectors and emoji joiners remain available for rendering written names. Existing stored names are unchanged until edited. Return plain-language field errors. The profile photo heading shows a visible Coming soon badge beside the disabled photo controls at desktop and mobile widths.

The 10 November follow-up restricts zero-width joiners to supported writing contexts. It rejects joiners inside Latin text, including when a foreign virama or a combining accent is inserted to bypass validation. It accepts matching-script Indic conjuncts, Bengali ra plus joiner before virama and ya, and word-final Devanagari half-forms and legacy Malayalam chillu forms. It retains Arabic-script non-joiners and emoji joining in context. See the [Unicode core specification on South and Central Asian scripts](https://unicode.org/versions/Unicode16.0.0/core-spec/chapter-12/) for the Indic shaping examples. This targeted rule covers the reported cases while leaving the existing name-length, phone, authorization and persistence rules intact.
