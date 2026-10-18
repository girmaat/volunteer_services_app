# 01 · Public site and browsing without an account

What a visitor (without login in) sees before signing in: the home page, browsing opportunities and organizations, public profiles, the information pages, and the contact form. Privacy rule throughout: **a visitor never sees an exact address, a phone number, an email address, a sensitive request or an unpublished request.**

Run these signed out (a private/incognito window is easiest). Setup: `pnpm db:uat` (see README).

---

### TC-PUB-001 · Home page explains ThankYou and offers clear entry points — P1

- **Tester:** Visitor (signed out)
- **Page:** `/`
- **Before you start:** none
- **Test data:** none
- **Steps:**
  1. Open `http://localhost:3202/`.
  2. Read the top of the page and the two cards below the heading.
  3. Scroll through the sections below, then check the header and the footer.
- **Expected result:**
  - Heading **"Help that fits your week."** with a one-line introduction.
  - Left card **For organizations** — "Bring dependable volunteers to your cause", a short list of benefits, and two
    buttons: **Need help yourself? Post a request** and **Running a nonprofit? Register your organization**.
  - Right card **For volunteers** — "Give an hour. See the difference.", a short list of benefits, a **Find
    opportunities** button and the line "New here? **Create a free account** to apply…".
  - Sections "One place for everyone who helps", "How it works" and "Safety comes first" are present.
  - Header: ThankYou logo, links **Opportunities**, **Organizations**, **How it works**, buttons **Log in** and
    **Sign up**. Footer groups: Get involved, Learn, Trust & help, Legal.
  - On a wide screen (1280 px or more), "Sponsored" panels may show left and right if an admin has switched them
    on (see the admin test cases).
  - Nowhere on the page is there an email address, phone number or street address.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-002 · Home page buttons go to the right places — P1

- **Tester:** Visitor
- **Page:** `/`
- **Steps:** Click each button, then come back to `/`:
  1. **Find opportunities** (right card).
  2. **Create a free account** (right card).
  3. **Need help yourself? Post a request** (left card).
  4. **Running a nonprofit? Register your organization** (left card).
- **Expected result:**
  - 1: **Volunteer opportunities** (`/opportunities`).
  - 2: the sign-up page (`/signup`).
  - 3: sign-up / log-in first (a visitor can't post without an account), then the request form after signing in.
  - 4: the organization registration page (`/org/signup`).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-003 · Browse and filter opportunities by category and place — P1

- **Tester:** Visitor
- **Page:** `/opportunities` (header → Opportunities)
- **Test data:** Category **Food & meals**, Where **In person**
- **Steps:**
  1. Open Opportunities. Note the line "Exact addresses and contact details are shared only after an application is accepted."
  2. Set Category = Food & meals, Where = In person, click **Show results**.
  3. Clear the filters (Category = All categories, Where = Anywhere) and click **Show results** again.
- **Expected result:**
  - Step 2 lists only Harbor Food Bank's *Sort donations at the pantry*, *Saturday distribution shift* and
    *Deliver meals to homebound seniors*.
  - Each row shows title, short description, area, poster, date, how many spots are left (e.g. "5 spots left"
    for the Saturday shift) and a **View details** button. The category is **not** shown on the rows (it's only a
    filter).
  - Clicking anywhere on a row, or its **View details** button, opens the opportunity.
  - Step 3 shows all published, non-sensitive opportunities (organization and neighbor requests together).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-004 · Date filters — P2

- **Tester:** Visitor
- **Page:** `/opportunities`
- **Test data:** When **Tomorrow**, **Next 7 days**, **Next 30 days**; then a custom date and a custom range
- **Steps:**
  1. Open the **When** list and check the choices.
  2. Choose **Next 7 days**, click **Show results**. Note the dates on the rows.
  3. Choose **Next 30 days**, click **Show results**.
  4. Choose **Tomorrow**, click **Show results**.
  5. Choose **Pick dates (below)**, set **From** to the date of *Saturday distribution shift* (today + 5 days) and
     leave **To** empty. Click **Show results**.
  6. Set **From** = today + 10 days and **To** = today + 22 days. Click **Show results**.
  7. Click **Clear**.
- **Expected result:**
  - 1: Any time, Tomorrow, This weekend, Next 7 days, Next 30 days, Pick dates (below). Under the list there are
    **From** and **To (optional)** date boxes with the hint "For one day, fill in From only."
  - 2: only opportunities starting within 7 days (e.g. *Deliver meals…* +2 days, *Saturday distribution shift* +5
    days), not *College essay feedback* (+14) or *Build a simple sign-up page* (+21).
  - 3: also includes the +14 to +21 day items.
  - 4: only opportunities that start tomorrow. If none do, "Nothing matches yet" with **Clear filters**.
  - 5: opportunities on that single day (includes *Saturday distribution shift*).
  - 6: opportunities between those dates (includes *College essay feedback* and *Build a simple sign-up page*,
    not *Saturday distribution shift*). The page address contains `from=` and `to=`.
  - In every case, flexible opportunities with no fixed date are also listed (they can be done any time), and
    recurring ones that already started stay listed.
  - 7: all filters reset.
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
  - Title, area **Queens, NY**, "Harbor Food Bank" with Verified badge, About text, Skills (food, community;
    spanish as nice to have), date/time "· about 2 h", "6 volunteers needed · 5 left". No category label.
  - The exact address *87-10 Queens Blvd* is **not** shown; instead: "The exact address and contact details are
    shared when you apply for this opportunity and your application is accepted."
  - A safety line: "Coordinate in **ThankYou messages**. Never share bank details, passwords and personal
    information…". "ThankYou messages" is a link; for a visitor it opens the **Log in** page (with a link to sign
    up), and after logging in you land in **Inbox**.
  - A "Want to help?" box with **Create an account to apply** and **Log in**. There is no Apply form.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-007 · Sensitive, unpublished and draft requests are not public — P1

- **Tester:** Visitor
- **Page:** `/opportunities`
- **Test data:** searches `electricity`, `curtains`, `garden cleanup`
- **Steps:** Type each term in **Search** and click **Show results**.
- **Expected result:**
  - `electricity`: no result (*Explain my electricity bill* is in a sensitive category, shown only to ID-verified
    volunteers who are signed in).
  - `curtains`: no result (*Help hanging curtains and a shelf* is waiting for moderator review).
  - `garden cleanup`: no result (*Draft: garden cleanup* is a draft). (*Community garden weeding* may appear;
    it is a different, published opportunity.)
  - Empty searches show "Nothing matches yet" with a way to clear filters.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

> **How the search box works.** It is a word search, not an exact-text match:
> - It looks in the title (most important), skills and tags, then the description and area.
> - Every word you type must appear (`garden cleanup` needs both "garden" and "cleanup").
> - Word endings don't matter: `tutor` finds "tutoring" and "tutors"; `deliver` finds "delivery".
> - Capital letters don't matter. Common words such as "the" and "and" are ignored.
> - Part of a word does **not** match (`tut` finds nothing) and spelling mistakes aren't corrected.
> - Use quotes for an exact phrase (`"food bank"`), `or` for either word (`tutoring or reading`) and a minus sign
>   to leave a word out (`garden -weeding`).
> - Results whose title matches are listed first.

### TC-PUB-008 · Public requester profile — P2

A requester's profile has a public address, but nothing on the site links to it for visitors, so you get the
address from Rose's own account first.

- **Tester:** Rose (`requester@thankyou.test` / `Password!`), then Visitor
- **Page:** Rose's public profile, `/requesters/<Rose's id>`
- **Before you start:** S3 (Diego reviewed Rose)
- **Steps:**
  1. Log in as Rose.
  2. Click the round avatar at the top right → **Profile**.
  3. Click **View public profile**. The address bar now shows `http://localhost:3202/requesters/` followed by a
     long id. Copy the whole address.
  4. Click the avatar → **Log out**.
  5. Paste the address into the address bar and open it (you are now a visitor).
- **Expected result:**
  - Shows first name **Rose**, area Manhattan, NY, "Email verified", an About text and **Reviews (as requester)**
    with ★ 5.0 · 1 total — Diego's review "Friendly and well organized." on *Set up my new phone*.
  - No email address, phone number, full name or street address.
  - Trust values read in plain words (no raw codes such as "not_required"; known issue **K6**).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-009 · Volunteer profiles are private; a share link shows what the volunteer picks — P1

- **Tester:** Diego (`dual.role@thankyou.test` / `Password!`), then Visitor
- **Page:** Diego: Volunteering → avatar → **Profile** → **Share your profile** (`/volunteer/profile/share`)
- **Before you start:** S3
- **Steps:**
  1. Log in as Diego, switch to **Volunteering** (top-right switcher) and open avatar → **Profile**. Note the line
     "Your profile is private. Share your profile with a link you control." Click **Share your profile**.
  2. Read the page: "No active link. Nobody can see your profile." and the **Preview**.
  3. Click **Create a share link**, then **Copy**. Paste the link into a private/incognito window.
  4. Back as Diego, in "What your link shows" tick **About**, **Average rating** and **Reviews received**, untick
     **Name**, click **Save**. Refresh the incognito window.
  5. As Diego click **Create a new link**. Refresh the incognito window (old link). Open the new link.
  6. As Diego click **Turn off sharing**. Refresh the new link.
