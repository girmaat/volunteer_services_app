# 01 · Public site and browsing without an account

What a visitor sees before signing in: the home page, browsing opportunities and organizations, public
profiles, the information pages, and the contact form. Privacy rule throughout: **a visitor never sees an
exact address, a phone number, an email address, a sensitive request or an unpublished request.**

Run these signed out (a private/incognito window is easiest). Setup: `pnpm db:uat` (see README).

---

### TC-PUB-001 · Home page shows real opportunities and clear entry points — P1

- **Tester:** Visitor (signed out)
- **Page:** `/`
- **Before you start:** none
- **Test data:** none
- **Steps:**
  1. Open `http://localhost:3202/`.
  2. Read the top of the page, the "Open right now" list and the sections below it.
  3. Check the header and the footer.
- **Expected result:**
  - Heading **"Help that fits your week."** with a search box labelled "What would you like to help with?", a
    "Where" choice (Anywhere / In person / Remote) and a **Find opportunities** button.
  - "Open right now" lists up to five real seeded opportunities, each with its area (or "Remote"), who posted it
    (organization name or "Neighbor request"), a **Verified** badge for Harbor Food Bank and Lincoln High School,
    and a date and time.
  - Sections "One place for everyone who helps" (Volunteers / Neighbors who need a hand / Organizations),
    "How it works" (4 steps) and "Safety comes first" are present.
  - Header: ThankYou logo, links **Opportunities**, **Organizations**, **How it works**, buttons **Log in** and
    **Sign up**.
  - Footer groups: Get involved, Learn, Trust & help, Legal.
  - Nowhere on the page is there an email address, phone number or street address.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-002 · Search from the home page — P1

- **Tester:** Visitor
- **Page:** `/`
- **Test data:** search **`tutoring`**, Where **Remote**
- **Steps:**
  1. Type `tutoring` in "What would you like to help with?".
  2. Choose **Remote**.
  3. Click **Find opportunities**.
- **Expected result:**
  - You land on **Volunteer opportunities** (`/opportunities?q=tutoring&mode=remote`) with the search box
    showing "tutoring" and Remote selected.
  - Results include *Algebra tutoring (grade 8)* and *Reading buddy (grades 2–3)* (Bright Futures Tutoring).
  - No in-person result appears (for example *After-school homework club helpers* is not listed).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-003 · Browse and filter opportunities by category and place — P1

- **Tester:** Visitor
- **Page:** `/opportunities` (header → Opportunities)
- **Test data:** Category **Food & meals**, Where **In person**
- **Steps:**
  1. Open Opportunities. Note the line "Exact addresses and contact details are shared only after an application
     is accepted."
  2. Set Category = Food & meals, Where = In person, click **Show results**.
  3. Clear the filters (Category = All categories, Where = Anywhere) and click **Show results** again.
- **Expected result:**
  - Step 2 lists only Harbor Food Bank's *Sort donations at the pantry*, *Saturday distribution shift* and
    *Deliver meals to homebound seniors*.
  - Each card shows title, short description, area, poster, category, date and how many spots are left
    (e.g. "5 spots left" for the Saturday shift).
  - Step 3 shows all published, non-sensitive opportunities (organization and neighbor requests together).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-004 · Date filters — P2

- **Tester:** Visitor
- **Page:** `/opportunities`
- **Test data:** When **Next 7 days**, then **Next 30 days**
- **Steps:**
  1. Choose When = Next 7 days, Show results. Note the dates on the cards.
  2. Choose When = Next 30 days, Show results.
- **Expected result:**
  - Step 1 shows only opportunities starting within 7 days of today (e.g. *Deliver meals…* +2 days, *Saturday
    distribution shift* +5 days), not *College essay feedback* (+14) or *Build a simple sign-up page* (+21).
  - Step 2 also includes the +14 to +21 day items.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-005 · "Verified organizations only" filter — P2

- **Tester:** Visitor
- **Page:** `/opportunities`
- **Test data:** tick **Verified organizations only**
- **Steps:** Tick the box and click **Show results**.
- **Expected result:**
  - Only Harbor Food Bank and Lincoln High School opportunities remain.
  - Neighbor requests (Rose's) and Bright Futures Tutoring (not verified) disappear.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-006 · Opportunity page hides private details from visitors — P1

- **Tester:** Visitor
- **Page:** `/opportunities` → *Saturday distribution shift*
- **Steps:**
  1. Search `Saturday distribution`, open the result.
  2. Read the whole page.
- **Expected result:**
  - Title, category (Food & meals), area **Queens, NY**, "Harbor Food Bank" with Verified badge, About text,
    Skills (food, community; spanish as nice to have), date/time "· about 2 h", "6 volunteers needed · 5 left".
  - The exact address *87-10 Queens Blvd* is **not** shown; instead: "The exact address and contact details are
    shared after you're accepted."
  - A safety line: "Coordinate in ThankYou messages. Never share bank details or passwords…".
  - A "Want to help?" box with **Create an account to apply** and **Log in**. There is no Apply form.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-007 · Sensitive, unpublished and draft requests are not public — P1

- **Tester:** Visitor
- **Page:** `/opportunities`
- **Test data:** searches `electricity`, `curtains`, `garden cleanup`
- **Steps:** Search each term and click Show results.
- **Expected result:**
  - `electricity`: no result (*Explain my electricity bill* is in a sensitive category, shown only to ID-verified
    volunteers who are signed in).
  - `curtains`: no result (*Help hanging curtains and a shelf* is waiting for moderator review).
  - `garden cleanup`: no result (*Draft: garden cleanup* is a draft). (*Community garden weeding* may appear;
    it is a different, published opportunity.)
  - Empty searches show "Nothing matches yet" with a way to clear filters.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-008 · Public requester profile — P2

- **Tester:** Visitor
- **Page:** Any opportunity posted by Rose → her name (or `/requesters/<id>` from that link)
- **Before you start:** S3 (Diego reviewed Rose)
- **Steps:**
  1. Open *Walk and talk in the park* and follow the poster link "Rose", or sign in as Rose → Profile → View public profile to get the address, then open it signed out.
  2. Read the profile.
- **Expected result:**
  - Shows first name **Rose**, area Manhattan, NY, "Email verified", an About text and **Reviews (as requester)**
    with ★ 5.0 · 1 total — Diego's review "Friendly and well organized." on *Set up my new phone*.
  - No email address, phone number, full name or street address.
  - Trust values read in plain words (no raw codes such as "not_required"; known issue **K6**).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-009 · Public volunteer profile — P2

- **Tester:** Visitor
- **Page:** Diego's public profile (sign in as Diego → Volunteering → Profile → **View public profile**, copy the address, open it signed out)
- **Before you start:** S3
- **Expected result:**
  - Shows **Diego**, Newark, NJ, **Total hours logged 2**, **Average rating 5.0**, **Reviews received 1**, About text.
  - "Completed opportunities" counts the completed phone set-up (shows 1; known issue **K6** shows 0).
  - No email, phone, birth date or full name.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-010 · Organization directory and profile — P1

- **Tester:** Visitor
- **Page:** `/organizations` (header → Organizations)
- **Steps:**
  1. Open Organizations.
  2. Open **Harbor Food Bank**.
- **Expected result:**
  - Directory heading "Meet the partners behind the work" lists **Harbor Food Bank** (Verified), **Lincoln High
    School** (Verified) and **Bright Futures Tutoring** (no badge), each with city and summary and "View profile →".
  - Harbor's page shows name with Verified badge, Queens, NY, summary, "Mission: No neighbor goes hungry.", a
    **Website ↗** link, a **Share** button and "Open opportunities (8)" listing its published requests with mode
    and area.
  - No staff names or email addresses appear.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-011 · Information pages load and read correctly — P2

- **Tester:** Visitor
- **Page:** Footer links: How it works, Impact stories, Ideas for helping (`/examples`), About, Trust & safety,
  Code of conduct, Terms of service, Privacy policy
- **Steps:** Open each page from the footer.
- **Expected result:**
  - Every page loads with a heading and readable content under the ThankYou name (never "GiveBack").
  - *Impact stories* shows "No stories yet." when none exist.
  - *Ideas for helping* lists example categories and live opportunities ("Examples you can join").
  - No internal notes or labels such as a "Public" badge or "Explains the core flow…" (known issue **K3**).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-012 · Help center gives accurate, user-facing answers — P2

- **Tester:** Visitor
- **Page:** `/help` (footer → Help center)
- **Expected result:**
  - Sections: Quick start, Account & access, Privacy & safety, Volunteering workflow, Need more help?
  - Answers match how the app works today (opportunities are browsable without an account; block/report is in
    the conversation's Safety menu and Settings).
  - No developer instructions (backend, migrations, RUN_MIGRATIONS) — known issue **K1**.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-013 · Contact form — P2

- **Tester:** Visitor
- **Page:** `/contact` (footer → Contact us)
- **Test data:** Your name **`Uma Tester`**; Your email **`uma.tester@example.test`**; Message **`Testing the contact form during UAT. Please ignore.`**
- **Steps:**
  1. Fill in the form and click **Send**.
  2. Look at the API terminal.
- **Expected result:**
  - The page confirms the message was sent (and clears or hides the form). Known issue **K11**: nothing visible happens.
  - The API terminal shows an `[email:log]` message to the platform team containing "From: Uma Tester
    <uma.tester@example.test>" and the message text.
  - No placeholder or developer text on the page (known issue **K2**).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-014 · Contact form rejects incomplete input — P3

- **Tester:** Visitor
- **Page:** `/contact`
- **Test data:** leave Message empty; email `not-an-email`
- **Steps:** Try to send with the message empty, then with an invalid email.
- **Expected result:** The browser stops the submission and points at the empty or invalid field. Nothing is sent.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-015 · Signed-in header and unknown pages — P2

- **Tester:** Visitor, then Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `/does-not-exist`, then `/`
- **Steps:**
  1. Signed out, open `http://localhost:3202/does-not-exist`.
  2. Sign in as Valerie, then open `/` again.
- **Expected result:**
  - Step 1: "Page not found" with **Go home** (no technical error).
  - Step 2: the header shows **Go to my dashboard** instead of Log in / Sign up; clicking it opens Valerie's
    volunteer home ("Hi, Valerie").
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-016 · Private pages ask a visitor to log in — P1

- **Tester:** Visitor
- **Page:** `/dashboard`, `/settings`, `/volunteer/history`, `/org/dashboard`, `/admin`
- **Steps:**
  1. Open each address while signed out.
  2. From the `/settings` login page, sign in as Valerie.
- **Expected result:**
  - Each address shows the **Log in** page instead of private content.
  - After signing in from `/settings` you land on **Settings** (the page you asked for). Pages that don't remember
    where you were take you to your home page.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:
