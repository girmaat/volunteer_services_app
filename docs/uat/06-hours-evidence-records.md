# 06 · Hours, evidence, disputes and verified records

How volunteer time is recorded and trusted: hours arrive (marked complete, check-out, or reported by the
volunteer), a reviewer approves, changes, sends back or declines them, the volunteer can dispute, attach
evidence, see totals on **Impact**, export a CSV and share a **verified record** anyone can check.

Rules to look for: **only approved hours count**; every change needs a note the volunteer sees; nobody approves
their own hours; only verified organizations approve; goods never count as hours.

Setup: `pnpm db:uat`. Ready-made: S1 (Rose has 2 h to approve for Valerie), S3 (Diego has 2 approved hours),
S5 (Harbor has 2.5 h to approve for Valerie).

---

### TC-HRS-001 · Volunteer's Impact page — P1

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/history` (top menu → **Impact**)
- **Before you start:** S1, S5
- **Expected result:**
  - "Hours count once the organizer approves them. Waiting and self-reported hours are shown separately." with links
    **Share a verified record**, **Export CSV** and **Share**.
  - Totals: **Approved hours 0**, **Waiting for approval 4.5 h**, Times you helped, Badges.
  - "Your volunteering" lists *Deliver meals to homebound seniors* (Harbor Food Bank · 0 h approved · 2.5 h waiting —
    "Reported by the volunteer", "Delivered 12 meals on the Astoria route.") and *Help me carry groceries upstairs*
    (Helped Rose · 2 h waiting — "Marked complete by the organizer; scheduled time").
  - Each entry has **Add evidence** and **Report time you gave**. "Service outside Volunteer Services" and "Badges" sections follow.

### TC-HRS-002 · Reviewer's hours queue — P1

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/requester/hours` (top menu → **Hours**)
- **Before you start:** S1
- **Expected result:**
  - "Volunteer hours — Approve the time people gave. Only approved hours count on a volunteer's record; anything you
    change or turn down needs a short note they'll see."
  - Tabs **Waiting (1)**, Disputed, Decided.
  - Entry "Valerie · Help me carry groceries upstairs", date and 2:00–4:00 PM, "Marked complete by the organizer;
    scheduled time", status Waiting for approval, "Reported: 2 h", buttons **Approve 2 h** and "Change, send back or decline".

### TC-HRS-003 · Approve hours — P1

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`), then Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** Rose: `http://localhost:3202/requester/hours`; Valerie: `http://localhost:3202/volunteer/history`
- **Before you start:** S1
- **Steps:**
  1. Click **Approve 2 h**.
  2. Open the **Decided** tab.
  3. As Valerie open Impact.
- **Expected result:**
  - 1: "Approved. It now counts on the volunteer's record." The Waiting tab is empty ("Nothing to approve").
  - 2: the entry shows "Approved: 2 h" and a "Correct this decision" option.
  - 3: **Approved hours 2**; the groceries entry reads "2 h approved"; Waiting drops to 2.5 h. Valerie gets a notification.

### TC-HRS-004 · Approve with a change (needs a note) — P1

- **Tester:** Olivia (`org.admin@volunteer-services-app.test` / `Password!`), then Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** Olivia: `http://localhost:3202/org/hours` (Organization → **Hours**); Valerie: `http://localhost:3202/volunteer/history`
- **Before you start:** S5
- **Test data:** Hours to approve `2`; Note `The route sheet shows 2 hours, so I approved 2.`
- **Steps:**
  1. Open "Change, send back or decline" on Valerie's 2.5 h entry. Enter `2` and click **Approve with this change** with
     the note empty.
  2. Add the note and click Approve with this change.
  3. As Valerie open Impact.
- **Expected result:**
  - Before acting, the entry lists the warning "Reported by the volunteer, not from attendance".
  - 1: the note is required.
  - 2: "Saved with your change. The volunteer sees your note."
  - 3: the meals entry shows "2 h approved (you reported 2.5 h)" and "Reviewer's note: The route sheet shows 2 hours, so
    I approved 2." with a **Disagree with this?** option.

### TC-HRS-005 · Send hours back to fix, and resubmit — P1

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`), then Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** Rose: `http://localhost:3202/requester/hours`; Valerie: `http://localhost:3202/volunteer/history`
- **Before you start:** S1 (fresh)
- **Test data:** Rose's note `Please add the actual start and end time — it took less than 2 hours.`; Valerie's fix: Date = the
  groceries date, From `17:30`, To `18:45`, Note `Started 5:30 pm, finished by 6:45.`
- **Steps:**
  1. Rose: "Change, send back or decline" → note → **Send back to fix**.
  2. Valerie: Impact → the groceries entry shows the note and a "Fix and send it back" form; enter the fix → **Send for approval**.
  3. Rose: Hours → Waiting.
