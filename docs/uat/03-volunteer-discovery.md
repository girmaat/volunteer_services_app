# 03 · Volunteer: finding opportunities and applying

The volunteer's home, the four lists under **Find opportunities** (Recommended, Near you, Remote, Saved),
matching reasons, filters, saved searches with alerts, the opportunity page, eligibility rules and applying.

Setup: `pnpm db:uat`. Most cases use Valerie (in person only, has a car, ID-verified, Jersey City) and Ravi
(remote only, no car, not verified, Hoboken). Password for both: `Password!`.

---

### TC-VDS-001 · Volunteer home — P1

- **Tester:** Valerie (`volunteer.local@thankyou.test`)
- **Page:** `/volunteer/dashboard` (top menu → Home)
- **Before you start:** S1, S4, S5, S10
- **Expected result:**
  - "Hi, Valerie" with a **Find opportunities** button.
  - Tiles: **Applications in progress 3** (two accepted, one pending), **Upcoming** (confirmed shifts), **Unread
    messages**, **Saved 2**.
  - "Picked for you" shows up to four opportunities with area and distance, and **See all** opens Recommended.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-002 · "Picked for you" cards show when each opportunity happens — P3

- **Tester:** Valerie
- **Page:** Volunteer home
- **Expected result:** Each card under "Picked for you" shows its date and time (e.g. "Wed, Oct 14, 2:00 PM"), the same
  as on the Recommended list. Known issue **K5**: the cards say "Flexible".
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-003 · Recommended list explains each match — P1

- **Tester:** Valerie
- **Page:** top menu → **Find opportunities** (opens Recommended, `/volunteer/opportunities/recommended`)
- **Expected result:**
  - Heading "Recommended for you — Ranked by your skills, causes, schedule and distance." with tabs Recommended,
    Near you, Remote, Saved.
  - *Deliver meals to homebound seniors* is first or near the top, with "Why it matches: 3 of 3 skills · 7 mi ·
    fits your Wednesdays".
  - In-person cards show the area with distance (e.g. "Astoria, NY · 7 mi"); each shows poster, category, date and
    spots left.
  - *Help hanging curtains and a shelf* (waiting for review) and *Draft: garden cleanup* never appear.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-004 · Near you respects the travel radius — P1

- **Tester:** Valerie
- **Page:** Find opportunities → **Near you**
- **Test data:** Within **2 miles**, then **25 miles**
- **Steps:**
  1. Open Near you (default radius 15 miles from Valerie's profile).
  2. Set Within = 2 miles → **Show results**.
  3. Set Within = 25 miles → Show results.
- **Expected result:**
  - Heading "Near you — In-person opportunities within your travel radius." Only in-person/hybrid items, sorted by distance.
  - 2 miles: only items in Jersey City / Hoboken (e.g. *Community garden weeding* "under 1 mi", *After-school homework
    club helpers*, *Ride to a medical appointment* 2 mi).
  - 25 miles: also Queens and Manhattan items (e.g. *Saturday distribution shift* 13 mi). No remote items.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-005 · Remote tab shows only remote work — P1

- **Tester:** Ravi (`volunteer.remote@thankyou.test`)
- **Page:** Find opportunities → **Remote**
- **Expected result:**
  - Heading "Remote opportunities — Help from anywhere by phone or video."
  - Lists Bright Futures Tutoring items (Algebra tutoring, Reading buddy, College essay feedback, Mock job interview
    practice, Build a simple sign-up page, Spanish–English homework help, Weekly ESL conversation circle), Harbor's
    *Translate a flyer to Spanish* and *Pantry inventory spreadsheet cleanup*, Rose's *Fill in an online benefits form*.
  - No in-person item. **No *Explain my electricity bill*** (sensitive, Ravi isn't ID-verified).
  - Cards say "Why it matches: your time zone", and tutoring/Spanish items mention matching skills.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-006 · ID-verified volunteers also see sensitive requests — P1

- **Tester:** Valerie (ID-verified)
- **Page:** Find opportunities → **Remote**
- **Expected result:** *Explain my electricity bill* (Money & paperwork, Rose) is listed. Its page says
  "Money & paperwork · verified volunteers only".
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-007 · Search matches title, description and skills — P1

- **Tester:** Ravi
- **Page:** Find opportunities → Remote
- **Test data:** Search **`spanish`**
- **Steps:** Type `spanish` in Search, click **Show results**.
- **Expected result:** *Spanish–English homework help* and *Translate a flyer to Spanish* are listed (also *Weekly ESL
  conversation circle*, whose nice-to-have skill is Spanish). Items without Spanish disappear.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-008 · Category, date and "verified organizations only" filters — P2

- **Tester:** Valerie
- **Page:** Find opportunities → Recommended
- **Test data:** (a) Category **Events & community**; (b) When **Next 7 days**; (c) tick **Verified organizations only**
- **Steps:** Apply each filter on its own (click Show results), then **Clear filters**.
- **Expected result:**
  - (a) only *Community garden weeding*, *Event setup crew*, *Volunteer coordinator for holiday drive*.
  - (b) only items starting within the next 7 days.
  - (c) only Harbor Food Bank and Lincoln High School items (no Rose requests, no Bright Futures).
  - "Clear filters" brings back the full list.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-009 · Nothing matches — P3

- **Tester:** Valerie
- **Page:** Find opportunities → Recommended
- **Test data:** Search `zzqx-nothing`
- **Expected result:** "Nothing matches yet" with advice and a **Clear filters** link. No error.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-010 · Save a search and get alerts — P2

- **Tester:** Ravi
- **Page:** Find opportunities → Remote
- **Test data:** Search `essay`; alert name `Essay help`
- **Steps:**
  1. Search `essay`, Show results.
  2. In "Get alerts for this search" replace the name with `Essay help`, click **Save search**.
  3. Follow **Manage alerts**.
- **Expected result:**
  - 2: "Search saved. We'll tell you about new matches once a day. Manage alerts".
  - 3: Saved page, "Saved searches" section lists **Essay help** with an **Alert me** option and **How often**
    (Daily / Weekly).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-011 · A saved search alerts about a new match — P2

- **Tester:** Ravi, then Olivia (`org.admin@thankyou.test`)
- **Before you start:** TC-VDS-010
- **Steps:**
  1. As Olivia, post and publish a remote Harbor Food Bank request titled `Essay review for our grant letter` (see
     OPS-002 for the wizard; category Translation & language or Tech help, remote, start next week).
  2. Wait until the next hourly housekeeping run (minute :07 of the hour; up to an hour).
  3. As Ravi open the bell (Notifications).
- **Expected result:** A notification says there is something new for "Essay help" and links to the matching results.
  The Saved page shows "Last alert" with a time for Essay help. If email for "New requests matching your saved
  searches" is on, the API terminal shows the email too.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-012 · Turn off or delete a saved search — P3

- **Tester:** Ravi
- **Page:** Find opportunities → **Saved** → Saved searches
- **Steps:**
  1. Untick **Alert me** for Essay help, click **Save**.
  2. Delete the saved search.
- **Expected result:** 1: "Alert settings saved." 2: "Saved search deleted." and "No saved searches yet."
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-013 · Save an opportunity for later — P2

- **Tester:** Ravi
- **Page:** Remote → *Reading buddy (grades 2–3)*
- **Steps:**
  1. Open the opportunity, click **Save for later**.
  2. Open Find opportunities → **Saved**.
  3. Back on the opportunity, click **Saved** again.
- **Expected result:**
  - 1: "Saved to your list."; the button now reads **Saved**.
  - 2: Reading buddy is listed under Saved.
  - 3: the opportunity is removed from Saved (button back to "Save for later").
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-014 · Saved list shows the ready-made saves — P2

- **Tester:** Valerie
- **Page:** Find opportunities → **Saved**
- **Before you start:** S10
- **Expected result:** *Event setup crew* and *Community garden weeding* are listed with area and organization, and each
  shows its date (known issue **K5**: shows "Flexible").
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-015 · Opportunity page for a volunteer — P1

- **Tester:** Valerie
- **Page:** Near you → *Community garden weeding*
- **Expected result:**
  - "← Find opportunities", category Events & community, title, "Jersey City, NJ · 1 mi away", Harbor Food Bank (link to
    its profile) with Verified badge.
  - "Why it matches you: under 1 mi · fits your Sundays".
  - About and Skills sections and the safety line.
  - Right column: date "· about 2 h", "1 volunteer needed · 1 left", the address note, a **Message to the organizer**
    box with **Apply**, and **Saved** (she saved it in S10).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-016 · Apply with a message — P1

- **Tester:** Ravi
- **Page:** Remote → *Algebra tutoring (grade 8)*
- **Test data:** Message `Hi! I tutor algebra twice a week and I'm free Monday afternoons. Happy to do a first session this week.`
- **Steps:**
  1. Click **Apply** with the message empty.
  2. Type the message, click **Apply**.
  3. Open **My applications**.
- **Expected result:**
  - 1: the browser asks you to fill in the message.
  - 2: "Application sent. We'll let you know when the organizer replies." The box now shows "Your application —
    Pending" with **Open application**.
  - 3: *Algebra tutoring (grade 8)* is under Active with status Pending.
  - Olivia gets a notification "new applicant" (check in ORG/OPS cases or the API terminal for the email).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-017 · Can't apply twice — P2

- **Tester:** Ravi
- **Before you start:** TC-VDS-016
- **Page:** *Algebra tutoring (grade 8)*
- **Expected result:** No Apply form; the box shows "Your application" with its status and **Open application**.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-018 · Requirement not met: car needed — P1

- **Tester:** Ravi (no car)
- **Page:** `/opportunities` (signed in) → search `Deliver meals` → open it (it also opens at `/volunteer/opportunities/<id>`)
- **Expected result:**
  - "Before you apply" lists **Has a car**.
  - Instead of Apply: "You can't apply yet" with "This opportunity needs a car. Update your profile if you have one."
    and a link **Update your profile**.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-019 · Requirement met after updating the profile — P2

- **Tester:** Ravi
- **Before you start:** TC-VDS-018
- **Steps:**
  1. Follow **Update your profile**. If a "has a car" setting is available there, turn it on and save. If not, note
     it in Notes (the car is otherwise set during onboarding: "I have a car I can use").
  2. Reopen *Deliver meals to homebound seniors*.
- **Expected result:** With a car on the profile, the Apply form appears.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-020 · Sensitive request needs ID verification — P1

- **Tester:** Ravi (not verified)
- **Page:** the address of *Explain my electricity bill* (copy it from Valerie's view in TC-VDS-006: `/volunteer/opportunities/<id>`)
- **Expected result:** Either "Opportunity not found", or "You can't apply yet" with "“Money & paperwork” opportunities are
  open to verified volunteers. Submit verification in Settings." Ravi can't apply.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-021 · Can't apply to your own request — P2

- **Tester:** Diego, switched to **Volunteering**
- **Before you start:** As Diego (Requesting help), post and publish a request titled `Diego's own test request` (any category, remote) — see REQ-001.
- **Steps:** Switch to Volunteering and open that request from Find opportunities → Remote (search `Diego's own`).
- **Expected result:** "You can't apply yet — You can't apply to your own request." No Apply form.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-VDS-022 · Applications are closed after the apply-by date — P3

- **Tester:** Rose, then Valerie
- **Steps:**
  1. As Rose, post a request `Apply-by test` (Errands & chores, in person, Upper West Side) with **Apply by** set to
     tomorrow and the start in 3 days; publish.
  2. The next day (after the apply-by date), as Valerie open it.
- **Expected result:** "Applications for this opportunity have closed". Before the date, Valerie could apply.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:
