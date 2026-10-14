# Make My Marriage — Product Requirements Document (PRD) v1.0

**Status:** Finalized baseline for implementation  
**Product:** Make My Marriage  
**Primary market:** Indian weddings, with initial emphasis on Odia wedding workflows  
**Currency:** INR  
**Initial model:** One wedding per user, multiple collaborators per wedding

---

## 1. Product Overview

**Make My Marriage** is a wedding planning and coordination platform designed to bring the operational side of a wedding into one organized workspace.

The product is intended primarily for the bride, groom, and the person actively managing the wedding, with structured collaboration for family members. Guests do not use the internal dashboard. Instead, they interact through a polished public wedding experience for invitation details, event information, RSVP, maps, gallery access, and related guest-facing information.

The product should feel like a modern SaaS application with subtle wedding warmth: premium, elegant, trustworthy, organized, and easy to use. It should not feel like an old-fashioned wedding invitation website.

---

## 2. Problem Statement

Indian weddings involve many moving parts across multiple ceremonies, people, locations, vendors, guest groups, tasks, expenses, invitations, and family responsibilities.

Planning is commonly fragmented across:

- WhatsApp chats
- phone calls
- spreadsheets
- notes
- paper lists
- separate guest lists
- vendor conversations
- payment records
- photo folders

This fragmentation creates duplication, missed responsibilities, unclear ownership, outdated information, and unnecessary stress.

Make My Marriage centralizes the planning process while remaining simple enough for families to adopt without turning the product into a heavyweight enterprise tool.

---

## 3. Product Vision

Create a single, calm planning workspace where a couple and their family can organize the wedding from the first planning tasks through the final celebration, while guests receive only the information relevant to them.

The product should progressively support the full wedding journey without requiring all capabilities to be built at once.

### Brand promise

**Plan every moment. Enjoy every memory.**

---

## 4. Product Objectives

The product should:

1. Centralize wedding planning information.
2. Make responsibilities and ownership clear across family members.
3. Support multiple ceremonies and different venues naturally.
4. Reduce dependence on disconnected spreadsheets, chats, and notes.
5. Keep financial data private to authorized users.
6. Provide guests with a polished experience without requiring guest accounts.
7. Grow by version without unnecessary technical or UX complexity.
8. Remain inexpensive to operate during development and early adoption.
9. Support Indian wedding structures without becoming visually traditional or regionally restrictive.

---

## 5. Product Principles

### 5.1 Simple before complex

Only introduce complexity when it solves a real user problem. Avoid building marketplace, realtime, microservice, and heavy workflow features before they are needed.

### 5.2 Internal planning and guest experience stay separate

The dashboard is for people managing the wedding. Guests receive a curated public experience rather than access to the planning workspace.

### 5.3 Family collaboration is first-class

Wedding planning is rarely performed by one person. The product should support clear assignment and collaboration across trusted family members.

### 5.4 Privacy by design

Finance, guest information, internal activity, tasks, and operational planning must not be exposed to unauthorized users.

### 5.5 Wedding-specific, not generic project management

The product should support wedding ceremonies, event-level guest invitations, family workflows, wedding countdowns, venue maps, RSVP, and other wedding-specific concepts directly.

### 5.6 Progressive product growth

Each version should be useful independently and should extend the prior design without forcing major rewrites.

---

## 6. Target Users and Roles

### 6.1 Admin

Usually the bride, groom, or wedding creator.

Capabilities include:

- full wedding configuration
- manage members and roles
- manage events
- manage tasks
- manage guests when available
- manage budget, expenses, and vendors when available
- manage accommodation when available
- manage public wedding settings
- grant finance access

Rules:

- Another trusted member may be promoted to Admin.
- The last remaining Admin cannot remove or demote themselves.

### 6.2 Family Member

Used for people actively helping manage the wedding.

Typical capabilities:

- events
- tasks
- guests
- operational planning
- assigned responsibilities

Financial information is available only if an Admin explicitly grants `financeAccess`.

### 6.3 Viewer

Read-only access to permitted internal wedding information.

Viewer does not receive finance access by default.

### 6.4 Guest

Guest is **not** an authenticated dashboard role.

Guests interact through invitation/public wedding links and can receive:

- invited event schedule
- date and time
- venue information
- maps
- RSVP
- dress code and instructions
- accommodation information when relevant
- gallery access later
- livestream link later

Guests do not see:

- internal dashboard
- tasks
- vendors
- budget
- family activity feed
- member administration
- private planning information

---

## 7. Product Roadmap

| Version | Scope |
|---|---|
| **V1** | Authentication, Wedding Setup, Members/Roles, Events, Tasks, Checklist Templates, Dashboard |
| **V2** | Guests, Guest Groups, Event-Level Invitations, Digital Invitation, RSVP |
| **V3** | Budget, Expenses, Payments, Vendors, Notifications |
| **V4** | Accommodation and room allocation |
| **V5** | Public Wedding Website, Gallery, Photo Approval, Livestream link/embed, Gallery Mode |
| **V6** | Culture/wedding-size-based smart planning templates and richer planning intelligence |

Future/non-committed items include WhatsApp integration and AI Wedding Planner.

---

# 8. V1 Functional Requirements

## 8.1 Authentication

V1 uses email and password authentication.

Requirements:

- registration with email + password
- mandatory email verification before normal dashboard access
- login
- persistent login across browser restarts
- short-lived access token, approximately 15–30 minutes
- refresh token lifecycle
- refresh tokens stored/revocable through the database
- secure HTTP-only cookies
- multiple device sessions allowed
- logout current device
- forgot password flow
- secure password reset link with approximately 15–30 minute expiry
- rate limiting on authentication-sensitive endpoints
- social login deferred
- no user-facing Remember Me checkbox
- no self-service account deletion in V1

Password baseline:

- minimum 8 characters
- uppercase
- lowercase
- number
- no unnecessary special-character complexity requirement

### Collaborator invitation flow

1. Admin enters invitee email.
2. System creates secure invitation token.
3. Invitation is stored.
4. Email is sent and a copyable invite URL is available.
5. Invitee opens the link.
6. Invitee logs in or registers.
7. Account email must match invitation email.
8. Invitee accepts invitation.
9. Invitation becomes permanently consumed.

Invitation rules:

- expires after 7 days
- Admin can resend
- used invitation cannot be reused
- duplicate active invitations should be prevented or handled safely

---

## 8.2 Wedding Setup

Wedding creation should collect:

- wedding name
- bride name
- groom name
- main wedding date
- wedding city/state
- wedding tradition/culture
- estimated budget
- optional cover image
- optional/pre-wedding event setup

Initial constraints:

- one main wedding date
- one wedding per user initially
- multiple collaborators can manage the wedding
- Bride Side / Groom Side terminology supported where relevant
- custom ceremonies allowed

---

## 8.3 Event Management

Suggested preset event types:

- Engagement
- Haldi
- Mehendi
- Sangeet
- Barajatri
- Wedding
- Reception
- Custom

Each event can independently store:

- name
- description
- date
- start time
- end time
- venue name
- full address
- city
- map/location information
- status
- activities

Event status:

- Planned
- Confirmed
- Completed
- Cancelled

Events may occur in different cities and venues.

Example:

- Haldi — home in Cuttack
- Sangeet — hotel in Bhubaneswar
- Wedding — mandap in Cuttack
- Reception — convention centre in Bhubaneswar

### Event activities

Events may contain lightweight activities such as:

- guest arrival
- performances
- rituals
- dinner

Activity fields:

- name
- start time
- optional description

### Event deletion behavior

Deleting an event must not cascade-delete important business information.

- Event is soft-deleted.
- Tasks remain and retain historical association or may be reassigned/unlinked.
- Guest profiles remain.
- Event invitations/RSVP records for that event become inactive/archived while history is preserved.
- Vendors remain.
- Expense/payment history remains.
- Activity log records the deletion.
- Event may be restored during its recovery period.

---

## 8.4 Task Planner

Tasks belong to the wedding and may optionally relate to an event.

Requirements:

- title
- description
- multiple assignees
- optional event reference
- due date
- status
- priority
- recurring configuration
- search/filtering

Statuses:

- To Do
- In Progress
- Completed

Priorities:

- Low
- Medium
- High
- Urgent

Recurring options:

- None
- Daily
- Weekly
- Monthly

Recurring occurrences should be represented as separate task records for reliable completion tracking and history.

