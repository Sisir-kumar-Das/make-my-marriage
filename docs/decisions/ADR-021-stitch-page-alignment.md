# ADR-021: Stitch page alignment and honest feature previews

Date: 23 October 2026

Status: Accepted by the owner for local implementation

## Owner direction

Before starting Events business functionality, align every existing page with its applicable corrected Stitch HTML: shared logo/header/sidebar, palette, typography, spacing, cards and responsive layout. The earlier workspace shell was provisional and did not follow the supplied refined dashboard. Discuss intentional future visual departures with the owner first. Keep unimplemented features visible, disabled and labelled Coming soon rather than treating a working-looking demo as an implementation.

The private reference root is `stitch_make_my_marriage_landing_page_v1_final/`. Preserve these original files and their ignored status. Corrected HTML takes precedence over stale screenshots and older draft behavior. This decision supersedes provisional workspace styling and the earlier warm workspace/setup palette; it does not change the approved business rules, API ownership or feature implementation order.

## Route and reference mapping

Each reference below is the folder containing `code.html` under the private export root.

| Page                                                                | Visual reference                                                                                                                                                                             |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                 | `make_my_marriage_luxury_wedding_planning_platform_2`                                                                                                                                        |
| `/login`                                                            | `make_my_marriage_sign_in_verification_desktop`, with `make_my_marriage_authentication_states_gallery` for state guidance                                                                    |
| `/register`, `/verify-email`, `/forgot-password`, `/reset-password` | `make_my_marriage_v1_authentication_verification_states`                                                                                                                                     |
| `/wedding-setup` steps 1–2                                          | `make_my_marriage_3_step_wedding_setup_flow`                                                                                                                                                 |
| Setup review/completion                                             | `make_my_marriage_3_step_wedding_setup_review_desktop`                                                                                                                                       |
| Workspace chrome and `/dashboard`                                   | `make_my_marriage_master_wedding_dashboard_refined`                                                                                                                                          |
| `/events`                                                           | `make_my_marriage_events_ceremony_schedule_refined`                                                                                                                                          |
| `/tasks`, `/checklist`                                              | `make_my_marriage_tasks_checklist_templates_refined`; checklist detail inspection and read-only history also use `make_my_marriage_checklist_templates_generation_history` under ADR-035/037 |
| `/members`                                                          | `make_my_marriage_members_collaborator_invitations_refined`                                                                                                                                  |
| `/profile`                                                          | `make_my_marriage_my_profile_account_settings`, within the shared refined workspace shell                                                                                                    |
| `/settings`, `/recovery`                                            | `make_my_marriage_settings_profile_7_day_recovery_refined`; recovery section                                                                                                                 |

## Presentation and truthful state

- Use the refined workspace tokens: primary `#531d37`, primary container `#6e334e`, background `#fff7fb`, sidebar/soft surface `#f9f2f6`, card `#ffffff`, foreground `#1d1b1e` and muted text `#514348`. Retain the separate approved warm landing/sign-in reference palette. Use locally served Inter and Playfair Display.
- Keep the complete approved M logo and chosen local couple artwork. Do not copy broken remote logos, invent branding or replace an owner's uploaded cover with the reference's decorative stationery. Existing private custom covers retain ADR-020's non-destructive 2:1 framing/preview; desktop placement is beside wedding details and mobile placement stacks above them.
- The shared shell follows the compact project header, wedding card above six primary navigation links, plum selected item, account menu and bottom profile card. Profile and Recovery keep their explicit protected routes and are reachable from account/settings navigation. The real member role replaces the demo role switch; a Viewer cannot turn themselves into Admin through a preview control.
- The dashboard retains the reference's hero, coordinator actions, planning completion, metric cards, attention area, ceremonies, personal tasks and activity arrangement. Show saved wedding data and the real calendar countdown. Unbuilt planning metrics show an em dash and Coming soon, not fabricated counts, percentages, progress or task records.
- Unbuilt routes expose their reference-shaped headings, filters, table/catalog/form areas and clear unavailable states. All mutation controls are disabled and visibly explained. Current profile, wedding and membership fields may be shown read-only from the existing authorized session DTO. Do not imply a complete team directory or query records through unimplemented APIs. Preserve the existing finance-access filter for optional budget data.
- Keep working auth validation, duplicate-registration login behavior, verification attempts, generic resend/forgot responses, persistent sessions, guards, setup retry/state retention and cover editing. Reference-only security claims, six-digit codes, social login, Remember Me, automatic joining, simulated feedback banners and invented support/legal destinations remain excluded. Auth references are design galleries, not instructions to render their developer controls or simulated success/error states together on live forms.
- Preserve accessible labels, keyboard/focus behavior and mobile navigation. A modal or drawer for an unbuilt action is not required to open as a fake functioning editor; its disabled entry point remains visible until the relevant increment.

## Verification and boundaries

Review follow-up, 24 October 2026: constrain long account names in the shared header and wrap the full name in its popup. Use the existing Radix dropdown dependency for selection/outside-click/Escape dismissal and keyboard focus. Keep the Tasks empty state outside the horizontally scrolling table so its message fits a phone. These corrections retain the approved visual tokens and Coming soon scope. ADR-020 records the cover-loading/filename refinements; ADR-022 records the separately owner-approved login guidance change.

Record actual route/browser checks, desktop/mobile widths, validation/unavailable states, production build/startup, smoke and existing test results in PROJECT_STATUS.md. Use isolated synthetic fixtures for unsubmitted setup/form checks; never submit a change to the owner's wedding for visual testing. Reference screenshots and rendered screenshots are comparison evidence, not a pixel-perfect certification across every viewport/state.

This increment adds presentation only. Planning CRUD, invitations, profile/settings editing and deleted-record recovery remain unimplemented. Existing backend/email/database/storage decisions remain in force. No commit, push or deployment is authorized.

## Members directory follow-up — 28 October 2026

ADR-039 replaces `/members`' current-user-only preview with the real eligible directory, using the refined Members table reference, existing shared shell, palette and fonts. The owner approved adding the Viewer filter and relationship tags, while omitting other members' email addresses for non-Admins. The original wedding creator needs no relationship tag; later members require one when invited. Keep real role/open-task counts and bounded pages, no demo team/invitation rows or unimplemented security claims. Invitation/export/role/removal controls stay disabled with visible Coming soon labels, with no management controls for non-Admins. This follow-up does not implement invitations, role changes or removal; the original presentation-only statements above record the earlier increment.

28 October — Members invitation follow-up: ADR-040 connects the refined Members invitation form/cards and `make_my_marriage_collaborator_invitation_acceptance_states/code.html`. Preserve reference logo/colors/Inter/Playfair, modal role cards and recipient states. Add the owner-required Relationship/Other field, default Family Member, clarify Admin authority and replace demo single-click joining with explicit verified matching-email acceptance. Pending and terminal invitation records show actual status, seven-day expiry, safe Copy Link, resend cooldown and revoke confirmation. No demo team/guest invitations, fake delivery proof or live role/removal/export functionality is introduced. Responsive modal footers stay visible; discard/session Retry uses the existing accessible dialog pattern.
