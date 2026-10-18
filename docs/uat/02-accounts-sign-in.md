# 02 · Accounts, sign-in and onboarding

Creating an account, verifying the email, signing in and out, two-step sign-in, password reset, the
first-time setup ("onboarding"), and switching between roles.

Setup: `pnpm db:uat`. Verification and reset links appear on the page under "Development only" (see README).
Cases that change a password or turn on two-step sign-in use a **new account you create in TC-ACC-001**, so the
seed accounts keep `Password!`.

---

### TC-ACC-001 · Create a volunteer account — P1

- **Tester:** New account
- **Page:** `/signup` (header → Sign up)
- **Test data:**

  | Field | Value |
  | --- | --- |
  | Email | `uat.vol1@example.test` |
  | Password (min 8 chars) | `Uat-Pass-2026!` |
  | Confirm password | `Uat-Pass-2026!` |
  | Date of birth | `1994-06-15` |

- **Steps:**
  1. Open Sign up and read the page.
  2. Enter the data and click **Create account**.
- **Expected result:**
  - Before submitting, the page explains "ThankYou is for people 16 and older. We never show your birth date…".
  - After submitting: "Account created. Please verify your email to continue." and "Check your inbox for a
    verification email to finish creating your account."
  - A line "Development only — verification link: http://localhost:3202/verify-email?token=…" is shown, plus a
    **Resend verification** button.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-002 · Sign-up checks the password — P2

- **Tester:** New account
- **Page:** `/signup`
- **Test data:** Email `uat.vol2@example.test`, DOB `1990-01-20`; (a) Password `short1` in both boxes; (b) Password `Uat-Pass-2026!` and Confirm `Uat-Pass-2026?`
- **Steps:** Submit (a), then submit (b).
- **Expected result:**
  - (a) The form refuses: the browser asks for at least 8 characters, or the message "Password must be at least 8
    characters." appears. No account is created.
  - (b) "Passwords do not match." No account is created; the email stays filled in.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-003 · People under 16 can't sign up — P1

- **Tester:** New account
- **Page:** `/signup`
- **Test data:** Email `uat.kid@example.test`, Password/Confirm `Uat-Pass-2026!`, Date of birth **a date 15 years ago** (e.g. if today is 2026-10-12, use `2011-10-20`)
- **Steps:** Submit the form.
- **Expected result:** Error "ThankYou is for people 16 and older." No verification link is shown and no account is created.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-004 · Signing up with an email that already exists doesn't reveal it — P2

- **Tester:** New account
- **Page:** `/signup`
- **Test data:** Email `volunteer.local@thankyou.test`, Password/Confirm `Uat-Pass-2026!`, DOB `1990-05-01`
- **Steps:**
  1. Submit the form.
  2. Look at the API terminal.
- **Expected result:**
  - The page answers the same way as for a new address (it does **not** say the account exists).
  - Valerie's existing password `Password!` still works (sign in to confirm, then sign out).
  - The API terminal shows an email to volunteer.local@thankyou.test telling the owner someone tried to sign up with
    their address.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-005 · Verify the email address — P1

- **Tester:** New account `uat.vol1@example.test` (from TC-ACC-001)
- **Page:** the development verification link from TC-ACC-001
- **Steps:**
  1. Click the verification link.
  2. Read the page, then click **Verify my email**.
  3. Open the same link again in the same browser.
