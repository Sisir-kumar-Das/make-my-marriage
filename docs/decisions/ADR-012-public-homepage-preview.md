# ADR-012: Public homepage with planned feature previews

- Status: accepted for local development
- Date: 17 October 2026
- Scope: public homepage only

## Decision

Render a public product homepage at `/`, replacing the scaffold's root redirect. Keep the existing `/dashboard` sample workspace and other explicit routes available independently. This updates the root-route behavior previously described in the development guide; it does not change the API boundary or implement authentication.

Use the user-selected `make_my_marriage_luxury_wedding_planning_platform_2/code.html` in the locally supplied Stitch export as the homepage reference. Preserve the complete “M” logo and supplied couple artwork. Retain the overall page structure, including future guest/wedding-website, RSVP, finance and accommodation previews. Mark future capabilities “Planned” and disable unavailable actions. Keep sample data clearly identified. Registration/login destinations and role enforcement remain later feature work.

The product homepage uses fixed brand imagery. A couple's future personal wedding website may use the supplied artwork as a default until that couple selects an uploaded photo. This homepage milestone does not implement that future site or any upload behavior.

## Assets and boundaries

The original Stitch export folder and Word documents remain ignored and unchanged. Copy only the logo and couple artwork required by the public page into the web application's public assets. Self-host Inter and Playfair Display with their OFL licenses to avoid runtime or build dependency on Google Fonts. Homepage styles are scoped so existing workspace appearance is preserved.

This milestone adds no authentication, business API, database access, guest functionality, hosting configuration or deployment. Follow the existing V1 implementation sequence after visual acceptance, beginning with email/password authentication.
