# 05 · Requester: asking for help and managing applicants

An individual (Rose, or Diego in "Requesting help") posts a request through the five-step wizard, publishes
it, edits, pauses, cancels or completes it, and decides on applicants. Also covers sensitive categories
(reviewed by a moderator first) and requests with a goal counted in units (e.g. 200 meals).

Setup: `pnpm db:uat`. Rose is ID-verified (S11), so she can post sensitive requests; Diego is not.
Times below are New York time; "next week" means any date 5–9 days ahead.

---

### TC-REQ-001 · Post a one-time, in-person request — P1

- **Tester:** Rose (`requester@thankyou.test`)
- **Page:** Requester home → **Ask for help** (or My requests → **New request**), `/requester/requests/new`
- **Test data:**

  | Step | Field | Value |
  | --- | --- | --- |
  | 1 Basics | Title | `Assemble a bookshelf` |
  | | Category | **Errands & chores** |
  | | What do you need? | `Flat-pack bookshelf, about an hour with two people. I have the tools and will provide water and snacks.` |
  | | Skills needed | `lifting` |
  | | Nice to have | `handy` |
  | | Volunteers needed | `2` |
  | | How soon? | **Soon** |
  | 2 When | Schedule | **One time** |
  | | Time zone | America/New York |
  | | Starts | next Saturday, `10:00` |
  | | How long each time? (minutes) | `90` |
  | 3 Where | Where does it happen? | **In person** |
  | | Area shown publicly | `Upper West Side, Manhattan, NY` |
  | | Exact address (private, optional) | `200 W 90th St, Apt 5C, New York, NY` |
  | | Access notes | `Fifth floor, elevator available.` |
  | 4 Requirements | (leave everything unticked) | |

- **Steps:**
  1. Read the red/amber note on step 1.
  2. Fill each step and click **Continue**.
  3. On step 5 (Review) check the summary, then click **Publish request**.
- **Expected result:**
  - Step 1 shows "**Not for urgent or life-threatening needs.** If someone is in danger, call your local emergency number (911 in the US)."
  - The step bar shows 1 Basics · 2 When · 3 Where · 4 Requirements · 5 Review.
  - Review lists Title, Category, Description, Skills ("lifting, handy (nice to have)"), Volunteers 2, When (Saturday
    10:00 AM EDT), Where "Upper West Side, Manhattan, NY · exact address shared after acceptance", Requirements "None",
    each with an edit link.
  - After publishing: the request page with status **Open**, "Live. Volunteers can find it and apply." and "Your request
    is live. We'll let you know when someone applies."
  - The request appears for volunteers (search `bookshelf` on `/opportunities`); the exact address is not shown there.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-002 · Save a draft and continue later — P2

- **Tester:** Rose
- **Page:** `/requester/requests/new`
- **Test data:** Title `Help me sort old photos`; Category **Something else**; What do you need? `Two boxes of printed photos to sort into albums by year.`
- **Steps:**
  1. Fill step 1 and click **Save draft**.
  2. Open My requests → **Drafts**, open the draft, click **Continue draft**.
- **Expected result:**
  - 1: "Draft saved. You can come back to it from your requests."
  - 2: Drafts lists *Help me sort old photos* (status Draft, "Only you can see this draft."); Continue draft reopens the
    wizard at the Review step. The draft is not visible to volunteers.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-003 · Publishing is blocked until required details are given — P1

- **Tester:** Rose
- **Before you start:** TC-REQ-002 draft
- **Steps:** Open the draft's Review step without adding a date or area. Try to publish.
- **Expected result:** A warning "Before publishing: …" lists what's missing (for example a start time, the public area
  for an in-person request). **Publish request** is disabled until fixed. After adding a date (step 2) and choosing
  Remote (step 3), the warning disappears and publishing works.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-004 · Wizard checks dates and fields — P2

- **Tester:** Rose
- **Page:** `/requester/requests/new`
- **Steps:**
  1. Step 1: Title `Hi` (2 letters) → Continue.
  2. Title `Fix a dripping tap`, Category **Errands & chores**, description `Short` (5 letters) → Continue.
  3. Correct the description to `The kitchen tap drips all night; I have a new washer.` → Continue. On step 2 choose One
     time, Starts next Tuesday 10:00, **Ends** next Tuesday 09:00 → Continue.
  4. On step 3 choose **In person** and leave "Area shown publicly" empty, fill Exact address `12 Elm St` → Continue,
     then go to Review.
