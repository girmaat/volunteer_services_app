# 04 · Volunteer: applications and commitments

What happens after applying: the applications list, the application page, what an accepted volunteer
sees, confirming attendance, the schedule and calendar file, cancelling (early and late), waitlist offers
and withdrawing.

Setup: `pnpm db:uat`. Two browser sessions help: the volunteer in one, the organizer in the other.

---

### TC-VCM-001 · My applications lists active and past applications — P1

- **Tester:** Valerie (`volunteer.local@thankyou.test`)
- **Page:** top menu → **My applications** (`/volunteer/applications`)
- **Before you start:** S1, S2, S4, S5
- **Expected result:**
  - "Track where you've applied. Addresses and contact details appear once you're accepted."
  - **Active:** *Deliver meals to homebound seniors* — Accepted; *Saturday distribution shift* — Accepted; *Walk and
    talk in the park* — Pending ("Individual requester"). Each shows poster, mode, area and "updated" date.
  - **Past:** *Help me carry groceries upstairs* — Completed.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-002 · Accepted volunteers see the exact address — P1

- **Tester:** Valerie
- **Page:** My applications → *Saturday distribution shift*
- **Before you start:** S4
- **Expected result:**
  - Header shows status **Accepted** and "Harbor Food Bank", with **Messages** and **View opportunity**.
  - "When: Sat, … 2:00 PM EDT"; "Where: **87-10 Queens Blvd, Elmhurst, NY**".
  - "Your message: I've done food distribution before and can lift boxes."
  - Right column: **I'm still coming**, and "Can't make it? Cancel as early as you can so they can find someone else."
    with a note box and **Cancel my spot**.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-003 · Pending applicants don't see the exact address — P1

- **Tester:** Diego (`dual.role@thankyou.test`, Volunteering)
- **Page:** My applications → *Saturday distribution shift*
- **Before you start:** S4
- **Expected result:** Status **Pending**. "Where: Queens, NY 🔒 exact address after you're accepted". The street
  address does not appear anywhere on the page. A **Withdraw application** button is shown.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-004 · Confirm "I'm still coming" — P1

- **Tester:** Valerie
- **Page:** *Saturday distribution shift* application
- **Steps:** Click **I'm still coming**.
- **Expected result:** "Thanks for confirming. See you there!" The box now reads "You confirmed you're coming. Thank
  you!". The organizer's applicant card shows "· confirmed they're coming" next to the scheduled time (check as
  Olivia on the request's Applicants page once the schedule is confirmed, TC-VCM-005).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-005 · Organizer confirms the schedule; it appears in the volunteer's Schedule and calendar file — P1

- **Tester:** Olivia (`org.admin@thankyou.test`), then Valerie
- **Page:** Olivia: Requests → *Saturday distribution shift* → **Applicants**. Valerie: top menu → **Schedule**.
- **Steps:**
  1. As Olivia, on Valerie's card keep the start time as shown and click **Confirm schedule**.
  2. As Valerie, open **Schedule** (`/volunteer/calendar`).
  3. Open the *Saturday distribution shift* application and click **Add to calendar (.ics)**; open the downloaded file.
- **Expected result:**
  - 1: "Confirmed. We'll send reminders 48 hours and 2 hours before." The card shows "Scheduled Sat, … 2:00 PM EDT".
  - 2: Schedule lists *Saturday distribution shift* with its date/time, "in-person · Queens, NY", a status and **View opportunity**.
  - 3: a `.ics` file downloads; opening it in a calendar app adds "Saturday distribution shift" at the right date and time.
  - The volunteer home's **Upcoming** tile now counts 1 confirmed shift.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-006 · Reminder before a confirmed shift — P2

- **Tester:** Rose (`requester@thankyou.test`) and a new volunteer
- **Before you start:** a volunteer account that has finished onboarding (e.g. `uat.vol1@example.test` from ACC-008).
- **Steps:**
  1. As Rose post and publish `Reminder test: water plants` (Errands & chores, in person, Upper West Side, Manhattan, NY)
     starting **47 hours from now**.
  2. As the volunteer, apply (message `I can do it.`). As Rose accept, then **Confirm schedule**.
  3. Wait up to 15 minutes (reminder job).
  4. As the volunteer, open the bell.