Task filters should support:

- status
- priority
- assignee
- event
- due date
- text search

A task is overdue when it is incomplete and its due date has passed.

V1 excludes:

- subtasks
- task attachments
- task comments/discussions

---

## 8.5 Checklist Templates

V1 includes basic wedding planning templates.

Example categories:

- initial planning
- venue
- catering
- photography
- clothing
- invitations
- guest preparation

Requirements:

- generated deadlines may be relative to wedding date
- generated checklist items become normal tasks
- users can edit, reassign, reprioritize, change deadlines, or delete generated tasks
- regeneration must not blindly duplicate tasks
- modified generated tasks must not be silently overwritten
- checklist generation should be explicit rather than silently triggered

User-created reusable templates are deferred.

---

## 8.6 Dashboard

The dashboard must provide a rich planning overview rather than only static statistics.

### Wedding overview

- wedding name
- bride and groom
- main wedding date
- countdown
- wedding location
- cover image

### Planning progress

`completed tasks / total tasks * 100`

Use a visual progress component.

For zero tasks, progress must safely resolve to 0%.

### Task summary

- total
- completed
- in progress
- pending
- overdue
- My Tasks

### Upcoming events

Show approximately the next 3 events with:

- event name
- date
- time
- venue
- days remaining
- status

### Attention Required

Examples:

- overdue tasks
- events missing venue
- approaching events
- unassigned high-priority tasks

Later versions may add:

- payment due
- guests awaiting RSVP
- guests without accommodation

### Recent activity

Examples:

- member completed task
- event updated
- member invited
- role changed

Historical activity should remain meaningful even if the referenced entity is later deleted.

### Quick actions

- Add Task
- Add Event
- Invite Member
- View All

The overall dashboard layout should stay consistent across roles, while actions and data are hidden or disabled according to permissions.

---

## 8.7 Search and Interface Behavior

Requirements:

- task/event/member search where relevant
- sorting and filtering in data-heavy lists
- pagination where useful
- responsive desktop/tablet/mobile layout
- clean SaaS dashboard feel
- subtle wedding warmth
- no dark mode requirement for V1
- useful empty states
- loading states
- disable duplicate submit during network operations
- friendly timeout/error handling

---

# 9. V2 — Guests, Invitation and RSVP

V2 introduces guest management while keeping guests outside the internal dashboard.

## Guest management

Support:

- guest records
- guest groups/households
- Bride Side / Groom Side classification
- tags such as Family, Friends, Office, College, VIP
- plus-one support
- duplicate email/phone warning without hard blocking
- manual RSVP updates for phone/offline responses
- future CSV/Excel import

Children approximately under age 15 do not require separate guest profiles; attendee counts may cover them.

## Event-level invitations

A guest record does not imply invitation to every event.

Example:

A guest may be invited to Reception but not Wedding.

## RSVP

- no account required
- secure/unique invitation token or URL
- RSVP separately by event
- Yes/No only initially
- attendee count
- Veg/Non-Veg preference
- RSVP editable until the corresponding event begins
- repeated submission updates the existing RSVP rather than duplicating it

---

# 10. V3 — Budget, Expenses, Vendors and Notifications

## 10.1 Budget and expenses

Support:

- overall budget
- category-wise allocation
- Estimated
- Committed
- Paid
- Remaining
- expenses linked to events
- expenses linked to vendors
- multiple payment installments
- receipt/invoice upload
- INR only initially

Financial information is restricted to:

- Admin
- Family Member with explicit `financeAccess`

Viewer and Guest receive no finance access by default.

Financial records must never be silently deleted merely because an event or vendor association is removed.

## 10.2 Vendors

A vendor may:

- support multiple events
- provide multiple services

Vendor status:

- Shortlisted
- Confirmed
- Completed
- Cancelled

Support uploads such as:

- quote
- contract
- invoice

Not planned initially:

- vendor marketplace
- vendor ratings
- automated vendor payment reminder engine

## 10.3 Notifications

Initial notification candidates:

- task assigned
- task due soon
- task overdue
- RSVP received
- payment due
- member invited
- event approaching

Priority:

1. in-app if simple
2. email
3. WhatsApp later

No daily/weekly summary requirement initially.

---

# 11. V4 — Accommodation

Focus on room allocation rather than hotel booking marketplace functionality.

Support:

- hotel details
- rooms reserved
- room types
- room assignment
- remaining room count
- guest-level room allocation
- check-in/check-out information
- hotel expense linked to budget

Not required initially:

- hotel marketplace
- live booking integration
- special elderly-accessibility workflow

Transportation remains deferred for later discussion.

---

# 12. V5 — Public Wedding Website and Gallery

## Public wedding website

A wedding may have a publishable public website.

Possible sections:

- couple story
- wedding countdown
- event schedule
- venue/maps
- RSVP
- dress code/instructions
- accommodation information
- contact information
- gallery
- livestream link/embed

Requirements:

- publish/unpublish
- unique URL
- multiple predefined themes
- no manual font/color customization required initially
- no password protection required initially

Guests should receive more useful wedding information through this public experience rather than a separate guest dashboard.

## Gallery

Potential uploaders:

- Admin
- Family Member
- Guest
- Photographer

Requirements:

- store uploader identity/context
- approval before public visibility
- organize by event
- original-quality download permitted
- storage limit to be defined later

Not planned:

- private albums
- face recognition
- AI photo sorting

Livestreaming is external URL/embed only; the platform does not host video streaming infrastructure.

## Gallery Mode

After the wedding, Admin may switch the wedding into Gallery Mode.

- planning becomes read-only
- approved memories remain accessible
- mode is reversible by Admin

Passing the wedding date must not automatically lock the system.

---

# 13. V6 — Smart Planning

Introduce smarter planning templates based on:

- tradition/culture
- wedding size
- wedding date
- ceremony selection

Initial focus should include richer Odia wedding templates while remaining extensible to other Indian traditions.

Suggested deadlines can be relative to the wedding date.

AI Wedding Planner remains a future/non-committed feature.

---

# 14. Important Business Rules and Edge Cases

The application must handle these scenarios safely.

## Authentication and membership

- duplicate registration email
- invalid credentials
- expired/used password reset token
- expired/used invitation
- invitation email mismatch
- duplicate active invitation
- user already belongs to another wedding
- user attempts to create a second wedding
- last Admin protection
- role changes take effect server-side immediately

## Authorization

Frontend visibility is never sufficient for permission enforcement.

Backend must verify:

- authenticated user
- wedding membership
- current role
- finance permission when required
- resource belongs to the wedding being accessed

Wedding/resource ID tampering must not expose cross-wedding data.

## Events

- end time before start time: reject unless valid cross-midnight handling applies
- event crossing midnight: support
- overlapping events: warn rather than always block
- activities outside event time: warn
- overlapping activities: warn/allow
- different city/location per event: allowed

## Tasks

- no assignee: allowed but surfaced in Attention Required
- duplicate assignees: deduplicate
- due date before creation: reject/warn
- task after wedding date: warn but allow
- removed member assigned to task: unassign/reassign workflow
- recurring generation must be idempotent
- recurring tasks beyond wedding date should stop or warn

## Checklist

- do not blindly duplicate on regeneration
- do not overwrite modified generated tasks

## Dashboard

- zero-task progress safely resolves to 0%
- no upcoming items should show useful empty states
- deleted entity in activity feed should remain understandable historically

## Concurrency/network

- use optimistic concurrency through `updatedAt`/version
- avoid silent overwrite when two users edit simultaneously
- prevent accidental double-submit
- provide loading states
- provide friendly retry/error behavior
- sanitize special characters/search input
- correct pagination after deleting final item on a page
- unsaved-changes warning where practical

---

# 15. Data Lifecycle and Deletion

Important business entities use soft delete first.

Examples:

- Wedding
- Event
- Task
- Guest
- Vendor
- Expense

Standard metadata where applicable:

- `createdAt`
- `updatedAt`
- `createdBy`
- `deletedAt`
- version/update marker for concurrency

### Hard deletion

Hard deletion is reserved mainly for:

- expired/used security tokens
- expired session/refresh-token records
- temporary/idempotency data after retention
- orphaned Cloudflare R2 files after asynchronous cleanup
- permanent wedding purge after its recovery period

A wedding has a **7-day recovery window** before permanent asynchronous purge.

