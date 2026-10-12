# 10 · Organizations: day-to-day operations

Posting organization requests, reviewing applicants, checking volunteers in and out (by staff or with the
on-site QR code), attendance, the roster and exports, forms and waivers volunteers must sign, incident
reports, reports and CSV/PDF exports, and who on the team sees volunteers' contact details.

Setup: `pnpm db:uat`. Harbor Food Bank team: Olivia (admin), Nora (manager), Marcus (member). Password `Password!`.

---

### TC-OPS-001 · Requests list — P1

- **Tester:** Olivia (`org.admin@thankyou.test`)
- **Page:** Organization → **Requests**
- **Before you start:** S4, S5
- **Expected result:** "Shifts and projects posted by Harbor Food Bank." with **New request** and tabs Active (8) · Drafts · Past · All.
  *Deliver meals…* shows **Partly filled** "1/2 volunteers"; *Saturday distribution shift* Partly filled "1/6 volunteers · 2 to review";
  the others Open "0/1". (Organization Home lists the same requests; it should use the same status words — known issue **K9**.)
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-002 · Post an organization request with requirements — P1

- **Tester:** Olivia
- **Page:** Requests → **New request** (`/org/requests/new`) — the same five-step wizard as REQ-001, "For Harbor Food Bank"
- **Test data:** Title `Holiday food drive sorting`; Category **Food & meals**; Description `Sort donated cans and dry goods by type and expiry date. Closed-toe shoes required.`; Volunteers `5`; Skills `lifting`; One time, 3 weeks from today 09:00, 180 min; Apply by 2 weeks from today; In person, area `Queens, NY`, exact address `87-10 Queens Blvd, Elmhurst, NY`, access notes `Loading dock entrance on 88th St.`; Requirements: Minimum age `16`, tick **Complete training first** and **Sign a waiver**; Equipment `Closed-toe shoes, gloves`
- **Steps:** Complete the wizard and publish.
- **Expected result:** Step 4 offers the organization-only options (training, waiver, guardian consent) and the note "A waiver or training
  needs a matching form in Documents…". Review lists Requirements "16+, training, waiver". After publishing (Olivia is an admin, so no
  owner approval): status Open. The public page shows "Before you apply: 16+ years old, Training before the first shift, Signs a waiver",
  "Bring: Closed-toe shoes, gloves" and "Access: Loading dock entrance on 88th St." — but not the street address.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-003 · Applicants across the organization — P1

- **Tester:** Olivia
- **Page:** Organization → **Applicants** (`/org/applications`)
- **Before you start:** S4, S5
- **Expected result:** "Review people who applied to your requests. Contact details are shared only after you accept." Tabs **To review (2)**,
  Waitlisted (0), Accepted (2), All (4). To review lists Tara and Diego (Saturday distribution shift) with their messages and Accept /
  Waitlist / Decline / Message.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-004 · Waitlist then accept from the organization list — P2

- **Tester:** Olivia
- **Page:** Applicants → To review
- **Steps:** **Waitlist** Diego; open the Waitlisted tab; **Accept** him.
- **Expected result:** "Waitlisted. If a spot opens they'll be offered it and have 24 hours to say yes." then he moves to Accepted:
  "Accepted. They can now see the exact address and your contact details." Counts update on each tab.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-005 · Request page for staff — P1

- **Tester:** Olivia
- **Page:** Requests → *Saturday distribution shift*
- **Expected result:** Status Partly filled ("Some spots are filled; still taking applicants."), **Applicants (1/6)**, **Edit**; details Category,
  When, Where "Queens, NY — 87-10 Queens Blvd, Elmhurst, NY — shown only to accepted volunteers", Volunteers "1 of 6 filled", Skills,
  Description; links Documents and waivers · Attendance · Incidents; History; actions **Pause (hide from search)**, **Mark as completed**,
  Cancel this request; an **On-site check-in** box with **Show check-in code**.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-006 · Staff check a volunteer in and out — P1

- **Tester:** Olivia
- **Page:** *Saturday distribution shift* → Applicants
- **Before you start:** S4 (Valerie accepted)
- **Steps:** On Valerie's card click **Check in**; then **Check out**.
- **Expected result:** "Checked in. Check them out when they leave to log their hours." and a "Checked in" label; after checking out:
  "Checked out. Their hours are on the attendance log." and the **Check in** button returns. Organization → People → **Attendance**
  shows a closed record for Valerie with check-in/out times; an hours entry appears in Hours ("Checked in and out by organization staff").
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-007 · Show the on-site check-in code — P1

- **Tester:** Olivia
- **Page:** *Saturday distribution shift* → On-site check-in
- **Steps:** Click **Show check-in code**.
- **Expected result:** "Show or print this code at the site. Volunteers scan it with their phone to check in and out; their hours come to
  you for approval." A QR code labelled "Check-in code for this request", the link under it (`http://localhost:3202/check-in/…`), and
  **Make a new code**.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-008 · Volunteer checks in with the code — P1

- **Tester:** Olivia (code) and a volunteer
- **Before you start:** check-in opens **2 hours before** the start. Post a Harbor request starting **in 1 hour** (Olivia: `QR check-in test`,
  Food & meals, in person, Queens, NY, 60 min), have Valerie apply and Olivia accept, then show its check-in code.
- **Steps:**
  1. As Valerie, open the check-in link (or scan the QR with a phone signed in as Valerie).
  2. Click **Check in now**.
  3. Click **Check out**.
- **Expected result:** 1: "Check in — QR check-in test · Harbor Food Bank · <time>" with **Check in now** and "Check-in never uses your location."
  2: "Checked in at <time>" with **Check out**. 3: "Checked out. Your hours went to the organizer for approval. Thank you!" Olivia's Hours
  shows the entry as "Volunteer scanned the on-site check-in code; hours approved by staff".
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-009 · Check-in code rules — P2

- **Tester:** Valerie, Ravi
- **Steps:**
  1. Ravi (not signed up for the shift) opens the code link from TC-OPS-008.
  2. Valerie opens the *Saturday distribution shift* code more than 2 hours before it starts.
  3. Olivia clicks **Make a new code**; Valerie opens the **old** link.
- **Expected result:** 1: "You aren't signed up for this shift. Talk to the organizer on site." 2: "Check-in opens 2 hours before the shift
  starts." 3: "New check-in code made. The old one no longer works." and the old link says "This check-in code isn't valid."
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-010 · Unfinished forms block check-in — P1

- **Tester:** Olivia, Valerie
- **Before you start:** TC-OPS-016 (a waiver assigned "Sign before check-in" to the request Valerie is on)
- **Steps:** Valerie opens the check-in link before signing.
- **Expected result:** "Finish these first:" lists the waiver with "Open your application to finish them". On the applicants page the card
  reads "Before check-in: <waiver title>" and staff check-in is hidden until it's done.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-011 · Attendance page — P2

- **Tester:** Olivia
- **Page:** Organization → People → **Attendance** (`/org/attendance`)
- **Before you start:** TC-OPS-006
- **Steps:** Filter Request = Saturday distribution shift, Status = Closed, **Apply**; click **Export CSV**.
- **Expected result:** Totals "Open check-ins" and "Total hours"; the table lists Valerie's record (Request, Volunteer, Check-in, Check-out,
  Hours). The CSV downloads with the same rows.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-012 · Attendance filter by volunteer — P3

- **Tester:** Olivia
- **Page:** Attendance
- **Expected result:** You can filter by a volunteer's **name**. Known issue **K10**: the filter asks for an internal "Volunteer User ID".
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-013 · Volunteer roster and export — P1

- **Tester:** Olivia
- **Page:** Organization → **People** (`/org/roster`)
- **Before you start:** S4, S5
- **Steps:** Look at the default list; change Status to **All**, **Apply**; search `Valerie`; click **Export CSV**.
- **Expected result:** Default (Active): "Valerie · 2 active · 0 waitlisted · 0 completed", Jersey City, NJ, **Message**, "Recent requests: Deliver
  meals to homebound seniors · Saturday distribution shift", Last activity. The CSV downloads with one row per volunteer, including Valerie.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-014 · Upload a form (waiver) — P1

