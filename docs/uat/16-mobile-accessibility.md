# 16 · Phones, keyboard and screen readers

ThankYou must work on a phone and for people who use a keyboard or a screen reader. On a phone, public pages get a
menu button (☰); signed-in areas get a compact top bar and tabs along the bottom of the screen (with a **More** tab
when an area has more than five destinations).

**How to test at phone size on a computer:** in Chrome or Edge press **F12**, click the phone/tablet icon
("Toggle device toolbar", or **Ctrl+Shift+M**), choose **iPhone 12 Pro** (390 × 844) and refresh. A real phone on
the same network works too (open `http://<your computer's IP>:3202`).

**Screen reader:** Windows has Narrator (**Win+Ctrl+Enter** to turn on and off); NVDA is a free alternative. Mac
has VoiceOver (**Cmd+F5**).

Setup: `pnpm db:uat`.

---

### TC-MOB-001 · Public pages on a phone — P1

- **Tester:** Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/`, `http://localhost:3202/opportunities`, `http://localhost:3202/organizations`,
  `http://localhost:3202/privacy` at phone size
- **Steps:**
  1. On each page scroll from top to bottom.
  2. On the home page tap **☰** (Open menu), then a link.
- **Expected result:**
  - Nothing is cut off and the page never scrolls sideways. Cards stack in one column; buttons are full size and
    easy to tap. No "Sponsored" panels show on a phone.
  - 2: the menu opens below the header with Opportunities, Organizations, How it works, **Log in** and **Sign up**;
    tapping a link opens the page and closes the menu. The button reads "Close menu" while open.

### TC-MOB-002 · Finding opportunities on a phone — P1

- **Tester:** Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/opportunities` at phone size
- **Steps:**
  1. Look at the top of the page.
  2. Tap **Filters**, choose When = **Next 7 days**, tap **Show results**.
  3. Tap **View details** on a result.
- **Expected result:**
  - 1: the search box and a **Filters** button come first, then the results (the filter panel is folded away).
  - 2: the filters unfold (the button reads "Hide filters"); after Show results the button reads "Filters (1)".
  - 3: the opportunity opens; the details box (date, spots, address note) comes after the description, and
    **Create an account to apply** is easy to reach.

### TC-MOB-003 · Volunteer area on a phone — P1

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/dashboard` at phone size
- **Steps:**
  1. Look at the top bar and the bottom of the screen.
  2. Tap each bottom tab. Tap **More**, then **Impact**.
  3. Open the account menu (round avatar, top right) and the switcher.
- **Expected result:**
  - 1: top bar with the ThankYou logo, the "Volunteering" switcher, the bell and the avatar. Bottom tabs: Home, Find
    opportunities, My applications, Schedule, **More**. The tab for the current page is highlighted.
  - 2: each tab opens its page. **More** opens a small list with Inbox and Impact above the tabs; tapping Impact
    opens it and closes the list; the More tab is highlighted while you're on Inbox or Impact.
  - 3: both open as menus that fit the screen.
  - The bottom tabs never cover the last item on a page (you can scroll it into view).

### TC-MOB-004 · Organization and admin areas on a phone — P2

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`), then Ada (`admin@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/org/dashboard`, `http://localhost:3202/org/applications`, then
  `http://localhost:3202/admin`, `http://localhost:3202/admin/users` at phone size
- **Steps:** Use the bottom tabs and **More** to visit each section.
- **Expected result:**
  - Organization tabs: Home, Requests, Applicants, Hours, **More** (People, Inbox, Organization).
  - Admin: a **dark** top bar and dark-themed tabs, so staff know they're in the admin tools; **More** lists the
    remaining admin sections.
  - Wide tables (Users, Organizations, Audit log) scroll sideways inside their box, not the whole page.

### TC-MOB-005 · Messages on a phone — P2

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/inbox` at phone size
- **Before you start:** S1
- **Steps:** Open the conversation with Rose, read it, type `Phone test` and tap **Send**. Tap **← Inbox**.
- **Expected result:** The list fills the screen; the conversation opens on its own screen with "← Inbox" at the top.
  The message box, "Attach a file" and **Send** fit the width; the new message appears at the bottom.

### TC-MOB-006 · Posting a request on a phone — P2

- **Tester:** Rose (`requester@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/requester/requests/new` at phone size
- **Test data:** Title `Phone test: water my plants`; Errands & chores; in person; Upper West Side, Manhattan, NY;
  a date next week
- **Steps:** Go through every step of the form and save it as a draft.
- **Expected result:** Each step fits the screen; date and time pickers open the phone's own pickers; **Back** /
  **Next** buttons are always reachable; the draft is saved ("Draft saved" or it appears under My requests → Drafts).

### TC-MOB-007 · Using the site with only the keyboard — P1

- **Tester:** Visitor (signed out, no login needed), then Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/`, then `http://localhost:3202/login`, then
  `http://localhost:3202/volunteer/opportunities/recommended` (desktop size, don't touch the mouse)
- **Steps:**
  1. On the home page press **Tab** once.
  2. Keep pressing Tab through the header, the two cards and the footer; press **Enter** on "Opportunities".
  3. On the log-in page fill in Valerie's email and password with Tab and Enter.
  4. On Find opportunities, Tab to a result and press Enter; Tab to **Save for later** and press Enter; open the
     switcher and the account menu with Enter and move with the arrow keys; close them with **Esc**.
- **Expected result:**
  - 1: a **Skip to content** link appears first; pressing Enter jumps past the menu to the page content.
  - Every link, button and field can be reached in a sensible order, and the one with focus always has a clearly
    visible yellow outline.
  - Menus and pop-up windows (share window, account menu) open with Enter, are usable with the arrow keys and Tab,
    close with Esc, and focus returns to the button that opened them.
  - Nothing traps the keyboard.

### TC-MOB-008 · Screen reader labels — P2

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/dashboard`, `http://localhost:3202/opportunities`,
  `http://localhost:3202/settings/account` with the screen reader on
- **Steps:** Move through each page with the screen reader's heading and form-field shortcuts.
- **Expected result:**
  - Each page has one main heading (level 1) and sections with their own headings.
  - Navigation areas are announced by name (e.g. "Volunteering", "Volunteering shortcuts", "Main").
  - Every form field reads its label ("Search", "Category", "When", "From", "Email"…); icon-only buttons read their
    purpose ("Notifications, 1 unread", "Open menu", "Close"); the opportunity rows' "Why it matches" reasons are
    announced.
  - Messages after an action ("Saved.", "Application sent…") are read out.

### TC-MOB-009 · Zoom and large text — P2

- **Tester:** Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/`, `http://localhost:3202/opportunities`, `http://localhost:3202/signup`
- **Steps:** At desktop size press **Ctrl** and **+** until the zoom is **200%** (Mac: Cmd +).
- **Expected result:** All text grows; the layout switches to the phone layout where needed; nothing overlaps or is
  cut off, and the sign-up form can still be completed.

### TC-MOB-010 · Colour and motion — P3

- **Tester:** Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/opportunities`, `http://localhost:3202/organizations`
- **Steps:**
  1. Look at status pills, the Verified badge, links and error messages.
  2. Turn on "reduce motion" (Windows: Settings → Accessibility → Visual effects → Animation effects off; Mac:
     System Settings → Accessibility → Display → Reduce motion) and reload.
- **Expected result:**
  - 1: information never depends on colour alone — statuses have words ("Partly filled", "Verified"), links are
    underlined or clearly styled, and error messages say what's wrong in text. Text is easy to read against its
    background.
  - 2: loading spinners and transitions are reduced or removed.