- **Expected result:**
  - Step 2 shows "Verify email — Confirm uat.vol1@example.test is yours." and a **Verify my email** button (opening
    the link alone does not verify, so email scanners can't use it up).
  - After clicking, you are signed in and taken to **Welcome to ThankYou** (`/onboarding`).
  - Step 3: "This link has expired or was already used".
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-006 · Resend the verification email — P3

- **Tester:** New account
- **Page:** `/signup`
- **Test data:** Email `uat.vol3@example.test`, Password/Confirm `Uat-Pass-2026!`, DOB `1988-03-03`
- **Steps:**
  1. Create the account (don't verify).
  2. Click **Resend verification**.
- **Expected result:** "Verification sent (or re-sent) if the email needs verification." and a new development link.
  The new link works (TC-ACC-005 steps 1–2).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-007 · Can't sign in before verifying — P1

- **Tester:** New account `uat.vol2@example.test` — create it first with Password/Confirm `Uat-Pass-2026!`, DOB `1990-01-20`, and **don't** verify
- **Page:** `/login`
- **Steps:** Sign in with `uat.vol2@example.test` / `Uat-Pass-2026!`.
- **Expected result:** You stay on Log in with "Please verify your email to log in" and the hint "Your email isn't
  verified yet. Please verify your email before logging in."
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-008 · Onboarding as a volunteer — P1

- **Tester:** New account `uat.vol1@example.test` (just verified in TC-ACC-005)
- **Page:** `/onboarding`
- **Test data:**

  | Step | Field | Value |
  | --- | --- | --- |
  | 1 | How you'll use it | **I want to help** |
  | 2 About you | Your name | `Vera Newcomer` |
  | | What should we call you? | `Vera` |
  | | Neighborhood or ZIP code | `Astoria, Queens, NY` |
  | | Phone | `718-555-0142` |
  | 3 Interests | Kinds of help | **Errands & chores**, **Food & meals** |
  | | Things you're good at | **Lifting & moving** |
  | | Causes you care about | **Older adults** |
  | | How far will you travel? | **Up to 15 miles** |
  | | I have a car I can use | leave unticked |
  | 4 Schedule | Days that usually work | Sat, Sun (pre-selected) + **Wed** |
  | | How | In person ✓, Remote ✓ |
  | | Hours a week | **1–3 hours** |
  | | Time zone | **America/New_York** (pre-filled from your browser) |

- **Steps:** Complete each step with **Continue**; on the last step click **Show me opportunities**.
- **Expected result:**
  - A progress bar shows 4 steps: How you'll use it · About you · Interests · Schedule.
  - "About you" says people see only your first name and neighborhood; Date of birth isn't asked again (given at sign-up).
  - You land on **"Welcome, Vera. Here's what we found for you"** with real opportunities, each with "Why it matches:"
    (e.g. skills, distance, "fits your Saturdays"), plus **See all opportunities** and **Go to my home**.
  - **Go to my home** opens "Hi, Vera" with the volunteer menu: Home, Find opportunities, My applications,
    Schedule, Inbox, Impact.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-009 · Onboarding catches missing answers — P2

- **Tester:** New account `uat.vol3@example.test` (verify it first)
- **Page:** `/onboarding`
- **Steps:**
  1. Step 1: click **Continue** without choosing an option.
  2. Choose I want to help → Continue. On About you, clear "Your name" (if prefilled) and submit with the browser's
     required-field check bypassed by entering only spaces: `   `.
  3. Fill About you properly (`Theo Tester`, `Hoboken, NJ`), Continue, **Skip for now** on Interests.
  4. On Schedule, untick every day and click Show me opportunities.
  5. Tick Sat again, untick both **In person** and **Remote**, and submit.
- **Expected result:**
  - 1: the browser asks you to pick one (or "Pick one to continue.").
  - 2: "Add your name so people know who they're talking to."
  - 3: "Skip for now" moves to Schedule without saving interests.
  - 4: "Pick at least one day (you can change it any time)."
  - 5: "Choose in person, remote, or both."
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-010 · Onboarding as someone who needs help — P1

- **Tester:** New account `uat.req1@example.test` (sign up with Password/Confirm `Uat-Pass-2026!`, DOB `1958-09-09`, then verify)
- **Page:** `/onboarding`
- **Test data:** I need a hand; Your name `Ruth Asker`; Neighborhood `Upper West Side, Manhattan, NY`; Kinds of help **Errands & chores**, **Tech help**; Anything volunteers should know? `I live on a fourth floor without an elevator.`; tick **I'd like to meet in a public place first**
- **Steps:** Complete the steps; on the last one click **Finish**.
- **Expected result:**
  - The progress bar shows 3 steps: How you'll use it · About you · What you need.
  - You land on **"Welcome, Ruth. What do you need a hand with?"** with **Ask for help** and **Go to my home**.
  - Go to my home shows "Hi, Ruth" with the requester menu: Home, My requests, Applicants, Hours, Inbox, Reviews.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-011 · Onboarding sends organizations to organization sign-up — P2

- **Tester:** New account `uat.orgperson@example.test` (sign up and verify, DOB `1980-02-02`)
- **Page:** `/onboarding`
- **Steps:** Choose **I'm with an organization**, click Continue.
- **Expected result:** You are taken to **Register your organization** (`/org/signup`) with options to start an
  organization or ask to join one (see 09-org-setup-team).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-012 · Each kind of user lands on the right home after signing in — P1

- **Tester:** Seed users (password `Password!`)
- **Page:** `/login`
- **Steps:** Sign in as each user below (log out between them) and note where you land.
- **Expected result:**

  | User | Lands on | Switcher (top right) shows |
  | --- | --- | --- |
  | volunteer.local@thankyou.test | Volunteer home "Hi, Valerie" | Volunteering |
  | requester@thankyou.test | Requester home "Hi, Rose" | Requesting help |
  | org.admin@thankyou.test | Organization home for Harbor Food Bank ("Harbor Food Bank · Admin · Verified") | Harbor Food Bank |
  | admin@thankyou.test | Admin dashboard | Platform admin |
  | moderator@thankyou.test | Moderation | Platform admin |
  | dual.role@thankyou.test | Volunteer home "Hi, Diego" (last-used role) | Volunteering |

- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-013 · Wrong password and unknown email give the same answer — P1

- **Tester:** Visitor
- **Page:** `/login`
- **Test data:** (a) `volunteer.local@thankyou.test` / `WrongPass1`; (b) `nobody.here@example.test` / `WrongPass1`
- **Steps:** Try (a), then (b).
- **Expected result:** Both show **"Invalid email or password"** and stay on Log in. Neither says whether the account exists.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-014 · Log out — P1

- **Tester:** Valerie (`volunteer.local@thankyou.test`)
- **Page:** any signed-in page
- **Steps:**
  1. Open the account menu (the round avatar at the top right).
  2. Click **Log out**.
  3. Press the browser Back button, then open `/volunteer/dashboard`.
- **Expected result:**
  - The account menu offers Profile, Settings, Help and Log out.
  - After Log out you're signed out; going back or opening the dashboard shows the Log in page, not Valerie's data.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-015 · Reset a forgotten password — P1

- **Tester:** New account `uat.vol1@example.test`
- **Page:** `/login` → **Forgot password?**
- **Test data:** new password `Uat-Reset-2026!`
- **Steps:**
  1. Enter `uat.vol1@example.test`, click **Send reset link**.
  2. Click the development reset link.
  3. Enter the new password and click **Update password**.
  4. Sign in with the **old** password `Uat-Pass-2026!`, then with the new one.
- **Expected result:**
  - Step 1: "If an account exists for that email, a reset link has been sent." The page address doesn't contain your email.
  - Step 3 lands on Log in with "Password updated. You can log in now."
  - The old password fails ("Invalid email or password"); the new one signs you in.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-016 · Reset links work once and don't reveal accounts — P2

- **Tester:** Visitor
- **Page:** `/forgot-password`
- **Steps:**
  1. Request a reset for `nobody.here@example.test`.
  2. Open the reset link used in TC-ACC-015 again and try to set `Another-Pass-2026!`.
  3. Open `/reset-password` with no link.
- **Expected result:**
  - 1: the same "If an account exists…" message (no link is shown because no account exists).
  - 2: an error such as "Token already used"; the password doesn't change.
  - 3: "Missing reset token. Use the link from your email."
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-017 · Change the password in Settings — P1

- **Tester:** `uat.vol1@example.test` (password `Uat-Reset-2026!` after TC-ACC-015)
- **Page:** Settings → **Account** (`/settings/account`)
- **Steps:**
  1. Current password `WrongPass1`, New and Confirm `Uat-Change-2026!` → **Update password**.
  2. Current `Uat-Reset-2026!`, New and Confirm `Uat-Reset-2026!` → Update password.
  3. Current `Uat-Reset-2026!`, New `Uat-Change-2026!`, Confirm `Uat-Change-2026?` → Update password.
  4. Sign in as the same account in a second browser. In the first browser: Current `Uat-Reset-2026!`, New and Confirm `Uat-Change-2026!` → Update password. Refresh the second browser.
- **Expected result:**
  - 1: "Current password is incorrect".
  - 2: "New password must be different from current password".
  - 3: "The new passwords don't match."
  - 4: "Password updated. Your other sessions were signed out." The second browser is sent to Log in.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-018 · Turn on two-step sign-in — P1

- **Tester:** `uat.vol1@example.test` (password `Uat-Change-2026!`)
- **Page:** Settings → Account → **Two-step sign-in**
- **Before you start:** an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password…)
- **Steps:**
  1. Type your password in "Confirm your password to start", click **Set up two-step sign-in**.
  2. Scan the QR code with the app (or type the key shown under "Can't scan?").
  3. Type a wrong code `000000` → **Turn on**.
  4. Type the current 6-digit code from the app → **Turn on**.
  5. Copy the 10 recovery codes somewhere, click **I saved them**.
- **Expected result:**
  - 2: a QR code and a key grouped in fours.
  - 3: "That code didn't work. Check the time on your phone and try again."
  - 4: "Two-step sign-in is on. Other devices were signed out." and a list of **10 recovery codes** with "They won't be shown again."
  - 5: the section now reads "**On.** Signing in asks for a code from your authenticator app."
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-019 · Sign in with two-step sign-in — P1

- **Tester:** `uat.vol1@example.test`
- **Page:** `/login` in a fresh private window
- **Steps:**
  1. Sign in with email and password.
  2. On "Enter your code", type `000000` → **Continue**.
  3. Type the current code from the app → Continue.
- **Expected result:**
  - 1: "Enter your code — Open your authenticator app and type the 6-digit code for ThankYou." with a hint about recovery codes.
  - 2: "That code didn't work. Check your app and try again."
  - 3: signed in, on your home page.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-020 · Sign in with a recovery code — P2

- **Tester:** `uat.vol1@example.test`
- **Page:** `/login` (new private window)
- **Steps:**
  1. Sign in with email and password; on "Enter your code" type one of the recovery codes from TC-ACC-018.
  2. Log out and repeat with the **same** recovery code.
- **Expected result:** 1 signs you in. 2 is refused ("That code didn't work…") — each recovery code works once.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-021 · Too many wrong codes locks two-step sign-in for a while — P3

- **Tester:** `uat.vol1@example.test`
- **Page:** `/login` (new private window)
- **Steps:** Sign in with the password, then enter wrong codes (`111111`, `222222`, …). When asked for the password
  again, enter it and keep entering wrong codes, up to 10 wrong codes in total.
- **Expected result:** After several wrong codes you're sent back to enter your password again ("Too many tries.
  Enter your password again."). After 10 wrong codes in 15 minutes: "Too many wrong codes. Wait 15 minutes, then
  sign in again." A correct code is also refused until then.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-022 · Turn off two-step sign-in — P2

- **Tester:** `uat.vol1@example.test` (signed in)
- **Page:** Settings → Account → Two-step sign-in → **Turn it off**
- **Steps:**
  1. Enter your password and code `000000` → **Turn off**.
  2. Enter your password and a current code → Turn off.
  3. Log out and sign in again.
- **Expected result:** 1: "That code didn't work". 2: "Two-step sign-in is off." 3: no code is asked.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-023 · Switch between volunteering and requesting help — P1

- **Tester:** Diego (`dual.role@thankyou.test`)
- **Page:** Volunteer home
- **Steps:**
  1. Look at the menu along the top.
  2. Click the switcher at the top right ("Volunteering"), choose **Requesting help**.
  3. Open **My requests**. Open Settings and refresh the page.
  4. Switch back to **Volunteering**.
- **Expected result:**
  - 1: menu shows Find opportunities (and no My requests).
  - 2: you land on "Hi, Diego" requester home; the switcher reads **Requesting help**; menu shows My requests,
    Applicants, Hours, Reviews (and no Find opportunities). You were not asked to sign in again.
  - 3: My requests lists Diego's requests (none from the seed — "Active (0)"). After refreshing Settings the switcher still reads Requesting help.
  - 4: back on the volunteer home.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-024 · Add a second role to an account — P1

- **Tester:** `uat.req1@example.test` (requester from TC-ACC-010)
- **Page:** account menu → Settings → **Roles** (`/settings/roles`), or the switcher's **Add a role**
- **Steps:**
  1. Read the Roles page.
  2. Click **Add volunteer role** (the button under "Volunteer").
  3. Open the switcher at the top right.
- **Expected result:**
  - 1: "Request help — Active on your account" and a Volunteer card with an add button.
  - 2: you land on the volunteer Profile page ready to fill in (`/volunteer/profile?setup=1`).
  - 3: the switcher offers both **Volunteering** and **Requesting help**; your requester data is unchanged.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-025 · A signed-in visitor without the volunteer role is invited to add it — P2

- **Tester:** Rose (`requester@thankyou.test`, requester only)
- **Page:** `/opportunities` → open *Community garden weeding*
- **Steps:** Read the right-hand box.
- **Expected result:** Instead of an Apply form: "Add the volunteer role to your account to apply. Your other roles stay
  as they are." with an **Add volunteer role** button. (Don't click it unless you then re-run `pnpm db:uat`.)
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-026 · Session survives a browser refresh and new tab — P3

- **Tester:** Valerie
- **Page:** Volunteer home
- **Steps:** Refresh the page; open `http://localhost:3202/volunteer/applications` in a new tab of the same window.
- **Expected result:** Still signed in as Valerie in both tabs; no second sign-in.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-ACC-027 · Sign-in can't be redirected to another website — P2

- **Tester:** Valerie
- **Page:** `http://localhost:3202/login?returnTo=//evil.example`
- **Steps:** Sign in as Valerie from that address.
- **Expected result:** You land on a ThankYou page (your home); the browser never goes to evil.example.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:
