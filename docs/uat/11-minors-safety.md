# 11 · Volunteers under 18

Volunteer Services is for people 16 and older. Volunteers aged 16 and 17 get extra protection: they don't see or apply to
individuals' requests, their contact details stay hidden even after they're accepted, they can't share a profile
or join an organization's team, and organizations can ask for a parent or guardian's consent.

The seeded teenager is **Tara** (`teen.volunteer@volunteer-services-app.test`, 17). Setup: `pnpm db:uat`. S4 = Tara waiting on
*Saturday distribution shift*; S6 = Tara accepted on Lincoln High's *After-school homework club helpers*.

---

### TC-MIN-001 · Under-16s can't create an account — P1

- **Tester:** Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/signup`
- **Test data:** Email `uat.kid2@example.test`; Password/Confirm `Uat-Pass-2026!`; Date of birth **15 years and 6 months ago**
- **Steps:** Fill in the form and click **Create account**.
- **Expected result:** "Volunteer Services is for people 16 and older." No account is created and no verification link is shown.
  (Same rule as TC-ACC-003, with a different date.)

### TC-MIN-002 · A 16-year-old can sign up — P2

- **Tester:** New account you create here — `uat.teen16@example.test` / `Uat-Pass-2026!`
- **Page:** `http://localhost:3202/signup`
- **Test data:** Date of birth **16 years and 1 month ago**
- **Steps:**
  1. Create the account and verify it with the development link.
  2. Finish onboarding as **I want to help** (name `Tess Teen`, area `Jersey City, NJ`, any interests, Sat and Sun).
- **Expected result:** The account is created and you reach "Welcome, Tess…" with matched opportunities. None of the
  opportunities shown are neighbors' requests (see TC-MIN-003).

### TC-MIN-003 · Teens don't see individuals' requests in their lists — P1

- **Tester:** Tara (`teen.volunteer@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/opportunities/recommended`, then `http://localhost:3202/volunteer/opportunities/nearby`
- **Steps:** Look through Recommended and Near you. Search `groceries`, then `phone`.
- **Expected result:**
  - Only opportunities posted by organizations (Harbor Food Bank, Lincoln High School, Bright Futures Tutoring) are listed.
  - Rose's requests (*Walk and talk in the park*, *Help me carry groceries upstairs*, *Set up my new phone*, *Ride to a
    medical appointment*…) never appear; the searches find nothing.

### TC-MIN-004 · A teen who opens an individual's request is told why they can't apply — P1

