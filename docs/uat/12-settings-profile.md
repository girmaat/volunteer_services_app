# 12 · Profiles and settings

Your own profile (volunteer and requester), profile photo, Settings: overview, account (password, two-step sign-in,
data download, deletion), privacy and messaging, blocked users, reports you filed, ID verification and roles.

Setup: `pnpm db:uat`. Settings opens from the account menu (round avatar, top right) → **Settings**. Password changes
and two-step sign-in are covered in 02 (TC-ACC-017 to TC-ACC-022) with a test account so the seed passwords stay
`Password!`. The deletion case uses a new account.

---

### TC-SET-001 · Volunteer profile page — P1

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/profile` (account menu → **Profile**)
- **Expected result:**
  - Name, "Signed in as volunteer.local@thankyou.test", and "Your profile is private. **Share your profile** with a link you control."
  - Profile photo with **Upload**; an **Edit profile** form with Display name (shown to organizers), General location,
    Nearby radius, Date of birth (private — "Only used to check age limits. Never shown to anyone."), Background check
    status, Full name (private), Phone (private), Languages, About you, **Save profile** and **Sharing settings**.

### TC-SET-002 · Edit the volunteer profile — P1

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/profile`
- **Test data:** Display name `Val`; General location `Downtown Jersey City, NJ`; Nearby radius `20`; Languages `English, Vietnamese`;
  About you `I drive a hatchback and love early-morning shifts.`
- **Steps:**
  1. Change the fields, click **Save profile**, then refresh the page.
  2. Clear **Full name** and save.
  3. Put the original values back (Display name `Valerie`, radius `15`) and save.
- **Expected result:**
  - 1: "Saved — Your profile changes were saved." The new values are still there after refreshing. The top-right avatar
    menu and "Hi, Val" on the volunteer home use the new display name.
  - 2: "Could not save — Full name is required."
  - Near you (`http://localhost:3202/volunteer/opportunities/nearby`) now uses the 20-mile radius until you set it back.

### TC-SET-003 · Requester profile page — P2

- **Tester:** Rose (`requester@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/requester/profile`
- **Before you start:** S3 (Rose completed one request with Diego)
- **Expected result:**
  - "Signed in as requester@thankyou.test", **View public profile**, verification badges, trust signals and Reputation.
  - Trust signals are in plain words: "ID verified", "Typical response time: Under a minute" (from the seeded
    messages), and "Completed help: **2**" (Valerie's groceries and Diego's phone set-up).
  - An **Edit profile** form with public details (display name, general location, about, what you usually need help
    with, logistics, safety preferences) and private details (legal name, phone).

### TC-SET-004 · Edit the requester profile — P2

- **Tester:** Rose (`requester@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/requester/profile`
- **Test data:** About `Retired teacher, happy to chat while we work.`; tick **Elevator available**; tick **Meet in public first**
- **Steps:** Change the fields, click **Save profile**, then click **Preview public profile**.
- **Expected result:** "Saved". The public profile (`http://localhost:3202/requesters/<id>`) shows the new About text. It
  never shows Rose's legal name, phone or email.

### TC-SET-005 · Upload and remove a profile photo — P2

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/profile` → **Profile photo**
- **Test data:** a small PNG or JPG (under 1 MB); a file over 1 MB; a `.gif` or `.txt` renamed to `.png`
- **Steps:**
  1. Choose the small image, click **Upload**.
  2. Try the large file, then the renamed file.
  3. Click **Remove**.
- **Expected result:**
  - 1: the photo replaces the initials in the circle on the profile and in the avatar at the top right.
  - 2: each is refused with a message (too large, or not a PNG/JPEG/WebP image); the current photo stays.
  - 3: the initials come back.

### TC-SET-006 · Settings overview — P2

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings` (account menu → **Settings**)
- **Expected result:**
  - "Overview — A quick look at your account, privacy and safety settings."
  - A side menu: Account, Verification, Notifications, Privacy & Safety, Blocked users, Reports filed, Roles.
  - An account snapshot ("Signed in as…", Email verified), "At a glance" counts (unseen notifications, blocked users,
    reports filed) and **Invite friends** with **Generate invite link**.
  - No developer wording anywhere on the page.

### TC-SET-007 · Download my data — P1

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings/account` → **Your data**
- **Steps:** Click **Download my data (JSON)** and open the file.
- **Expected result:** A file `thankyou-data-<today's date>.json` downloads. It contains Valerie's profile, her applications
  (groceries, Saturday shift, meals, park walk), her messages, reviews and settings. It contains nothing about other
  people beyond what Valerie already saw (no one else's email or phone).

### TC-SET-008 · Deleting an account needs the password and the word DELETE — P2

- **Tester:** New account you create first — `uat.delete@example.test` / `Uat-Pass-2026!` (sign up, verify, onboard as a volunteer)
- **Page:** `http://localhost:3202/settings/account` → **Delete account**
- **Steps:**
  1. Type password `WrongPass1` and `DELETE`, click **Delete my account**.
  2. Type the right password and `delete` (lower case), click Delete my account.
- **Expected result:**
  - 1: "That password isn't right". The account still works.
  - 2: the browser refuses (the box must say exactly DELETE). Nothing is deleted.

### TC-SET-009 · Delete an account — P1

- **Tester:** `uat.delete@example.test` / `Uat-Pass-2026!` (from TC-SET-008)
- **Page:** `http://localhost:3202/settings/account` → **Delete account**
- **Before you start:** as this account, apply to *Translate a flyer to Spanish* with message `Happy to help`.
- **Steps:**
  1. Read the Delete account box, type the password and `DELETE`, click **Delete my account**.
  2. Try to log in again as `uat.delete@example.test`.
  3. As Olivia (`org.admin@thankyou.test` / `Password!`), open `http://localhost:3202/org/applications`.
- **Expected result:**
  - 1: the box explains "Your open requests are canceled, applications withdrawn, and your profile and contact details erased.
    Messages and reviews others received stay, shown as "Deleted member". This can't be undone." After deleting you're
    signed out on the home page.
  - 2: "Invalid email or password".
  - 3: the application is withdrawn and shows "Deleted member", with no email.

### TC-SET-010 · The only admin of an organization can't delete their account — P2

- **Tester:** Sam (`school.admin@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings/account` → **Delete account**
- **Steps:** Type `Password!` and `DELETE`, click **Delete my account**.
- **Expected result:** Refused: "Make someone else an admin of lincoln-high-school first". Sam's account is unchanged.

### TC-SET-011 · Privacy & Safety for a volunteer — P1

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings/privacy-safety`
- **Expected result:**
  - "Control who sees your profile and who can message you."
  - "Your volunteer profile is private — Nobody can look it up. To show it to someone, create a share link…" with a link to
    **Profile → Sharing** (`/volunteer/profile/share`). There is no "public profile is visible" switch for volunteers.
  - **Messaging permissions** — "Choose who can send you messages." with Anyone / Verified users only / No one, and
    **Save changes**.

### TC-SET-012 · Public profile switch for a requester — P2

- **Tester:** Rose (`requester@thankyou.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** Rose: `http://localhost:3202/settings/privacy-safety`; Visitor: Rose's public profile `http://localhost:3202/requesters/<Rose's id>`
  (get the address from **View public profile** on `http://localhost:3202/requester/profile`)
- **Steps:**
  1. Rose unticks **Public profile is visible**, clicks **Save changes**.
  2. The visitor opens Rose's public profile address.
  3. Rose ticks it again and saves.
- **Expected result:** 1: "Saved". 2: the profile is unavailable ("not found"). 3: the profile shows again.

### TC-SET-013 · Messaging permission "No one" — P2

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`), then Rose (`requester@thankyou.test` / `Password!`)
- **Page:** Valerie: `http://localhost:3202/settings/privacy-safety`; Rose: `http://localhost:3202/inbox` → the groceries conversation
- **Steps:**
  1. Valerie chooses **No one**, **Save changes**.
  2. Rose sends `Are you free next Thursday too?`.
  3. Valerie sets it back to **Anyone** and saves; Rose sends the message again.
- **Expected result:** 2: Rose's message is refused with a message that Valerie isn't accepting messages. 3: it is delivered.
  (TC-MSG-020 checks the same rule for Diego.)

### TC-SET-014 · Block someone from Settings — P1

- **Tester:** Rose (`requester@thankyou.test` / `Password!`), then Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings/blocked-users`
- **Test data:** Select from recent people **Valerie**; Reason `Testing the block list during UAT.`
- **Steps:**
  1. Rose reads the page, chooses Valerie, adds the reason and clicks **Block user**.
  2. Valerie opens the groceries conversation (`http://localhost:3202/inbox`) and tries to send `Hello?`.
  3. Rose clicks **Unblock** next to Valerie.
- **Expected result:**
  - 1: "Blocking someone prevents messages in either direction, and hides conversations from your inbox." After blocking,
    Valerie is listed with **Unblock**.
  - 2: Valerie can't send ("This conversation is unavailable because one of you has blocked the other.").
  - 3: Valerie disappears from the list; messaging works again in new messages.

### TC-SET-015 · Block by email address — P3

- **Tester:** Rose (`requester@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings/blocked-users` → **Or block by email**
- **Test data:** `volunteer.remote@thankyou.test`
- **Steps:** Type the email, click **Block user**, then **Unblock**.
- **Expected result:** Ravi is listed (by name and area, never his email address shown back to Rose), then removed.
  Blocking an email that has no account shows an error and blocks nothing.

### TC-SET-016 · Reports you filed — P2

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings/reports`
- **Before you start:** S7 (Valerie reported *Fill in an online benefits form*)
- **Expected result:** "Your submitted reports" lists the S7 report with its category (Scam / fraud), "Target: Fill in an online
  benefits form", status **Submitted** (or In review) and dates.

### TC-SET-017 · File a report from Settings — P2

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings/reports`
- **Test data:** Target type **User**; User **Rose**; Category **Spam**; What happened? (a) `bad`; (b) `Testing the report form during UAT, please dismiss.`
- **Steps:** Submit (a), then (b).
- **Expected result:** (a) refused: "Please include enough detail for review (at least 10 characters)." (b) the report is
  added to "Your submitted reports" as Submitted, and appears in the admin Reports queue (TC-ADM-010).

### TC-SET-018 · Submit an ID for verification — P1

- **Tester:** Diego (`dual.role@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings/verification`
- **Test data:** a JPG or PDF of a sample ID (any image, under 10 MB)
- **Steps:**
  1. Read the page and click **Send for review** with no file.
  2. Choose the file, click **Send for review**.
- **Expected result:**
  - The page explains "Some requests (for example, helping older adults at home) are open only to verified volunteers…
    The ID is seen only by platform staff and is never shown to anyone you help."
  - 1: "Choose a file to upload."
  - 2: "Thanks. Your document was sent for review." The status reads "Your document is with our team. We'll let you know when
    it's reviewed (usually within two business days)." Diego appears in Admin → Verification → Users (TC-ADM-012).

### TC-SET-019 · Verification status for verified and waiting users — P2

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`), then Ravi (`volunteer.remote@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings/verification`
- **Before you start:** S12 (Ravi's ID waiting)
- **Expected result:** Valerie: "You're verified. You can help in categories that need a verified volunteer." Ravi: "Your
  document is with our team…".

### TC-SET-020 · Roles page — P2

- **Tester:** Diego (`dual.role@thankyou.test` / `Password!`), then Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings/roles`
- **Expected result:**
  - "One account can volunteer and ask for help. Switch between them with the switcher at the top right of the page."
  - Diego: both **Volunteer** and **Request help** read "Active on your account" with **Use this role**.
  - Valerie: Volunteer is active; Request help has an add button. (Adding it is TC-ACC-024.)
  - Olivia (`org.admin@thankyou.test`) also sees an **Organizations** section with **Open** for each of her organizations.

### TC-SET-021 · Invite a friend — P3

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings` → **Invite friends**
- **Steps:** Click **Generate invite link**, copy the link and open it in a private window.
- **Expected result:** A share window offers the link with copy and share options. Opened signed out, the link leads to a
  ThankYou page with a way to sign up.

### TC-SET-022 · Settings use the top menu and work on a phone — P3

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/settings/account` on a desktop window, then at phone width (about 390 px, or the browser's
  device toolbar)
- **Expected result:** Desktop: the volunteer menu runs across the top (Home, Find opportunities, My applications, Schedule,
  Inbox, Impact) with the switcher, bell and avatar at the right — no sidebar. Phone: a compact top bar and the bottom tabs;
  the settings menu and forms fit the screen without sideways scrolling.