Important financial/payment history must not disappear merely because an event is deleted.

---

# 16. Audit and Activity History

Use a lightweight permanent activity history rather than full database versioning.

Examples:

- member created event
- member updated task
- Admin changed role
- event deleted
- checklist generated

Activity history should remain useful even if a referenced entity is later soft-deleted or purged.

---

# 17. Security and Privacy Requirements

Baseline expectations:

- secure password hashing
- short-lived access token
- refresh-token lifecycle and revocation
- HTTP-only secure cookies
- cryptographically secure invitation/reset/verification tokens
- rate limiting
- request validation
- output/input sanitization as appropriate
- backend authorization on every protected resource
- role-based access control
- explicit finance permission
- wedding-level isolation
- private object storage
- signed upload/access mechanisms
- environment-based secret management
- no sensitive authorization decisions based only on frontend state

---

# 18. Technical Product Assumptions

These are implementation choices already aligned with the product design.

| Area | Current choice |
|---|---|
| Frontend | Next.js + React + JavaScript |
| Styling | Tailwind CSS + shadcn/ui |
| Forms | React Hook Form |
| Validation | Zod |
| Backend | Node.js + Express.js |
| API | REST under `/api/v1` |
| Database | MongoDB Atlas + Mongoose |
| Auth | Custom email/password auth |
| Email | Resend |
| Object storage | Cloudflare R2 |
| Venue/location | Google Places API + manual address fallback |
| Frontend hosting | AWS Amplify |
| Backend hosting | AWS Lambda |
| API entry | API Gateway HTTP API |
| Logging | CloudWatch |
| Scheduled/async AWS work | EventBridge + Lambda |
| IaC | AWS SAM |
| Environments | Staging + Production |
| Architecture | Modular Monolith |

The project should remain free-tier-first and target approximately ₹0 operating cost during early development wherever feasible.

---

# 19. Non-Goals for Initial Versions

The following should not be allowed to inflate the initial product scope:

- microservices
- Kubernetes
- realtime collaborative editing
- dedicated Redis infrastructure
- Kafka/message-broker infrastructure
- vendor marketplace
- hotel booking marketplace
- payment gateway
- AI photo recognition
- self-hosted livestreaming
- highly customizable theme builder
- full transportation module before requirements are finalized

---

# 20. UX Direction

The internal product should feel like a polished SaaS dashboard rather than a wedding invitation builder.

Desired qualities:

- modern
- warm
- elegant
- premium
- event-oriented
- trustworthy
- responsive
- uncluttered

The public wedding experience may be more emotionally expressive while remaining modern.

Current landing-page brand direction:

**Plan every moment. Enjoy every memory.**

Visual direction:

- warm ivory
- charcoal
- deep muted plum/burgundy
- restrained champagne accents
- modern editorial typography
- no random stock bride/groom photography
- premium near-realistic editorial illustration by default, with real couple photography used for the couple's own personalized wedding experience

---

# 21. Success Definition

V1 is successful when a couple can:

1. create and verify an account
2. create their wedding
3. invite trusted family members
4. manage roles safely
5. create and organize ceremonies/events
6. create and assign tasks
7. generate a useful wedding checklist
8. monitor progress from a meaningful dashboard
9. collaborate without exposing private data incorrectly
10. recover safely from normal mistakes such as deletion or conflicting edits

The product should be understandable without training and should reduce the feeling that wedding planning is scattered across many tools.

---

# 22. V1 Definition of Done

V1 is ready when:

- all V1 authentication flows work securely
- email verification and password reset work
- wedding creation and setup work
- member invitation and role rules work
- last Admin protection is enforced
- events and event activities work
- tasks, assignment, filtering, priority, status, and recurrence work
- checklist generation is safe and idempotent
- dashboard data is accurate and permission-aware
- activity history is recorded
- soft-delete/recovery flows behave correctly
- backend enforces wedding-level isolation
- responsive UX is acceptable on desktop/tablet/mobile
- core unit/integration/E2E coverage exists for critical flows
- staging and production environments can be deployed independently
- cost controls and basic monitoring are enabled

---

## Final Product Baseline

This PRD is the finalized product baseline that the System Design, Database Design, and API Design documents build upon. Future requirement changes should be versioned explicitly rather than silently changing this baseline.