- **Expected result:**
  - 1–2: the form refuses titles under 3 characters and descriptions under 10 characters.
  - 3: "The end time is before the start time" (shown on save or in the Review warning).
  - 4: Review warns "Add a public area (city or neighborhood) to show instead of the address" and publishing is disabled.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-005 · Remote and recurring requests — P1

- **Tester:** Diego (`dual.role@thankyou.test`), switched to **Requesting help**
- **Test data:** Title `Weekly English conversation practice`; Category **Translation & language**; Description
  `Practice English conversation with me by video, 45 minutes each time.`; Schedule **Recurring**, Starts next Monday
  18:00, Repeats on **Mon** and **Thu**, 45 minutes; Where **Remote (phone or video)**
- **Steps:** Complete the wizard and publish.
- **Expected result:** Review "When" reads "Every Mon, Thu, from …"; "Where" reads "Remote". After publishing, volunteers
  see it in the Remote tab with "Every Mon, Thu · from …".
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-006 · Flexible timing ("any time before a date") — P3

- **Tester:** Rose
- **Test data:** Title `Return library books`; Category **Errands & chores**; Description `Three books to return to the
  St. Agnes library before they're overdue.`; Schedule **Flexible**; Apply by: 10 days from today; In person, area `Upper West Side, Manhattan, NY`
- **Expected result:** Review "When" reads "Flexible, before <date>". Published cards show the flexible timing instead of a single date.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-007 · Sensitive category needs a verified account — P1

- **Tester:** Diego (Requesting help; **not** verified)
- **Page:** `/requester/requests/new`
- **Steps:** Open the Category list.
- **Expected result:** Everyday categories are selectable. The sensitive group "Sensitive — verified accounts, reviewed
  before going live" shows Help inside a home, Money & paperwork, Health & medical, Children & youth, Elderly in-home
  care, each marked "(verify your account first)" and not usable. The hint explains these are reviewed and shown only
  to verified volunteers.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-008 · Sensitive request is reviewed before going live — P1

- **Tester:** Rose (verified), then Maya (`moderator@thankyou.test`)
- **Test data:** Title `Let a volunteer in to water my plants`; Category **Help inside a home**; Description `I'm away for
  a week. Plants need watering on Tuesday and Friday; keys are with the doorman.`; One time next Tuesday 11:00, 30 minutes;
  In person, area `Upper West Side, Manhattan, NY`, exact address `250 W 85th St, Apt 3F, New York, NY`
- **Steps:**
  1. Complete the wizard. On Review read the notice, then click **Submit for review**.
  2. As a volunteer (Valerie) search `water my plants`.
  3. As Maya open Moderation and approve it (see ADM-003).
  4. As Valerie (verified) and Ravi (not verified) search again.
- **Expected result:**
  - 1: Review says "This category is reviewed by our team before it goes live, usually within a day. Only verified
    volunteers will see it." The button reads **Submit for review**. After submitting: "Submitted for review. We'll
    email you when a moderator approves it." Status shows In review, "Waiting for a moderator. Only you can see it."
  - 2: not found.
  - 4: Valerie finds it (marked "verified volunteers only"); Ravi doesn't. Rose is notified it's approved.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-009 · Moderator sends a request back for changes — P1

- **Tester:** Maya, then Rose
- **Before you start:** S-seed request *Help hanging curtains and a shelf* (waiting for review)
- **Steps:**
  1. As Maya, Moderation → the curtains request; Note to the poster `Please remove the street address from the
     description and keep it only in the private address field.`; click **Send back**.
  2. As Rose open My requests → Drafts → *Help hanging curtains and a shelf*.
- **Expected result:** Rose sees "A moderator asked for changes: Please remove the street address…" and on Review
  "Moderator note: …". She can edit and **Submit for review** again; it returns to the moderation queue.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-010 · My requests tabs — P2

- **Tester:** Rose
- **Page:** top menu → **My requests**
- **Before you start:** S1–S3
- **Expected result:** Tabs **Active**, **Drafts**, **Past**, **All** with counts. Active lists *Set up my new phone*
  (Filled), *Help me carry groceries upstairs* (Filled), *Fill in an online benefits form*, *Walk and talk in the park*
  ("2 to review"), *Ride to a medical appointment*, *Explain my electricity bill* (Open), each with area, "x/y
  volunteers" and updated date. Drafts includes *Draft: garden cleanup (not published)* and the curtains request.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-011 · Review applicants: accept, waitlist, decline — P1