- **Tester:** Tara (`teen.volunteer@volunteer-services-app.test` / `Password!`)
- **Page:** the address of *Ride to a medical appointment*, `http://localhost:3202/volunteer/opportunities/<id>` (copy it from
  Valerie's view: sign in as Valerie, `http://localhost:3202/volunteer/opportunities/nearby`, open it, copy the address)
- **Steps:** Open the copied address as Tara.
- **Expected result:** The page opens but there is no Apply form. "You can't apply yet" lists "Requests from individuals are
  open to volunteers 18 and older. Look for opportunities from organizations."

### TC-MIN-005 · A minimum age on an opportunity is enforced — P1

- **Tester:** Olivia (`org.admin@volunteer-services-app.test` / `Password!`), then Tara (`teen.volunteer@volunteer-services-app.test` / `Password!`), then Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** Olivia: `http://localhost:3202/org/requests` → *Sort donations at the pantry* → **Edit** → step 4 **Requirements**;
  Tara and Valerie: `http://localhost:3202/volunteer/opportunities/nearby` → *Sort donations at the pantry*
- **Test data:** Minimum age `18`
- **Steps:**
  1. Olivia sets Minimum age to `18` and saves the step.
  2. Tara looks for *Sort donations at the pantry* in Near you, then opens it from its address (copy it from Valerie).
  3. Valerie opens it.
- **Expected result:**
  - The opportunity shows "18+ years old" under requirements.
  - 2: it no longer appears in Tara's lists; opened directly it says "This opportunity is for volunteers 18 and older." with no Apply form.
  - 3: Valerie (adult) can apply.
  - Afterwards, Olivia clears the Minimum age (or re-run `pnpm db:uat`).

### TC-MIN-006 · Organizers see that an applicant is under 18 — P1

- **Tester:** Olivia (`org.admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/org/requests` → *Saturday distribution shift* → **Applicants**
- **Before you start:** S4
- **Expected result:** Tara's card shows "Under 18 · talk in messages; contact details stay hidden". No email address or
  phone number is shown for Tara (Valerie, who is accepted and an adult, does show her contact details to Olivia).

### TC-MIN-007 · A teen's contact details stay hidden even after acceptance — P1

- **Tester:** Olivia (`org.admin@volunteer-services-app.test` / `Password!`), then Tara (`teen.volunteer@volunteer-services-app.test` / `Password!`)
- **Page:** Olivia: `http://localhost:3202/org/requests` → *Saturday distribution shift* → **Applicants**, then
  `http://localhost:3202/inbox`; Tara: `http://localhost:3202/inbox`
- **Before you start:** S4
- **Test data:** Tara's reply: `My cell is 201-555-0177 and my email is tara.y@example.org`
- **Steps:**
  1. Olivia clicks **Accept** on Tara.
  2. Tara opens the Harbor Food Bank conversation about *Saturday distribution shift* and sends the test message.
  3. Olivia opens the same conversation.
- **Expected result:**
  - 1: Tara is accepted; her card still shows no email or phone.
  - 3: Olivia sees "[contact details hidden until accepted]" in place of the phone number and email, even though Tara
    is accepted. Tara sees her own message in full.
  - The organization's roster (`http://localhost:3202/org/roster`) and CSV exports also leave Tara's email blank.

### TC-MIN-008 · An organization asks for a parent or guardian's consent — P1

- **Tester:** Sam (`school.admin@volunteer-services-app.test` / `Password!`), then Tara (`teen.volunteer@volunteer-services-app.test` / `Password!`)
- **Page:** Sam: `http://localhost:3202/org/requests` → *After-school homework club helpers* → **Edit** → step 4
  **Requirements**; Tara: `http://localhost:3202/volunteer/applications` → *After-school homework club helpers*
- **Before you start:** S6 (Tara accepted)
- **Test data:** Their name `Grace Young`; Their email `grace.young@example.test`; They are your **Parent**
- **Steps:**
  1. Sam ticks **If under 18, have a parent or guardian's consent** and saves the step.
  2. Tara opens her application and reads the "Before your shift" box.
  3. Tara fills in her parent's details and clicks **Ask for consent**.
- **Expected result:**
  - 2: "Before your shift" lists **Consent from a parent or guardian** with "Because you're under 18, a parent or guardian
    needs to say yes. We'll email them a link with the details." and the form.
  - 3: "We emailed your parent or guardian. You'll get a notification when they answer." The item now reads "Waiting for
    Grace Young to respond." A line "Development only: the guardian's link is http://localhost:3202/guardian/consent/…"
    is shown, and the API terminal shows the email to grace.young@example.test.
  - Tara can't use a check-in code for this shift until consent is given (TC-MIN-011).

### TC-MIN-009 · The parent gives consent — P1

- **Tester:** Visitor (the parent; signed out, no login needed — use a private window)
- **Page:** the guardian link from TC-MIN-008, `http://localhost:3202/guardian/consent/<token>`
- **Before you start:** TC-MIN-008
- **Test data:** Your full name `Grace Young`; tick **I am Tara's parent or legal guardian.**
- **Steps:**
  1. Open the link and read the page.
  2. Click **I give consent** without ticking the box.
  3. Tick the box and click **I give consent**.
  4. Tara refreshes her application.
- **Expected result:**
  - 1: "Parent or guardian consent — Tara would like to volunteer with Lincoln High School", the opportunity's title,
    organization ("verified organization"), date and area, description, and "Messages with your teenager happen only in
    this opportunity's thread on Volunteer Services… phone numbers and email addresses are hidden in it." No account is needed.
  - 2: the browser asks you to tick the box; nothing is recorded.
  - 3: "Thank you. You gave consent for "After-school homework club helpers". Tara and the organizer have been told."
  - 4: the consent item shows a green tick and "done"; Tara gets a notification.

### TC-MIN-010 · The parent declines, and Tara asks again — P2

- **Tester:** Tara (`teen.volunteer@volunteer-services-app.test` / `Password!`), then Visitor (the parent)
- **Page:** Tara: `http://localhost:3202/volunteer/applications` → *After-school homework club helpers*; parent: the new
  `http://localhost:3202/guardian/consent/<token>` link
- **Before you start:** re-run `pnpm db:uat` and repeat TC-MIN-008 steps 1–3
- **Steps:**
  1. The parent opens the link and clicks **I don't consent** (name filled, box ticked).
  2. Tara refreshes her application.
  3. Tara clicks **Send a new request** with the same details. The parent opens the **old** link, then the new one.
- **Expected result:**
  - 1: "You declined consent for "After-school homework club helpers". Tara and the organizer have been told."
  - 2: the item is marked with a warning, "Grace Young declined.", and the panel says check-in is blocked until it's done.
  - 3: the old link now says "This link isn't valid — It may have been replaced by a newer request…"; the new link asks again.

### TC-MIN-011 · Check-in waits for consent — P2

- **Tester:** Sam (`school.admin@volunteer-services-app.test` / `Password!`), then Tara (`teen.volunteer@volunteer-services-app.test` / `Password!`)
- **Page:** Sam: `http://localhost:3202/org/requests` → *After-school homework club helpers* → **Applicants** and
  **On-site check-in**; Tara: the check-in link `http://localhost:3202/check-in/<token>`
- **Before you start:** TC-MIN-008 done but **not** TC-MIN-009 (consent requested, no answer). Check-in opens 2 hours before
  a session, so either run this on the day, or post a separate Lincoln request starting in 1 hour with the consent box
  ticked and have Tara apply and Sam accept.
- **Steps:**
  1. Sam opens Applicants and looks at Tara's card.
  2. Tara opens the check-in link.
  3. The parent gives consent (TC-MIN-009); Tara opens the check-in link again.
- **Expected result:**
  - 1: the card reads "Before check-in: Consent from a parent or guardian" and the staff check-in button is hidden.
  - 2: "Finish these first:" lists the consent with "Open your application to finish them". No check-in happens.
  - 3: **Check in now** works.

### TC-MIN-012 · Teens can't share a profile or join an organization's team — P1

- **Tester:** Tara (`teen.volunteer@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/profile/share`, then `http://localhost:3202/org/signup`
- **Steps:**
  1. Open Share your profile.
  2. Open Register your organization → **Join your team's organization**, choose Harbor Food Bank, tick the 18+ box and send.
- **Expected result:**
  - 1: "Profiles of volunteers under 18 can't be shared. Your hours and record are still kept in Impact." No link can be created.
  - 2: refused with "Organization team members must be 18 or older." No join request reaches Harbor.
  - An organization invite sent to a teen's email is refused for the same reason when they try to accept it.