- **Expected result:**
  - 1: "Sent back to the volunteer to fix."
  - 2: Valerie sees "Reviewer's note: Please add the actual start…"; after sending: "Sent back for approval."
  - 3: the entry is back in Waiting with 1.25 h and the new times.

### TC-HRS-006 · Decline hours, and the volunteer disputes — P1

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`), Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), then Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** Rose: `http://localhost:3202/requester/hours`; Valerie: `http://localhost:3202/volunteer/history`; Ada: `http://localhost:3202/admin/moderation` (disputes)
- **Before you start:** S1 (fresh)
- **Test data:** Rose's note `I don't think the carrying took place on this date.`; Valerie's dispute `I carried the groceries on Thursday at 5:30 pm; Rose thanked me in our messages.`
- **Steps:**
  1. Rose: "Change, send back or decline" → note → **Don't approve**.
  2. Valerie: Impact → groceries entry → **Disagree with this?** → enter the dispute text → **Ask for a second look**.
  3. Rose: Hours → **Disputed** tab.
  4. Ada: Admin → Moderation → **Disputes** (see ADM-009).
- **Expected result:**
  - 1: "Marked not approved. The volunteer sees your note and can dispute it."
  - 2: "Dispute sent. Someone who wasn't part of the decision will look at it." Status Disputed.
  - 3: the entry shows "Disputed after your decision: another reviewer decides" and Rose can't decide it again.
  - 4: the dispute is in the platform disputes queue for staff to resolve.

### TC-HRS-007 · Volunteer reports time for an engagement — P1

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), then Olivia (`org.admin@volunteer-services-app.test` / `Password!`)
- **Page:** Valerie: `http://localhost:3202/volunteer/history` → *Deliver meals to homebound seniors* → **Report time you gave**; Olivia: `http://localhost:3202/org/hours`
- **Before you start:** S5
- **Test data:** Date = yesterday; From `09:00`; To `11:15`; What did you do? `Packed meal bags at the pantry before the route.`
- **Steps:**
  1. Fill only "What did you do?" and click **Send for approval**.
  2. Fill the date and times, Send for approval.
  3. Olivia: Hours → Waiting.
- **Expected result:**
  - 1: "Describe what you did and give the hours or the start and end time" (or the browser asks for the time).
  - 2: "Sent for approval. It counts once the organizer approves it." The entry shows 2.25 h reported, Waiting for approval.
  - 3: a new entry for Valerie with yesterday 9:00–11:15 AM, "Reported by the volunteer".

### TC-HRS-008 · Time can't be in the future, reversed or over 24 hours — P2

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/history` → any engagement → **Report time you gave**
- **Steps:** Try (a) tomorrow 09:00–10:00; (b) yesterday From 11:00 To 10:00; (c) hours `30`.
- **Expected result:** (a) "You can only report time that already happened"; (b) "The end must be after the start, within
  24 hours"; (c) refused (24 hours maximum). Nothing is saved.

### TC-HRS-009 · Overlapping time is flagged for the reviewer — P2

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), then Olivia (`org.admin@volunteer-services-app.test` / `Password!`)
- **Page:** Valerie: `http://localhost:3202/volunteer/history` → *Saturday distribution shift* → Report time you gave; Olivia: `http://localhost:3202/org/hours`
- **Before you start:** TC-HRS-007 (yesterday 9:00–11:15 reported)
- **Steps:** Report another entry on *Saturday distribution shift* (after it's accepted, S4) for yesterday 10:00–12:00, note
  `Helped set up tables.`; then open Olivia's Hours.
- **Expected result:** The new entry shows "Overlaps other hours for this volunteer" and is left out of "Approve ticked".

### TC-HRS-010 · Approve several entries together — P2

- **Tester:** Olivia (`org.admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/org/hours`
- **Before you start:** at least two Waiting entries without warnings (e.g. two volunteers checked in and out in OPS-009, or two
  "marked complete" entries)
- **Steps:** Tick the entries that look right and click **Approve ticked**.
- **Expected result:** "Tick the entries that look right, then approve them together. Entries with something to check are left
  out." After approving: "Done."; the ticked entries move to Decided. Entries with warnings had no tick box.

### TC-HRS-011 · Declare a conflict and pass to another reviewer — P2

- **Tester:** Olivia (`org.admin@volunteer-services-app.test` / `Password!`), then Nora (`org.manager@volunteer-services-app.test` / `Password!`)
- **Page:** Olivia, then Nora: `http://localhost:3202/org/hours`
- **Before you start:** S5
- **Test data:** How you know them `She's my neighbour.`
- **Steps:**
  1. Olivia: on Valerie's entry open **I can't review this person**, enter the relationship, click **Pass to another reviewer**.
  2. Olivia reloads Hours. 3. Nora opens Hours.
- **Expected result:** 1: "Noted. Another reviewer will decide on this volunteer's hours." 2: Olivia sees "You declared a
  conflict with this volunteer" and no approve buttons for Valerie. 3: Nora can approve it.

### TC-HRS-012 · Only verified organizations approve hours — P1

- **Tester:** Ravi (`volunteer.remote@volunteer-services-app.test` / `Password!`), then Olivia (`org.admin@volunteer-services-app.test` / `Password!`) switched to **Bright Futures Tutoring** (not verified)
- **Page:** Ravi: `http://localhost:3202/volunteer/history`; Olivia (switcher → Bright Futures Tutoring): `http://localhost:3202/org/hours`
- **Steps:**
  1. Ravi applies to *Algebra tutoring (grade 8)* (message `I can tutor on Mondays.`).
  2. Olivia switches organization (switcher at the top right) to Bright Futures Tutoring, opens the request's Applicants, **Accept**,
     then **Mark complete**.
  3. Olivia opens **Hours**.
- **Expected result:** The entry is listed, but instead of approve buttons: "Your organization must be verified to approve
  hours" with a **Finish verification** link to Organization settings.

### TC-HRS-013 · Correct a decision after the fact — P3

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/requester/hours` → **Decided** tab
- **Before you start:** TC-HRS-003 (2 h approved)
- **Test data:** Hours `1.5`; note `Correcting: we finished early, 1.5 hours.`
- **Steps:** Decided tab → **Correct this decision** → enter hours and note → **Approve with this change**.
- **Expected result:** "Saved with your change…". Valerie's approved hours become 1.5; any record that included these hours
  now says the hours were corrected (see TC-HRS-024).

### TC-HRS-014 · Add a link as evidence — P1

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), then Olivia (`org.admin@volunteer-services-app.test` / `Password!`)
- **Page:** Valerie: `http://localhost:3202/volunteer/history` → *Deliver meals to homebound seniors* → **Add evidence**; Olivia: `http://localhost:3202/org/hours`
- **Before you start:** S5 (still waiting for approval)
- **Test data:** Link `https://example.org/route-sheet-oct`; Label `Route sheet`
- **Steps:**
  1. Click **Add** with both Link and file empty.
  2. Enter the link and label, click **Add**.
  3. Olivia opens Hours.
- **Expected result:**
  - 1: "Add a link or choose a file".
  - 2: "Evidence added. Your reviewer can see it." A **Route sheet** link appears under the entry with **Remove**.
  - 3: Olivia sees the **Route sheet** link on Valerie's entry; it opens example.org in a new tab.

### TC-HRS-015 · Upload a file as evidence — P1

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), then Olivia (`org.admin@volunteer-services-app.test` / `Password!`)
- **Page:** Valerie: `http://localhost:3202/volunteer/history` → *Deliver meals to homebound seniors* → **Add evidence**; Olivia: `http://localhost:3202/org/hours`
- **Test data:** a small PDF or PNG from your computer (under 5 MB), Label `Sign-in sheet photo`
- **Steps:** Add evidence → choose the file, label → **Add**. Olivia: Hours → click the file link.
- **Expected result:** "Evidence added…"; the file shows as **Sign-in sheet photo**; clicking it downloads the same file for
  Valerie and for Olivia.

### TC-HRS-016 · Unsafe evidence is refused — P2

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/history` → any engagement → **Add evidence**
- **Test data:** (a) a file renamed to `notes.html`; (b) a file larger than 5 MB; (c) link `javascript:alert(1)`
- **Expected result:** (a) "That file type isn't allowed."; (b) "Files can be up to 5 MB."; (c) refused ("Add a link that
  starts with https://" or the browser's URL check). Nothing is attached.

### TC-HRS-017 · Remove evidence; evidence locks after a decision — P2

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/history` → *Deliver meals to homebound seniors*
- **Before you start:** TC-HRS-014
- **Steps:**
  1. Click **Remove** next to Route sheet.
  2. Add it again; have Olivia approve the entry; reopen Impact.
- **Expected result:** 1: "Evidence removed." 2: after approval there's no Add evidence or Remove for that entry (the
  evidence is part of the record); Olivia still sees the evidence on the Decided tab.

### TC-HRS-018 · Other people can't see someone's evidence — P1

- **Tester:** Ravi (`volunteer.remote@volunteer-services-app.test` / `Password!`); Marcus (`org.member@volunteer-services-app.test` / `Password!`)
- **Page:** the evidence file address copied in TC-HRS-015 (it looks like `http://localhost:3202/hours/evidence/<contribution id>/<file id>`), opened by each tester
- **Before you start:** TC-HRS-015 (copy the file link address while signed in as Valerie)
- **Steps:** Open the copied file address as Ravi, then as Marcus.
- **Expected result:** "Not found" for both. (Only Valerie and Harbor's admins and managers can open it.)

### TC-HRS-019 · Record service done outside Volunteer Services — P2

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/history` → **Service outside Volunteer Services** → **Add service from elsewhere**
- **Test data:** Date = last Saturday; hours `3`; What and where? `Beach clean-up with the Jersey City Parks crew`
- **Steps:** Fill in and click **Save as self-reported**.
- **Expected result:** "Saved as self-reported." The entry appears under Service outside Volunteer Services with status
  Self-reported. **Approved hours** do not change; it is not sent to any reviewer.

### TC-HRS-020 · Export Impact as CSV — P2

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/history` → **Export CSV**
- **Before you start:** TC-HRS-003, TC-HRS-019
- **Expected result:** A CSV downloads. The header row includes date, status and approved hours columns; each entry is a row
  with its status (e.g. "approved", "pending", "self-reported"); approved and waiting hours are separate columns.

### TC-HRS-021 · Records need approved hours — P2

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`) (fresh `pnpm db:uat`: no approved hours)
- **Page:** `http://localhost:3202/volunteer/records/new` (`http://localhost:3202/volunteer/history` → **Share a verified record** → **Make a record**)
- **Expected result:** "No approved hours yet — Records hold only hours an organizer approved. Waiting and self-reported hours
  can't go on one." with **Back to Impact**.

### TC-HRS-022 · Create a verified record — P1

- **Tester:** Diego (`dual.role@volunteer-services-app.test` / `Password!`, Volunteering)
- **Page:** `http://localhost:3202/volunteer/records/new` (`http://localhost:3202/volunteer/history` → Share a verified record → **New record**)
- **Before you start:** S3 (2 approved hours for *Set up my new phone*)
- **Test data:** include *Set up my new phone*; Name to show **My full name (schools usually need this)**; Link works for **30 days**
- **Steps:**
  1. Choose the options and click **Preview**.
  2. Read "Check what they'll see". Tick "I want to share this, including my full name, with anyone who has the link until …".
  3. Click **Create link**.
- **Expected result:**
  - 2: a table with the request, organizer, date and approved hours (2) and the name **Diego Alvarez**.
  - 3: "Record ready. Copy the link and send it." with a **Record link** box (`http://localhost:3202/verify/…`).
  - Verified records lists it with status "Anyone with the link can see it."

### TC-HRS-023 · Anyone with the link can check the record — P1

- **Tester:** Visitor (signed out, no login needed; use a private window)
- **Page:** the record link from TC-HRS-022, which looks like `http://localhost:3202/verify/<token>`
- **Expected result:** "Check a volunteer record" showing **"Valid record, issued by Volunteer Services"**, "Volunteer service record" for
  Diego Alvarez with the same table, and "This is a copy of the record as it was issued. If any of these hours are corrected
  later, this page will say so." No email, phone or other activity is shown.

### TC-HRS-024 · A record says when its hours were corrected — P2

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`), then Visitor, then Diego (`dual.role@volunteer-services-app.test` / `Password!`)
- **Page:** Rose: `http://localhost:3202/requester/hours` → **Decided**; Visitor: the record link `http://localhost:3202/verify/<token>`; Diego: `http://localhost:3202/volunteer/records`
- **Before you start:** TC-HRS-022
- **Steps:**
  1. Rose: Hours → Decided → Diego's phone set-up → **Correct this decision**: hours `1.5`, note `Correcting the time to 1.5 h.` → Approve with this change.
  2. Visitor reloads the record link.
  3. Diego opens Verified records.
- **Expected result:** 2: "Not a valid record right now — These hours were corrected. An organizer changed hours on this record
  after it was issued…". 3: the record shows **Out of date** with **Make an updated record**.

### TC-HRS-025 · Turn a record link off — P1

- **Tester:** Diego (`dual.role@volunteer-services-app.test` / `Password!`), then Visitor
- **Page:** Diego: `http://localhost:3202/volunteer/records`; Visitor: the record link `http://localhost:3202/verify/<token>`
- **Before you start:** a valid record (TC-HRS-022 on fresh data)
- **Steps:** Verified records → **Turn off link**. Visitor reloads the link.
- **Expected result:** "Turned off. The link no longer shows your hours." The visitor sees "This record was turned off — The
  volunteer turned this link off. Ask them for a new one if you still need it." with no table.

### TC-HRS-026 · Wrong or partial record links — P3

- **Tester:** Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/verify/abc123`
- **Expected result:** "We can't find this record — Check the link was copied in full." No error page.