- **Expected result:**
  - 2: by default the link shows Name and Total hours logged; Location, About, Average rating and Reviews received
    are off. Accomplishments (*Set up my new phone* with date and hours) and badges always show.
  - 3: the visitor sees "Volunteer record — **Diego**", Opportunities completed **1**, Total hours logged, the
    accomplishment list and badges. No email, phone, birth date, full name or address.
  - 4: the name is replaced by "A ThankYou volunteer"; About text, Average rating **5.0 / 5** and Reviews received
    **1** now show.
  - 5: the old link shows "This link isn't active"; the new link works.
  - 6: "Link turned off…"; the link shows "This link isn't active".
  - Opening `/volunteers/<Diego's id>` signed out shows "Page not found".
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-010 · Organization directory and profile — P1

- **Tester:** Visitor
- **Page:** `/organizations` (header → Organizations)
- **Steps:**
  1. Open Organizations.
  2. Click **View profile** on **Harbor Food Bank**.
- **Expected result:**
  - Heading "Recently active organizations". **Only three** organizations are shown — the ones that posted or
    updated opportunities most recently (with the seed data: Lincoln High School, Harbor Food Bank, Bright Futures
    Tutoring). The full list is only in the admin portal.
  - Verified organizations show a bold yellow **Verified** badge; others say "Not yet verified".
  - **View profile →** is underlined like a link.
  - Harbor's page: an "HF" logo tile, name with Verified badge, Queens, NY, "Verified since …", a **Website** link,
    the summary, **See opportunities (8)** and **Share** buttons, "Our mission — No neighbor goes hungry.",
    "Open opportunities (8)" with **View details** on each row, and an "At a glance" box (open opportunities, how
    volunteers get in touch) plus "What 'Verified' means".
  - No staff names, email addresses or phone numbers appear.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-011 · Information pages load and read correctly — P2

- **Tester:** Visitor
- **Page:** Footer links: How it works, Impact stories, Ideas for helping (`/examples`), About, Trust & safety,
  Code of conduct, Help center, Terms of service, Privacy policy
- **Steps:** Open each page from the footer.
- **Expected result:**
  - Every page has a short label above the title (e.g. "LEGAL"), a title, a one-sentence introduction and readable
    sections under the ThankYou name (never "GiveBack"). Long pages show an "On this page" list on the right.
  - Terms of service and Privacy policy show "Last updated …".
  - The page contains only content meant for the public: no "Public" tag and no notes to the team such as
    "Explains the core flow in simple steps." or developer instructions.
  - *Impact stories* shows a featured story and three more cards; each opens a full story.
  - *Ideas for helping*: **Quick ideas** is a list of categories that open and close (the first is open), and
    **Open opportunities right now** lists live opportunities with **View details**.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-012 · Help center gives accurate, user-facing answers — P2

- **Tester:** Visitor
- **Page:** `/help` (footer → Help center)
- **Expected result:**
  - Sections: Getting started, Volunteering, Asking for help, Organizations, Safety and privacy, Still need help?
  - Answers match how the app works today (e.g. browsing needs no account; the organizer starts conversations;
    profiles are private and shared by link; block/report from a profile or conversation).
  - No developer instructions (backend, migrations, RUN_MIGRATIONS).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-PUB-013 · Contact form — P2

- **Tester:** Visitor, then Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `/contact` (footer → Contact us)
- **Test data:** Your name **`Uma Tester`**; Your email **`uma.tester@example.test`**; Message **`Testing the contact form during UAT. Please ignore.`**
- **Steps:**
  1. Signed out, fill in the form and click **Send**.
  2. Look at the API terminal.
  3. Log in as Valerie and open `/contact` again. Try to change the name and email.
  4. Type a message and click **Send**.
- **Expected result:**
  - 1: "Thanks, your message is on its way. We'll reply to the email address you gave." The page has an "In an
    emergency" box and "Quick answers" links; no placeholder or developer text.
  - 2: the API terminal shows an `[email:log]` message to the platform team containing "From: Uma Tester
    <uma.tester@example.test>" and the message text (only if `SUPPORT_EMAIL` is set in `apps/api/.env`).
  - 3: Your name (**Valerie**) and Your email (**volunteer.local@thankyou.test**) are filled in, grey and can't be
    edited, with "These come from your account."
  - 4: "…We'll reply to volunteer.local@thankyou.test." Volunteers don't see "Message the ThankYou team" (that's
    for organizations, see TC-ADM support cases).
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
