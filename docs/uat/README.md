# ThankYou — UAT test cases

These files are the user-acceptance test cases for every feature of the ThankYou app. Each file covers one
area and holds related test cases. Every case says who runs it, where in the app, the exact data to type
and what you should see.

| File | Area | Cases |
| --- | --- | --- |
| [01-public-site.md](01-public-site.md) | Home, browsing without an account, public profiles, static pages | PUB-001 – PUB-016 |
| [02-accounts-sign-in.md](02-accounts-sign-in.md) | Sign-up, email verification, log in/out, two-step sign-in, password reset, onboarding, roles and switching | ACC-001 – ACC-027 |
| [03-volunteer-discovery.md](03-volunteer-discovery.md) | Finding opportunities, filters, matching, saving, saved searches, eligibility, applying | VDS-001 – VDS-022 |
| [04-volunteer-commitments.md](04-volunteer-commitments.md) | Applications, accepted details, confirming, calendar, cancelling, waitlist offers, withdrawing | VCM-001 – VCM-014 |
| [05-requester-requests.md](05-requester-requests.md) | Posting and managing a request as an individual, applicants, sensitive requests, goals | REQ-001 – REQ-026 |
| [06-hours-evidence-records.md](06-hours-evidence-records.md) | Reporting and approving hours, evidence, disputes, Impact, CSV, verified records | HRS-001 – HRS-026 |
| [07-reviews-reputation.md](07-reviews-reputation.md) | Two-sided reviews, reputation pages, reliability, badges | REV-001 – REV-010 |
| [08-messaging-notifications.md](08-messaging-notifications.md) | Inbox, contact masking, attachments, report/block/end, notifications, email preferences | MSG-001 – MSG-020 |
| [09-org-setup-team.md](09-org-setup-team.md) | Organization sign-up, join requests, team and roles, settings, verification, publishing rules, school coordinators | ORG-001 – ORG-028 |
| [10-org-operations.md](10-org-operations.md) | Organization requests, applicants, check-in, attendance, roster, forms, incidents, reports, contact limits | OPS-001 – OPS-030 |
| [11-minors-safety.md](11-minors-safety.md) | Under-18 volunteers, guardian consent, age limits, minors' privacy | MIN-001 – MIN-012 |
| [12-settings-profile.md](12-settings-profile.md) | Profiles and photos, account, privacy, blocking, reports filed, ID verification, data export, deletion | SET-001 – SET-022 |
| [13-sharing.md](13-sharing.md) | Share links, shared pages, reporting a shared link | SHR-001 – SHR-008 |
| [14-admin-moderation.md](14-admin-moderation.md) | Platform admin and moderator tools | ADM-001 – ADM-032 |
| [15-access-control.md](15-access-control.md) | Who can open what: signed-out, wrong role, other people's records, banned users | SEC-001 – SEC-016 |
| [16-mobile-accessibility.md](16-mobile-accessibility.md) | Phone-width layout, keyboard use, screen-reader labels | MOB-001 – MOB-010 |

## 1. Before you start

### Set up the test data (do this before each full UAT round)

The local database is disposable. One command wipes it, re-creates every table, adds the seed accounts
and loads ready-made situations to test (applications waiting, hours to approve, reports…):

```bash
pnpm db:uat
pnpm dev          # API on http://localhost:4202, web app on http://localhost:3202
```

Open **http://localhost:3202**. If the web app was already running (especially `pnpm build` + `start`),
restart it after `pnpm db:uat` so no page shows data from before the reset.

> If `pnpm db:uat` stops with *"must be owner of schema public"*, a Postgres superuser needs to run once:
> `ALTER SCHEMA public OWNER TO thankyou_app;` (in the `thankyou_next` database), then run it again.

You can re-run `pnpm db:uat` at any time to get back to the starting point, for example after a test
that cancels or deletes something other tests need.

### Emails and links

Locally, no real email is sent. With the settings in `apps/api/.env` (`EMAIL_TRANSPORT=log`,
`DEV_EMAIL_LINKS=true`):

- **Sign-up verification, password reset and guardian consent links appear on the page** under
  "Development only — …". Click the link there instead of opening an inbox.
- **Every other email is printed in the API terminal** (look for `[email:log] To: … Subject: …`). Test
  cases that say "an email is sent" are checked there.

### Browsers and sessions

Many cases need two people at once (for example a volunteer and an organizer). Use two separate
browser sessions so you stay signed in as both: a normal window and a private/incognito window, or two
different browsers. Signing in as someone else in the same window signs the first person out.

### Times and background jobs

- Seeded requests start a set number of days after the day you ran `pnpm db:uat` (column "Starts" in
  section 3), at 2:00 PM, New York time.
- Reminders are sent by a background job every 15 minutes; housekeeping (closing finished requests,
  expiring waitlist offers, saved-search alerts) runs hourly at :07. Cases that depend on them say how
  long to wait.

## 2. Seed users

**Every seeded account's password is `Password!`** (capital P, ending in an exclamation mark).
The **User ID** you sign in with is the email address. Internal record IDs (long codes in URLs such as
`/volunteers/3f2c…`) are generated fresh on every `pnpm db:uat`, so test cases never depend on them.

| User ID (sign-in email) | Password | Name shown | What they are | Notes for testing |
| --- | --- | --- | --- | --- |
| `admin@thankyou.test` | `Password!` | Ada (Admin) — Ada Admin | Platform **super admin** | All admin tools: users, organizations, categories, verification, audit log, maintenance mode. Also has the volunteer role. |
| `moderator@thankyou.test` | `Password!` | Maya (Moderator) — Maya Moderator | Platform **moderator** | Works the moderation queues (requests to review, held messages, disputes, reports). Can't open user or organization management. |
| `org.admin@thankyou.test` | `Password!` | Olivia — Olivia Ortiz | **Admin** of Harbor Food Bank (verified) and of Bright Futures Tutoring (not verified) | Organization owner: posts requests, accepts volunteers, approves hours, manages the team and settings. Switch organization from the menu at the top of the sidebar. |
| `org.manager@thankyou.test` | `Password!` | Nora — Nora Bennett | **Manager** at Harbor Food Bank | Can do day-to-day work (requests, applicants, hours, invites) but not admin-only settings. Sees volunteers' contact details. |
| `org.member@thankyou.test` | `Password!` | Marcus — Marcus Lee | **Member** at Harbor Food Bank | Lowest staff role: can view requests and applicants, can't act on them, never sees volunteers' email or phone. |
| `school.admin@thankyou.test` | `Password!` | Sam — Samuel Okafor | **Admin** of Lincoln High School (organization type: School, verified) | Posts school opportunities; can add school coordinators. |
| `school.coordinator@thankyou.test` | `Password!` | Cora — Cora Lindqvist | **School coordinator** at Lincoln High School | Member-level access for now (release 2 adds student-record review). |
| `volunteer.local@thankyou.test` | `Password!` | Valerie — Valerie Nguyen | Volunteer, **ID-verified**, in person only, has a car, 15-mile radius, Jersey City NJ | Skills: driving, cooking, lifting. Interests: food, seniors, transport. Free Sat, Sun, Wed. |
| `volunteer.remote@thankyou.test` | `Password!` | Ravi — Ravi Patel | Volunteer, **not verified** (ID submitted, waiting), remote only, no car, Hoboken NJ | Skills: tutoring, Spanish, web design. Has asked to join Harbor Food Bank. |
| `requester@thankyou.test` | `Password!` | Rose — Rose Martin | Individual requester, **ID-verified**, Manhattan NY | Posts neighbor requests; can post sensitive categories (help inside a home, money…). |
| `dual.role@thankyou.test` | `Password!` | Diego — Diego Alvarez | Both **volunteer and requester**, not verified, Newark NJ | Switches between "Volunteering" and "Requesting help". Has 2 approved hours and a published review. |
| `teen.volunteer@thankyou.test` | `Password!` | Tara — Tara Young | Volunteer, **17 years old**, Jersey City NJ | Minor protections: can't apply to individuals' requests, contact details hidden, guardian consent where required. |

Organizations:

| Organization | Public address | Type | Verification | Team |
| --- | --- | --- | --- | --- |
| Harbor Food Bank | `/organizations/harbor-food-bank` | Nonprofit | Verified | Olivia (admin), Nora (manager), Marcus (member); Ravi has asked to join |
| Bright Futures Tutoring | `/organizations/bright-futures-tutoring` | Nonprofit | Not verified (verification required, not yet submitted) | Olivia (admin) |
| Lincoln High School | `/organizations/lincoln-high-school` | School | Verified | Sam (admin), Cora (school coordinator) |

## 3. Seeded requests

"Starts" is the number of days after you ran `pnpm db:uat`; every one starts at 2:00 PM and runs 2 hours.

| Title | Posted by | Category | Where | Spots | Starts | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Deliver meals to homebound seniors | Harbor Food Bank | Food & meals | In person, Astoria, NY | 2 | +2 | Needs a car. Valerie accepted (S5). |
| Sort donations at the pantry | Harbor Food Bank | Food & meals | In person, Queens, NY | 1 | +3 | No applicants. |
| Saturday distribution shift | Harbor Food Bank | Food & meals | In person, Queens, NY | 6 | +5 | Exact address *87-10 Queens Blvd, Elmhurst, NY*. Valerie accepted; Diego and Tara waiting (S4). |
| Translate a flyer to Spanish | Harbor Food Bank | Translation & language | Remote | 1 | +5 | |
| Community garden weeding | Harbor Food Bank | Events & community | In person, Jersey City, NJ | 1 | +6 | Shared link reported twice (S9). Saved by Valerie. |
| Pantry inventory spreadsheet cleanup | Harbor Food Bank | Tech help | Remote | 1 | +10 | |
| Event setup crew | Harbor Food Bank | Events & community | In person, Newark, NJ | 1 | +11 | Saved by Valerie. |
| Volunteer coordinator for holiday drive | Harbor Food Bank | Events & community | Hybrid, Queens, NY | 1 | +20 | |
| Weekly ESL conversation circle | Bright Futures Tutoring | Tutoring & mentoring | Remote | 3 | +2 | Repeats Tue and Thu. |
| Reading buddy (grades 2–3) | Bright Futures Tutoring | Tutoring & mentoring | Remote | 1 | +6 | |
| Algebra tutoring (grade 8) | Bright Futures Tutoring | Tutoring & mentoring | Remote | 1 | +7 | |
| Spanish–English homework help | Bright Futures Tutoring | Tutoring & mentoring | Remote | 1 | +9 | |
| College essay feedback | Bright Futures Tutoring | Tutoring & mentoring | Remote | 1 | +14 | |
| Mock job interview practice | Bright Futures Tutoring | Tutoring & mentoring | Remote | 1 | +15 | |
| Build a simple sign-up page | Bright Futures Tutoring | Tech help | Remote | 1 | +21 | |
| After-school homework club helpers | Lincoln High School | Tutoring & mentoring | In person, Jersey City, NJ | 4 | +4 | Repeats Mon and Wed. Address *100 Lincoln Ave, Jersey City, NJ*. Tara accepted (S6). |
| Walk and talk in the park | Rose | Companionship | In person, Riverside Park, Manhattan, NY | 1 | +3 | Diego and Valerie waiting for a decision (S2). |
| Help me carry groceries upstairs | Rose | Errands & chores | In person, Upper West Side, Manhattan, NY | 1 | +4 | Valerie completed it; hours waiting; messages (S1). |
| Explain my electricity bill | Rose | Money & paperwork (**sensitive**) | Remote | 1 | +5 | Only ID-verified volunteers see it. |
| Help hanging curtains and a shelf | Rose | Help inside a home (**sensitive**) | In person, Upper West Side | 1 | +6 | **Waiting for moderator review**; not public. |
| Set up my new phone | Rose | Tech help | Hybrid, Manhattan, NY | 1 | +8 | Diego completed it, hours approved, both reviews published (S3). |
| Ride to a medical appointment | Rose | Rides & delivery | In person, Hoboken, NJ | 1 | +9 | |
| Fill in an online benefits form | Rose | Tech help | Remote | 1 | +12 | Reported by Valerie as a scam (S7). |
| Draft: garden cleanup (not published) | Rose | Events & community | In person, Manhattan, NY | 1 | +12 | A draft; only Rose sees it. |

## 4. Ready-made test data (loaded by `pnpm db:uat`)

| Id | Situation | Where to see it |
| --- | --- | --- |
| S1 | Valerie applied to Rose's *Help me carry groceries upstairs*, was accepted, then Rose marked it complete. **2 h are waiting for Rose's approval.** Valerie already reviewed Rose; Rose hasn't reviewed Valerie yet. They exchanged two messages. | Rose: Hours, applicants of that request, Inbox. Valerie: Impact, application, Inbox. |
| S2 | Diego and Valerie both applied to Rose's *Walk and talk in the park* (1 spot). **Both pending.** | Rose: Applicants. |
| S3 | Diego applied to Rose's *Set up my new phone*, was accepted, the work was completed, **Rose approved 2 h**, and **both reviews are published**. | Diego: Impact, verified records. Rose: Reputation. Public profiles. |
| S4 | Harbor's *Saturday distribution shift*: **Valerie accepted** (she sees the exact address); **Diego and Tara (17) pending**. | Olivia/Nora/Marcus: Applicants. Valerie: application. |
| S5 | Harbor's *Deliver meals to homebound seniors*: Valerie accepted and **reported 2.5 h** ("Delivered 12 meals on the Astoria route."), **waiting in Harbor's Hours queue**. | Olivia/Nora: Hours. |
| S6 | Lincoln High's *After-school homework club helpers*: **Tara accepted** by the school. | Sam: Applicants. Tara: Applications. |
| S7 | Valerie **reported** Rose's *Fill in an online benefits form* as a scam. | Admin: Reports. Valerie: Settings → Reports filed. |
| S8 | Ravi **asked to join** Harbor Food Bank. | Olivia/Nora: Team → Requests to join. |
| S9 | Olivia **shared** *Community garden weeding*; Valerie and Diego **reported the shared link** ("misleading"). | Admin: Reports (2 share-link reports). |
| S10 | Valerie **saved** *Community garden weeding* and *Event setup crew*. | Valerie: Find opportunities → Saved. |
| S11 | Rose's ID was **approved** (she can post sensitive requests). | Rose: Settings → Verification. |
| S12 | Ravi's ID is **waiting for review**. | Admin: Verification → Users. |

## 5. How to read and record a test case

Each case looks like this:

- **ID and title** — `TC-AREA-NNN`. The priority follows the title: **P1** must work for launch, **P2**
  important, **P3** nice to have.
- **Tester** — which seed user to sign in as (or *Visitor* = signed out, or a *new account* you create).
- **Page** — the address to open (after `http://localhost:3202`) and how to get there from the menu.
- **Before you start** — anything that must already be true (often a ready-made situation above, or
  another case).
- **Test data** — exactly what to type or pick. Use it as written so results are comparable.
- **Steps** — what to do, in order.
- **Expected result** — what must happen. Every bullet must be true to pass.
- **Result** — tick one and add notes (what you saw, a screenshot name) when it isn't a pass.

Sample data for accounts you create: use addresses like `uat.vol1@example.test`, `uat.vol2@example.test`
(the `example.test` domain never receives mail). If an address is already taken from an earlier round,
add a number (`uat.vol1b@example.test`) or re-run `pnpm db:uat`.

## 6. Issues found while preparing these cases

These were found while checking every page for this document. The test cases describe the **correct**
behavior, so the related cases will fail until these are fixed.

| # | Where | What's wrong | Related cases |
| --- | --- | --- | --- |
| K1 | Help page (`/help`) | Shows developer troubleshooting text ("confirm the backend is running… RUN_MIGRATIONS=true") and outdated statements ("full directories are available to logged-in users only"). | PUB-012 |
| K2 | Contact page (`/contact`) | Shows placeholder text: "Contact form wired to backend validation" and "This is a placeholder workflow; backend validates input and returns 202." | PUB-013 |
| K3 | How it works, About, Help and other static pages | Show a "Public" badge and an internal description line (for example "Explains the core flow in simple steps."). | PUB-011 |
| K4 | Shared page (`/share/…`) | Shows the organization's city instead of the opportunity's area (for *Community garden weeding* it says Queens, NY instead of Jersey City, NJ). | SHR-003 |
| K5 | Volunteer home "Picked for you" and Saved list | Show "Flexible" instead of each opportunity's date and time. | VDS-002, VDS-014 |
| K6 | Profiles | Requester profile and public requester page show raw values ("ID: not_required", "Typical response time 0s") and "Completed commitments 0" after completed work; a volunteer's public profile shows "Completed opportunities 0" even with completed, approved work. | PUB-008, PUB-009, SET-003 |
| K7 | Admin → Moderation | Shows the poster's raw verification value, e.g. "Rose (not_required)". | ADM-004 |
| K8 | Organization pages, signed in as a **member** | Shows buttons members can't use (Accept, Waitlist, Decline, Check in, Mark complete, Post a request, Upload document). The server refuses them with an error. The Hours page shows "Hours couldn't load" instead of saying hours are reviewed by admins and managers. | OPS-027, OPS-028 |
| K9 | Organization home | Lists partly filled requests as "Pending" while the Requests page says "Partly filled". | OPS-001 |
| K11 | Contact page | After **Send**, nothing on the page changes, so the visitor doesn't know the message went (it is stored and emailed to the team). | PUB-013 |
| K10 | Organization → Attendance | Filter asks for a "Volunteer User ID" (an internal code) instead of a name. | OPS-012 |

Already fixed while preparing these cases: the About page said "About GiveBack" (now ThankYou), and a
moderator opening Admin → Organizations, Verification or Incidents got "Something went wrong" (now
"Access denied").