- **Expected result:** A notification "… starts in 2 days" (or similar) opens the application, where **I'm still coming**
  is offered. The API terminal shows an attendance-reminder email whose subject contains the title.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-007 · Cancel a spot early — P1

- **Tester:** Valerie
- **Page:** My applications → *Deliver meals to homebound seniors* (starts in 2 days)
- **Test data:** note `My car is in the shop this week, sorry!`
- **Steps:** Type the note, click **Cancel my spot**.
- **Expected result:**
  - "You've canceled. The organizer was told and the next person on the waitlist moved up."
  - Status becomes Canceled; the application moves to Past.
  - The page did **not** warn about a late cancellation (more than 24 hours before the start).
  - Olivia gets a notification; the request goes back to needing volunteers.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-008 · Late cancellation is flagged — P2

- **Tester:** Rose and a volunteer (e.g. `uat.vol1@example.test`)
- **Steps:**
  1. As Rose post and publish `Late cancel test: carry a box` (Errands & chores, in person, Upper West Side) starting
     **about 10 hours from now**.
  2. Volunteer applies; Rose accepts.
  3. As the volunteer open the application.
  4. Click **Cancel my spot** with note `Sorry, something came up.`
- **Expected result:**
  - 3: "It starts within 24 hours, so this counts as a late cancellation on your reliability."
  - 4: canceled; Rose's applicant list shows the volunteer's reliability reflects a late cancel (reliability % below 100
    on later applications).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-009 · Waitlisted volunteer is offered a freed spot — P1

- **Tester:** Rose, Diego, Valerie
- **Page:** Rose: *Walk and talk in the park* → Applicants
- **Before you start:** S2 (Diego and Valerie pending, 1 spot)
- **Steps:**
  1. As Rose, **Accept** Valerie and **Waitlist** Diego.
  2. As Valerie, cancel her spot on *Walk and talk in the park* (note optional).
  3. As Diego (Volunteering), open My applications → *Walk and talk in the park*.
- **Expected result:**
  - 1: "Waitlisted. If a spot opens they'll be offered it and have 24 hours to say yes." Rose sees "1 of 1 spots filled".
  - 3: a highlighted box "A spot opened up. Do you want it?" with "It's held for you until …" and **Yes, I'll take it** / **No thanks**.
    Diego is never added without saying yes.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-010 · Accept a waitlist offer — P1

- **Tester:** Diego
- **Before you start:** TC-VCM-009
- **Steps:** Click **Yes, I'll take it**.
- **Expected result:** "The spot is yours. See you there!" Status **Accepted**; the exact address/area details for an
  accepted volunteer are shown. Rose's applicants list shows Diego Accepted.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-011 · Decline a waitlist offer — P2

- **Tester:** Rose and two new volunteers (or re-run `pnpm db:uat` and repeat TC-VCM-009 steps 1–3)
- **Steps:** In the offer box, click **No thanks**.
- **Expected result:** "No problem. We've offered it to the next person." The application is no longer offered a spot;
  if someone else is waitlisted, they receive the offer.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-012 · An unanswered offer expires after 24 hours — P3

- **Before you start:** an offer as in TC-VCM-009, left unanswered.
- **Steps:** Check the offer after 24 hours (plus up to one hour for the hourly job).
- **Expected result:** The offer is gone for that volunteer ("It's held for you until …" time has passed) and the spot
  goes to the next waitlisted person or is open again.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-013 · Withdraw a pending application — P1

- **Tester:** Tara (`teen.volunteer@thankyou.test`)
- **Page:** My applications → *Saturday distribution shift* (Pending, S4)
- **Steps:** Click **Withdraw application**.
- **Expected result:** "Application withdrawn." Status changes to Withdrawn and it moves to Past. Harbor's applicant
  list no longer counts Tara as waiting.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VCM-014 · Declined applicants are told kindly — P2

- **Tester:** Olivia, then Diego
- **Page:** Olivia: Applicants (`/org/applications`) → To review
- **Before you start:** S4
- **Steps:**
  1. As Olivia, click **Decline** on Diego's application to *Saturday distribution shift*.
  2. As Diego, open the bell and My applications.
- **Expected result:**
  - 1: "Declined. We let them know kindly."
  - 2: a notification about the application, and the application shows status Declined (in Past). Diego can still
    browse and apply to other opportunities.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:
