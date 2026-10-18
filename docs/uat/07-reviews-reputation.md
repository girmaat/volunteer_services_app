# 07 · Reviews and reputation

After work is marked complete, the volunteer and the organizer each leave a structured review. Reviews are
**double-blind**: neither sees the other's review until both have submitted (or 14 days pass); then they're
published and can't be edited. Reputation shows on profiles, applicant cards (rating, reliability) and the
requester's Reviews pages. Badges reward milestones.

Setup: `pnpm db:uat`. S1 = Valerie already reviewed Rose; Rose hasn't reviewed Valerie. S3 = both reviews
published for Diego ⇄ Rose.

---

### TC-REV-001 · Organizer sees that a review is waiting, but not its content — P1

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/requester/requests` → *Help me carry groceries upstairs* → **Applicants**
- **Before you start:** S1
- **Expected result:** Valerie's card (Completed) has a **Review Valerie** panel with Overall (1–5), Reliability (optional),
  Communication (optional), Skill for the task (optional), "Comment (optional, public)", "Work together again? Yes / No",
  the line "Reviews stay hidden until you both submit (or 14 days pass), then they can't be edited." and **Submit review**.
  Below: "Valerie has reviewed you. You'll see it once yours is in." Valerie's comment is **not** visible.

### TC-REV-002 · Submitting the second review publishes both — P1

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`), then Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** Rose: `http://localhost:3202/requester/requests` → *Help me carry groceries upstairs* → **Applicants**; Valerie: `http://localhost:3202/volunteer/applications` → *Help me carry groceries upstairs*
- **Before you start:** S1
- **Test data:** Overall **5**, Reliability **5**, Skill for the task **4**, Comment `Valerie was on time and very careful with the eggs.`, Work together again **Yes**
- **Steps:**
  1. Submit Overall empty (only a comment).
  2. Fill everything and click **Submit review**.
  3. Valerie opens My applications → *Help me carry groceries upstairs*.
- **Expected result:**
  - 1: refused — Overall is required.
  - 2: "Review saved."; the panel says "You rated 5/5. Both reviews are published." and shows "Valerie's review of you: 5/5"
    with "Rose had everything ready and explained exactly what she needed."
  - 3: Valerie sees "the organizer's review of you: 5/5" with Rose's comment; the edit form is gone.

### TC-REV-003 · First reviewer can update until it's published — P2

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/applications` → open *Help me carry groceries upstairs*
- **Before you start:** S1 (fresh, Rose hasn't reviewed)
- **Steps:** The panel shows her 5/5. Change Overall to **4**, add comment `Clear instructions, buzzer worked.`, click **Update review**.
- **Expected result:** "Review saved." Panel: "You rated 4/5. Published when the organizer reviews you or on <date 14 days after completion>."

### TC-REV-004 · Published reviews can't be changed — P2

- **Tester:** Diego (`dual.role@volunteer-services-app.test` / `Password!`) (Volunteering)
- **Page:** `http://localhost:3202/volunteer/applications` → open *Set up my new phone* (switcher on **Volunteering**)
- **Before you start:** S3
- **Expected result:** "Both reviews are published." with both ratings/comments shown and **no** Update review button. If
  Diego believes a review is unfair, the page offers **Something wrong? Open a dispute** with "A review about me".

### TC-REV-005 · Reviews open only after completion — P2

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/applications` → open *Saturday distribution shift* (Accepted, not completed)
- **Expected result:** No review panel. (Reviews appear only once the organizer marks the work complete.)

### TC-REV-006 · Requester reputation pages — P1

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/requester/reputation` (top menu → **Reviews**), tabs `/requester/reputation/reviews` and `/requester/reputation/reviews-given`
- **Before you start:** S3
- **Expected result:**
  - Overview: "Reviews received ★★★★★ 5.0 · 1 total" and "Reviews given 1 · Sent to volunteers"; tabs Overview,
    Reviews received, Reviews given.
  - **Reviews received:** "5/5 Diego · <date> · Set up my new phone — What went well: Friendly and well organized. Would work again: Yes".
  - **Reviews given:** "5/5 · <date> · Set up my new phone — Diego was patient and moved everything over in an hour."

### TC-REV-007 · Ratings and reliability on applicant cards — P1

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/requester/requests` → *Walk and talk in the park* → **Applicants**
- **Before you start:** S2, S3
- **Expected result:** Diego's card shows "1 completed · 100% reliable · 5.0★ from 1 review". Valerie's card shows "1 completed ·
  100% reliable" and "ID verified" (no rating yet, since Rose hasn't reviewed her). New volunteers show "New volunteer".

### TC-REV-008 · Volunteer sees reviews on Impact — P2

- **Tester:** Diego (`dual.role@volunteer-services-app.test` / `Password!`) (Volunteering)
- **Page:** `http://localhost:3202/volunteer/history#reviews` (top menu → **Impact**)
- **Before you start:** S3
- **Expected result:** "What people said" shows Rose's review: 5/5 and "Diego was patient and moved everything over in an hour."
  (Valerie on fresh data sees "Reviews appear here after you and the organizer both leave one.")

### TC-REV-009 · Reviews publish on their own after 14 days — P3

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), who reviewed Rose in S1, and Rose (`requester@volunteer-services-app.test` / `Password!`), who hasn't
- **Page:** Rose: `http://localhost:3202/requester/requests` → *Help me carry groceries upstairs* → **Applicants**, 14 days after completion
- **Steps:** Leave a single review unanswered for 14 days (or have the test environment's clock moved), then wait for the
  hourly job.
- **Expected result:** The submitted review is published to its subject; the other side can no longer review.

### TC-REV-010 · Badges — P3

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/history#badges` (Impact → Badges)
- **Before you start:** S1 (Valerie completed one engagement)
- **Expected result:** "First completed opportunity — Earned <date>" and the next badge with progress, e.g. "Next: 5 completed
  opportunities 1 of 5". A notification "badge earned" links to Impact (`/volunteer/history#badges`).