- **Tester:** Olivia
- **Page:** Organization → People → **Forms** (`/org/documents`, "Forms and waivers")
- **Test data:** Type **Waiver**; File = a small PDF; Title `Harbor volunteer waiver 2026`; Description `Liability waiver for all pantry shifts.`; tick **Require acknowledgement** and **Active**
- **Steps:** Fill in and click **Upload**.
- **Expected result:** The document appears in the table: badge "waiver", "Harbor volunteer waiver 2026 · version 1", **Download**, Active, and an
  Assign form ("Sign before check-in / Sign before applying", "Assign org-wide / <request>", **Assign**). Download returns the same PDF.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-015 · Only PDF, JPG or PNG forms — P3

- **Tester:** Olivia
- **Test data:** a `.docx` or `.txt` file renamed to `waiver.pdf`
- **Expected result:** Refused (the file isn't really a PDF/JPG/PNG); nothing is added.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-016 · Assign a form to a request; volunteer signs it — P1

- **Tester:** Olivia, then Valerie
- **Before you start:** TC-OPS-014
- **Steps:**
  1. Olivia assigns the waiver: **Sign before check-in**, request *Saturday distribution shift*, **Assign**.
  2. Valerie opens My applications → *Saturday distribution shift*.
  3. Valerie opens the form, then clicks **Sign**.
- **Expected result:** 2: a "Before your shift — Finish these so you can check in." panel lists the waiver with a link to read it and **Sign**.
  3: "Signed. Thank you."; the panel shows the item done (· signed v1) and "All done." Olivia's request → **Documents** tab shows Valerie's
  acknowledgement (Acknowledged list).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-017 · Sign before applying — P2

- **Tester:** Olivia, then Ravi
- **Steps:** Olivia assigns the waiver **Sign before applying** to *Translate a flyer to Spanish*. Ravi opens that opportunity.
- **Expected result:** Instead of the Apply form: "Before you apply — This organization asks you to sign these first." with the waiver and
  **Sign**, and "Sign “Harbor volunteer waiver 2026” before applying." After signing, the Apply form appears.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-018 · New form version asks volunteers to sign again — P2

- **Tester:** Olivia, then Valerie
- **Before you start:** TC-OPS-016 (Valerie signed v1)
- **Steps:** Olivia: **New version** → choose a PDF, What changed `Added the allergy section.`, keep **Volunteers must sign again** ticked → **Upload version 2**. Valerie reopens her application.
- **Expected result:** The table shows version 2. Valerie's panel says "Something changed. Check-in is blocked until you finish the items
  below." with the waiver to sign again; staff see "(new version)" on her card.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-019 · Unassign a form — P3

- **Tester:** Olivia
- **Page:** *Saturday distribution shift* → Documents and waivers
- **Steps:** Click **Unassign** on the waiver.
- **Expected result:** The waiver disappears from the request; volunteers on it no longer need to sign it.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-020 · Record an incident — P1

- **Tester:** Nora (`org.manager@thankyou.test`)
- **Page:** Organization → People → **Incidents** (`/org/incidents`)
- **Test data:** Request **Saturday distribution shift**; Severity **Medium**; Title `Volunteer slipped on wet floor`; Description `A volunteer slipped near the loading dock at 10:40. No injury; area marked and mopped.`
- **Steps:** Fill in **Create incident report** and click **Create**.
- **Expected result:** A confirmation that it was recorded (known issue **K13**: none is shown), and the incident appears in the list (When,
  Status Open, Severity Medium, Title, Request). Platform staff see it in Admin → Incidents.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-021 · Update and close an incident — P2

- **Tester:** Nora
- **Before you start:** TC-OPS-020
- **Test data:** Status **Resolved**; Internal notes (org-only) `Added a wet-floor sign to the dock checklist.`; Outcome `Resolved: no injury, process updated.`
- **Steps:** Open the incident title, change the fields, save. Filter the list by Status = Resolved.
- **Expected result:** The incident shows the new status, notes and outcome after reload (known issue **K13**: no "saved" message). The filter
  finds it. Marcus (member) can view incidents but has no create or save controls that work (known issue K8).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-022 · Reports and exports — P1

- **Tester:** Olivia
- **Page:** Organization → Organization → **Reports** (`/org/reports`)
- **Before you start:** S5, and TC-HRS-004 (2 h approved) for non-zero numbers
- **Steps:** Look at the page; choose Request **Deliver meals to homebound seniors** → **Show**; download **Requests CSV**, **Volunteers CSV**, **Summary PDF**.
- **Expected result:** "Hours count once they're approved. Hours waiting for a decision and hours you didn't approve are shown separately,
  never added in." Tiles Approved hours, Waiting for approval, Not approved, Typical time to decide; tables **By request** (Goal, Promised,
  Approved, Waiting, Volunteers), **From posting to approved hours** (published → applications → accepted → checked in → completed),
  **By volunteer** (Valerie with email, approved/waiting/not approved). The CSVs open with the same numbers; the PDF is a readable summary.
  Self-reported outside service is never included.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-023 · Report date range — P3

- **Tester:** Olivia
- **Steps:** Set From/To to a range before any activity (e.g. last year), **Show**.
- **Expected result:** All totals 0; no error.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-024 · Edit an organization request (material change) — P2

- **Tester:** Olivia, Valerie
- **Page:** *Saturday distribution shift* → **Edit** → step 3
- **Steps:** Change Area shown publicly to `Elmhurst, Queens, NY`, **Save changes**. Check the History and Valerie's notifications.
- **Expected result:** "Changes saved." History shows the edit (for material changes "Edited (volunteers asked to re-confirm)"); Valerie
  is told about the change.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-025 · Pause, complete and cancel an organization request — P2

- **Tester:** Olivia
- **Page:** *Sort donations at the pantry*
- **Steps:** **Pause (hide from search)** → **Resume** → **Mark as completed**. On *Event setup crew*: Cancel this request with reason `Venue cancelled the fundraiser.`
- **Expected result:** Same messages as REQ-021/REQ-022/REQ-023: "Paused…", "Resumed…", "Marked complete. Volunteers have 14 days to leave
  a review.", "Canceled. Everyone who applied was told."
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-026 · Admins and managers see volunteers' contact details — P1

- **Tester:** Olivia, then Nora
- **Page:** *Saturday distribution shift* → Applicants; Organization → Applicants; Home; People → Incidents (after OPS-020)
- **Before you start:** S4
- **Expected result:** For accepted adult volunteers (Valerie) both see "Contact: volunteer.local@thankyou.test" on the card, and the email on
  the roster/reports. Under-18 volunteers (Tara) never show contact details: "Under 18 · talk in messages; contact details stay hidden".
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-027 · Members don't see volunteers' contact details — P1

- **Tester:** Marcus (`org.member@thankyou.test`)
- **Page:** the same pages as TC-OPS-026
- **Expected result:**
  - Valerie's card shows **no** "Contact:" line and no email anywhere (Applicants, Home's latest applicants, incident lists, document
    acknowledgement lists). Searching incidents by Valerie's email finds nothing for Marcus.
  - Marcus can't act: Accept, Waitlist, Decline, Check in, Mark complete, Post a request and Upload document either aren't shown or are
    refused with a clear "admins and managers" message (known issue **K8**: buttons are shown and fail).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-028 · Members' Hours and People pages — P2

- **Tester:** Marcus
- **Page:** Organization → Hours; Organization → People
- **Expected result:** Hours says hours are reviewed by admins and managers (known issue **K8**: "Hours couldn't load. Refresh to try again.").
  People (roster) is not available to members (it opens Forms instead); the roster CSV is refused.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-029 · Manager does the day-to-day work — P1

- **Tester:** Nora (`org.manager@thankyou.test`)
- **Steps:** Accept Diego on *Saturday distribution shift*; approve Valerie's 2.5 h in Hours (S5); export the roster.
- **Expected result:** All three work exactly as for Olivia. Nora's own requests may need owner approval (ORG-020).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-OPS-030 · No-show from the organization side — P3

- **Tester:** Olivia
- **Before you start:** a Harbor request whose start time has passed with an accepted volunteer (e.g. TC-OPS-008's request after it ends, with
  a second volunteer who didn't check in)
- **Steps:** On that volunteer's card click **Didn't show up**.
- **Expected result:** "Recorded as a no-show." The volunteer can dispute it from their application ("I was marked as a no-show").
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:
