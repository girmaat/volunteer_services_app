# 15 · Access control: who can open what

These cases check that every private page is closed to the wrong person: signed-out visitors, people with the
wrong role, staff of another organization, and anyone typing someone else's address. The rule is simple: if you
may not see something, you get the **Log in** page (signed out), your own home page (wrong area), **Access
denied** (admin tools) or **Page not found** (someone else's record — the site doesn't even confirm it exists).

Internal ids in addresses change on every `pnpm db:uat`, so several cases first ask the owner to copy the address
from their browser. Keep two windows: the owner's and the other tester's (private window).

Setup: `pnpm db:uat`.

---

### TC-SEC-001 · Private pages ask a visitor to log in — P1

- **Tester:** Visitor (signed out, no login needed)
- **Page:** each of `http://localhost:3202/dashboard`, `http://localhost:3202/volunteer/dashboard`,
  `http://localhost:3202/requester/requests`, `http://localhost:3202/org/dashboard`, `http://localhost:3202/org/team`,
  `http://localhost:3202/inbox`, `http://localhost:3202/notifications`, `http://localhost:3202/settings`,
  `http://localhost:3202/admin`, `http://localhost:3202/volunteer/profile/share`
- **Steps:** Open each address in a private window.
- **Expected result:** Every one shows the **Log in** page; the address bar ends with `?returnTo=` and the page you
  asked for. No private content flashes on screen first.

### TC-SEC-002 · After logging in you land on the page you asked for — P1

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/history` (signed out)
- **Steps:** Open the address, log in on the page that appears.
- **Expected result:** You land on **Impact** (`http://localhost:3202/volunteer/history`), not the home page.
  (Leaving the site through `returnTo` is covered in TC-ACC-027.)

### TC-SEC-003 · A volunteer can't open requester or organization tools — P1

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/requester/requests`, `http://localhost:3202/requester/hours`,
  `http://localhost:3202/org/dashboard`, `http://localhost:3202/org/applications`
- **Steps:** Open each address.
- **Expected result:** Each one sends Valerie to her own home (`http://localhost:3202/volunteer/dashboard`). No
  requester or organization data is shown.

### TC-SEC-004 · A requester without the volunteer role can't open volunteer tools — P1

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/dashboard`, `http://localhost:3202/volunteer/opportunities/recommended`,
  `http://localhost:3202/volunteer/history`, `http://localhost:3202/org/dashboard`
- **Steps:** Open each address.
- **Expected result:** Each sends Rose to her home (`http://localhost:3202/requester/dashboard`). On a public
  opportunity page she's offered to add the volunteer role instead of an Apply button (TC-ACC-025).

### TC-SEC-005 · Staff-only tools — P1

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), Maya (`moderator@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin`, `http://localhost:3202/admin/users`, `http://localhost:3202/admin/audit`
- **Steps:** Open each address as Valerie, then as Maya.
- **Expected result:** Valerie: **Access denied** on all three. Maya: `/admin` opens Moderation, `/admin/users` is
  **Access denied**, `/admin/audit` says "The audit log is for platform admins." (Full detail in TC-ADM-002 and
  TC-ADM-032.)

### TC-SEC-006 · Someone else's application — P1

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), then Diego (`dual.role@volunteer-services-app.test` / `Password!`)
- **Page:** Valerie: `http://localhost:3202/volunteer/applications` → *Saturday distribution shift* (copy the address,
  `http://localhost:3202/volunteer/applications/<id>`)
- **Before you start:** S4
- **Steps:** Diego (Volunteering) pastes Valerie's address into his window.
- **Expected result:** **Page not found**. Diego never sees Valerie's message, status or the street address.

### TC-SEC-007 · Someone else's conversation — P1

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), then Diego (`dual.role@volunteer-services-app.test` / `Password!`)
- **Page:** Valerie: `http://localhost:3202/inbox` → Rose · *Help me carry groceries upstairs* (copy the address,
  `http://localhost:3202/inbox/<id>`)
- **Before you start:** S1
- **Steps:** Diego opens Valerie's conversation address.
- **Expected result:** **Page not found**. No messages are shown. (Organization members who aren't admins or
  managers get the same answer for their organization's conversations — TC-MSG-013.)

### TC-SEC-008 · Someone else's request and its applicants — P1

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`), then Diego (`dual.role@volunteer-services-app.test` / `Password!`)
- **Page:** Rose: `http://localhost:3202/requester/requests` → *Walk and talk in the park* (copy the address,
  `http://localhost:3202/requester/requests/<id>`), and its **Applicants** page (`…/<id>/applications`)
- **Steps:** Diego switches to **Requesting help** and opens both addresses.
- **Expected result:** **Page not found** for both. Diego can't see Rose's applicants, the exact address or the
  history.

### TC-SEC-009 · Another organization's requests — P1

- **Tester:** Olivia (`org.admin@volunteer-services-app.test` / `Password!`), then Sam (`school.admin@volunteer-services-app.test` / `Password!`)
- **Page:** Olivia (Harbor Food Bank): `http://localhost:3202/org/requests` → *Saturday distribution shift* (copy
  `http://localhost:3202/org/requests/<id>` and `…/<id>/applications`)
- **Steps:** Sam (Lincoln High School) opens both addresses.
- **Expected result:** **Page not found** for both. Sam sees nothing of Harbor's applicants, address or check-in code.

### TC-SEC-010 · Organization members can look but not act — P1

- **Tester:** Marcus (`org.member@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/org/applications`, `http://localhost:3202/org/requests` → *Saturday distribution
  shift* → **Applicants**, `http://localhost:3202/org/documents`, `http://localhost:3202/org/hours`,
  `http://localhost:3202/org/requests/new`
- **Steps:** Open each page.
- **Expected result:**
  - Applicants: "You can see who applied. Your organization's admins and managers accept volunteers and message
    them." No Accept / Waitlist / Decline / Message buttons.
  - The request's Applicants page: each card says "Admins and managers accept volunteers, take attendance and
    message them." — no Check in, Mark complete, Confirm schedule or Message.
  - The request page has no Edit, Pause, Mark as completed, Cancel or check-in code; the side box says "Admins and
    managers change, pause or complete requests and show the check-in code."
  - Forms and waivers: the forms are listed with Download only, and "Admins and managers upload new forms and assign
    them to requests." — no upload, assign or new-version controls.
  - Hours: "Your organization's admins and managers review volunteer hours…" (no error message).
  - New request: back on Requests with "Only admins and managers can post requests."
  - Volunteers' email addresses and phone numbers never appear (TC-OPS-027).

### TC-SEC-011 · Unpublished, in-review and sensitive requests can't be opened by address — P1

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`), then Visitor (signed out, no login needed), then Diego (`dual.role@volunteer-services-app.test` / `Password!`)
- **Page:** Rose: `http://localhost:3202/requester/requests` → *Draft: garden cleanup (not published)*, *Help hanging
  curtains and a shelf* and *Explain my electricity bill*. Copy each request's id (the last part of the address)
  and open `http://localhost:3202/opportunities/<id>`.
- **Steps:** Open the three public addresses as a visitor, then as Diego (not ID-verified).
- **Expected result:** **Page not found** for all three, for the visitor and for Diego (he isn't ID-verified, so the
  sensitive request is hidden from him too). An ID-verified volunteer such as Valerie can open the sensitive one.

### TC-SEC-012 · Exact addresses stay hidden from people who aren't accepted — P1

- **Tester:** Diego (`dual.role@volunteer-services-app.test` / `Password!`), Tara (`teen.volunteer@volunteer-services-app.test` / `Password!`), Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/opportunities/<id>` of *Saturday distribution shift* (open it from Find
  opportunities)
- **Before you start:** S4 (Valerie accepted; Diego and Tara pending)
- **Steps:** Open the page as each tester; also open each tester's application page.
- **Expected result:** Diego and Tara see "Queens, NY" and "The exact address and contact details are shared when you
  apply for this opportunity and your application is accepted." Only Valerie sees **87-10 Queens Blvd, Elmhurst,
  NY** ("Shared with you because you were accepted").

### TC-SEC-013 · Private volunteer profiles — P1

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), then Diego (`dual.role@volunteer-services-app.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/volunteers/<Valerie's id>`. To get the id: as Valerie open
  `http://localhost:3202/settings/account` → **Download my data (JSON)**, open the file and copy the `id` under
  `"account"` at the top.
- **Steps:** Open the address as Valerie, as Diego and as a visitor.
- **Expected result:** Valerie sees her own full profile. Diego and the visitor get **Page not found**. Nothing on
  the site links to this address; the only way for others to see a volunteer is a share link the volunteer made
  (TC-PUB-009).

### TC-SEC-014 · A banned user is locked out — P1

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Ravi (`volunteer.remote@volunteer-services-app.test` / `Password!`)
- **Page:** Ada: `http://localhost:3202/admin/users`. Ravi: `http://localhost:3202/volunteer/dashboard`
- **Steps:**
  1. Ravi signs in and stays on his dashboard.
  2. Ada bans Ravi for 1 day (TC-ADM-018 step 1).
  3. Ravi clicks any menu item; then signs out and tries to sign in.
  4. Ada unbans Ravi.
- **Expected result:** 3: Ravi is signed out and can't sign back in ("This account is suspended"). 4: he can sign in again.

### TC-SEC-015 · Logging out closes every private page — P1

- **Tester:** Olivia (`org.admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/org/applications`
- **Steps:**
  1. Open Applicants, then avatar → **Log out**.
  2. Press the browser's Back button and refresh.
  3. Open `http://localhost:3202/org/applications` again.
- **Expected result:** 2–3: the **Log in** page each time; no applicant data is shown after logging out. Other tabs
  that were open are signed out on their next click.

### TC-SEC-016 · Files and records belong to their owners — P2

- **Tester:** Olivia (`org.admin@volunteer-services-app.test` / `Password!`), then Sam (`school.admin@volunteer-services-app.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** Olivia: `http://localhost:3202/org/documents` → **Download** on a form (copy the address,
  `http://localhost:3202/org/documents/<id>/download`). Use a form uploaded in TC-OPS-014.
- **Before you start:** TC-OPS-014
- **Steps:** Open the download address as Sam, then as a visitor. Also try a message attachment address from
  TC-MSG-008 (`http://localhost:3202/api/inbox/attachments/<id>`) as Diego (`dual.role@volunteer-services-app.test` / `Password!`).
- **Expected result:** Sam and Diego don't get the file (a not-found or error page instead of a download); the
  visitor gets the log-in page. Hour
  evidence follows the same rule (TC-HRS-018).