- **Tester:** Rose
- **Page:** My requests → *Walk and talk in the park* → **Applicants (0/1)**
- **Before you start:** S2
- **Steps:**
  1. Read both applicant cards.
  2. **Accept** Valerie.
  3. **Waitlist** Diego.
- **Expected result:**
  - 1: "0 of 1 spots filled. Contact details unlock when you accept someone (never for volunteers under 18)." Each
    card: first name, area, completed count, reliability %, rating (Diego "5.0★ from 1 review"), "ID verified" for
    Valerie, status Pending, their message, skills, **Accept / Waitlist / Decline / Message**. No email or phone yet.
  - 2: "Accepted. They can now see the exact address and your contact details." Valerie's card shows Accepted and
    "Contact: volunteer.local@thankyou.test".
  - 3: "Waitlisted. If a spot opens they'll be offered it and have 24 hours to say yes." "1 of 1 spots filled". The
    request status becomes **Filled** ("Every spot is filled. New applicants join the waitlist.").
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-012 · Move a waitlisted applicant back, or decline — P3

- **Tester:** Rose
- **Before you start:** TC-REQ-011
- **Steps:** On Diego's waitlisted card use **Decline**. (Repeat with a fresh `pnpm db:uat` to try putting a waitlisted applicant back to review if a "reconsider" option is shown.)
- **Expected result:** "Declined. We let them know kindly." Diego is notified.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-013 · Applicants page across all requests — P2

- **Tester:** Rose
- **Page:** top menu → **Applicants** (`/requester/applications`)
- **Before you start:** S2 (fresh data)
- **Expected result:** "Pending volunteer applications across your requests." lists Valerie and Diego, each "Applied to
  Walk and talk in the park — "<message>"" with area and time.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-014 · Confirm the schedule with a volunteer — P2

- **Tester:** Rose
- **Before you start:** TC-REQ-011 (Valerie accepted)
- **Steps:** On Valerie's card change the start time to the same day at 11:00 and click **Confirm schedule**.
- **Expected result:** "Confirmed. We'll send reminders 48 hours and 2 hours before." The card shows "Scheduled … 11:00 AM
  EDT". Valerie's Schedule page lists it at 11:00.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-015 · Mark an applicant's work complete — P1

- **Tester:** Rose
- **Before you start:** TC-REQ-011
- **Steps:** On Valerie's card click **Mark complete**.
- **Expected result:** "Marked complete. Reviews are open for 14 days." Card status Completed with a **Review Valerie**
  panel. The scheduled 2 h appear in Rose's **Hours** as waiting for approval ("Marked complete by the organizer;
  scheduled time").
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-016 · Cancel an accepted volunteer — P2

- **Tester:** Rose
- **Before you start:** fresh `pnpm db:uat`, then accept Valerie on *Walk and talk in the park* and waitlist Diego
- **Steps:** On Valerie's card click **Cancel**.
- **Expected result:** "Canceled. If anyone was waitlisted, the next person was offered the spot." Diego gets the offer
  (VCM-009 box).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-017 · Record a no-show after the start time — P2

- **Tester:** Rose and a volunteer
- **Steps:**
  1. Rose posts `No-show test` (Errands & chores, in person, Upper West Side) starting **30 minutes from now**, 30 minutes long; a volunteer applies; Rose accepts.
  2. After the start time, Rose opens Applicants.
  3. Click **Didn't show up**.
- **Expected result:** 2: the **Didn't show up** button appears only after the start time. 3: "Recorded as a no-show."
  The volunteer's reliability drops on later applications, and they can dispute it (VCM/HRS dispute cases).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-018 · Edit a live request — P1

- **Tester:** Rose
- **Page:** *Walk and talk in the park* → **Edit**
- **Test data:** Title `Walk and talk in Riverside Park`
- **Steps:** Change the title on step 1 and click **Save changes**. Open the request page.
- **Expected result:** "Changes saved." The new title shows on the request page, in My requests and for volunteers.
  Applicants are kept.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-019 · Moving a live request's time tells accepted volunteers — P2

- **Tester:** Rose, Valerie
- **Before you start:** Valerie accepted on a Rose request (e.g. TC-REQ-011) and schedule confirmed (TC-REQ-014)
- **Steps:** Edit the request, step 2: move the start one day later; save.
- **Expected result:** The history shows the change. Valerie gets a notification that the time changed, her Schedule
  shows the new time, and her "I'm still coming" confirmation is asked again.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-020 · Can't reduce spots below the people already accepted — P2

- **Tester:** Rose, Valerie, Diego
- **Before you start:** TC-REQ-001 (*Assemble a bookshelf*, 2 spots)
- **Steps:**
  1. Valerie and Diego (Volunteering) each apply to *Assemble a bookshelf* (message `Happy to help.`); Rose accepts both.
  2. Rose edits the request: Volunteers needed `1` → **Save changes**.
  3. Rose cancels Diego on the Applicants page, then edits Volunteers needed to `1` again.
- **Expected result:** 2: refused with "You already accepted 2; cancel someone first or keep at least 2 spots".
  3: saved ("Changes saved."); the request shows 1 of 1 filled.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-021 · Pause and resume — P2

- **Tester:** Rose
- **Page:** *Ride to a medical appointment*
- **Steps:**
  1. Click **Pause (hide from search)**. As Valerie search `medical appointment`.
  2. Click **Resume**. Search again as Valerie.
- **Expected result:** 1: "Paused. It's hidden from search until you resume." Status Paused; Valerie can't find it.
  2: "Resumed. Volunteers can find it again." Valerie finds it.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-022 · Cancel a request — P1

- **Tester:** Rose
- **Page:** *Walk and talk in the park* (S2: two pending applicants)
- **Test data:** reason `I found a walking group at the senior center, thank you all!`
- **Steps:**
  1. Click **Cancel request** with the reason empty.
  2. Enter the reason and click Cancel request.
- **Expected result:** 1: the reason is required. 2: "Canceled. Everyone who applied was told." Status Canceled
  ("Canceled. Applicants were told."). Diego and Valerie get a notification; the request disappears from search.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-023 · Mark the whole request completed — P2

- **Tester:** Rose
- **Page:** *Help me carry groceries upstairs* (Filled, S1)
- **Steps:** Click **Mark as completed**.
- **Expected result:** "Marked complete. Volunteers have 14 days to leave a review." Status Completed, moved to Past.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-024 · Delete a draft — P3

- **Tester:** Rose
- **Page:** My requests → Drafts → *Draft: garden cleanup (not published)*
- **Steps:** Click **Delete draft**.
- **Expected result:** The draft is removed and you return to My requests; it no longer appears under Drafts.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-025 · A goal counted in units with partial offers — P1

- **Tester:** Rose, then Valerie and Diego
- **Test data (Rose):** Title `Bake cookies for the shelter`; Category **Food & meals**; Description `We need 120 homemade
  cookies for Friday's shelter dinner. Any amount helps.`; Volunteers needed `4`; Goal: Amount `120`, Counted in
  `cookies`, Smallest useful offer `12`; One time next Friday 16:00, 60 minutes; In person, area `Upper West Side, Manhattan, NY`
- **Steps:**
  1. Rose publishes it.
  2. Valerie opens it: offers `5` (below the minimum) with message `Can bake a few!`, then `48`.
  3. Diego offers `60` with message `I'll bake two batches.`
  4. Rose opens Applicants: accepts Valerie's 48; for Diego changes the amount box to `50` and accepts.
- **Expected result:**
  - The opportunity shows "Goal: 120 cookies · 0 promised · 120 still needed", a progress bar, and "You can offer part
    of it (at least 12 cookies)."; the apply form asks "How much can you offer? (cookies)".
  - 2: `5` is refused ("The smallest useful offer is 12 cookies"); `48` is sent.
  - 4: each card shows "Offered: 48 cookies"; after accepting, "accepted 48 cookies" and "accepted 50 cookies"; the
    request page Goal line shows 98 promised · 22 still open.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-REQ-026 · Requester home — P2

- **Tester:** Rose
- **Page:** top menu → **Home** (`/requester/dashboard`)
- **Before you start:** fresh `pnpm db:uat`
- **Expected result:** "Hi, Rose" with **Ask for help** and **Inbox**; tiles Open requests, Applicants to review **2**,
  Upcoming, Unread conversations, Your rating **5.0 ★** (1 review); "New applicants" lists Valerie and Diego for *Walk
  and talk in the park*; "Recent messages" shows the latest conversation lines (e.g. "Thank you, Valerie. Press 4B. See
  you Thursday!").
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:
