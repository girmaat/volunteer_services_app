# 09 · Organizations: sign-up, team and settings

Registering an organization (new account or existing account), finishing setup, verification by ThankYou
staff, inviting teammates and approving join requests, roles (admin, manager, member, school coordinator),
the organization profile and logo, its web address, the publishing rule (owner approval), organization
type, and switching between organizations.

Roles in short: **Admin** = owner, everything. **Manager** = day-to-day work and invites, no admin-only
settings; requests may need the owner's approval. **Member** = view only, no contact details. **School
coordinator** = schools only, member-level access for now.

Setup: `pnpm db:uat`.

---

### TC-ORG-001 · Register an organization with a new account — P1

- **Tester:** New account you create here — `uat.riley@example.test` / `Uat-Org-2026!`
- **Page:** `http://localhost:3202/org/signup` (footer → Register an organization)
- **Test data:**

  | Field | Value |
  | --- | --- |
  | Organization name | `Riverside Mutual Aid` |
  | What does it do? | `Neighbors helping neighbors along the river.` |
  | City or area | `Astoria, Queens, NY` |
  | Your name | `Riley Admin` |
  | Work email | `uat.riley@example.test` |
  | Password | `Uat-Org-2026!` |
  | I'm 18 or older and allowed to act for this organization | ticked |

- **Steps:**
  1. Fill in the form, click **Create organization account**.
  2. Click the development verification link, then **Verify my email**.
- **Expected result:**
  - 1: "Check your email" with the development verification link. No web address ("slug") or separate contact email was asked for.
  - 2: you're signed in on **"Finish setting up Riverside Mutual Aid"** (`/org/onboarding`) with Your name pre-filled "Riley Admin".

### TC-ORG-002 · Finish organization setup — P1

- **Tester:** `uat.riley@example.test` / `Uat-Org-2026!` (created in TC-ORG-001)
- **Page:** `http://localhost:3202/org/onboarding`
- **Before you start:** TC-ORG-001
- **Test data:** Phone `718-555-0100`; Website `riverside.example.org`; keep the other fields as shown
- **Steps:** Read "Last step — Check how volunteers will see you…", fill the phone and website, click **Go to Org Home**.
- **Expected result:** Organization home (`/org/dashboard?welcome=1`) with "Your organization is set up." and a "Finish setting
  up" checklist (verification etc.). The organization's public address was generated from the name
  (`/organizations/riverside-mutual-aid…`). The website is saved as `https://riverside.example.org`.

### TC-ORG-003 · Organization sign-up checks — P2

- **Tester:** Visitor (signed out) trying the sign-up form; no account is created
- **Page:** `http://localhost:3202/org/signup`
- **Steps:** Submit with (a) the 18+ box unticked; (b) password `short`; (c) Work email `volunteer.local@thankyou.test`.
- **Expected result:** (a) "Confirm you're 18 or older and allowed to act for the organization."; (b) "Choose a password with at
  least 8 characters."; (c) the page answers like a normal sign-up ("Check your email") without saying the address has an account; no
  organization is created; Valerie's password still works; the API terminal shows an email to Valerie "You already have a ThankYou
  account" explaining how to add an organization to her account.

### TC-ORG-004 · An existing user starts an organization — P2

- **Tester:** `uat.orgperson@example.test` / `Uat-Pass-2026!` (created in TC-ACC-011), or any signed-in personal account without an organization
- **Page:** `http://localhost:3202/org/signup` while signed in
- **Test data:** Organization name `Hoboken Library Friends`; What does it do? `Volunteers who help run library events.`; City `Hoboken, NJ`; Your name (if asked) `Pat Organizer`; 18+ ticked
- **Steps:** Under **Start a new organization** fill in and click **Create organization**.
- **Expected result:** "You'll be its admin, signed in as <email>. Anything you already do on ThankYou stays as it is." After
  creating: the Finish-setting-up page. The switcher at the top right now lists the organization alongside any personal role.

### TC-ORG-005 · Ask to join an organization — P1

- **Tester:** Diego (`dual.role@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/org/signup` while signed in → **Join your team's organization**
- **Test data:** Organization's ThankYou address `harbor-food-bank`; 18+ ticked
- **Steps:** Fill in and click **Ask to join**.
- **Expected result:** "Request sent. The organization's admins will approve it, and you'll get a notification." Diego gets no
  access to Harbor's pages yet (`/org/dashboard` doesn't show Harbor). Olivia and Nora get a notification and an email
  "Join request for Harbor Food Bank".

### TC-ORG-006 · Approve a join request — P1

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`), then Ravi (`volunteer.remote@thankyou.test` / `Password!`)
- **Page:** Olivia: `http://localhost:3202/org/team` → **Requests to join** (Organization → **Organization**, Team tab); Ravi: bell, `http://localhost:3202/notifications`
- **Before you start:** S8 (Ravi asked to join)
- **Steps:**
  1. Read the section; click **Approve** on Ravi Patel.
  2. Ravi signs in again (or refreshes) and opens the switcher.
- **Expected result:**
  - 1: the warning "Only approve people you know work or volunteer with you: members see applicants and messages."; after
    approving: "Approved. They're now a member." Ravi appears under Active members as Member.
  - 2: Ravi can switch to **Harbor Food Bank** and sees the organization area as a member (no contact details).

### TC-ORG-007 · Decline a join request — P2

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/org/team` → **Requests to join**
- **Before you start:** TC-ORG-005 (Diego asked to join)
- **Steps:** Click **Decline** on Diego's request.
- **Expected result:** "Request declined." Diego gets no access; Requests to join shows "No requests waiting." when empty.

### TC-ORG-008 · Invite a teammate by email — P1

- **Tester:** Nora (`org.manager@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/org/team` → **Invite a teammate**
- **Test data:** Email `uat.teammate@example.test`; Role **Member**
- **Steps:** Fill in **Invite a teammate**, click **Send invite**.
- **Expected result:** "Invite sent." The invite appears under **Pending invites** (Status: Invited) with **Resend** and a cancel
  option. The API terminal shows the invite email with a link `/org/invite?token=…` (a "Local dev link" may also be shown on the page).

### TC-ORG-009 · Accept an invite — P1

- **Tester:** New account you create in this case — `uat.teammate@example.test` / `Uat-Team-2026!`
- **Page:** the invite link from the API terminal, `http://localhost:3202/org/invite?token=…`
- **Before you start:** TC-ORG-008
- **Steps:**
  1. Open the invite link signed out.
  2. Sign up with `uat.teammate@example.test` (Password `Uat-Team-2026!`, DOB `1985-04-04`), verify, then open the invite link again.
  3. Tick the 18+ box and click **Accept invite**.
- **Expected result:** 1: "Please log in (or create an account) using the invited email address, then return to this link."
  3: the account joins Harbor Food Bank as Member and lands in the organization area. The invite disappears from Pending invites.

### TC-ORG-010 · Invites only work for the invited email — P2

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** the new invite link from the API terminal, `http://localhost:3202/org/invite?token=…`, and `http://localhost:3202/org/invite?token=abc`
- **Before you start:** a new pending invite (repeat TC-ORG-008 with `uat.teammate2@example.test`)
- **Steps:** Signed in as Valerie, open that invite link and try to accept.
- **Expected result:** The invite is refused (it belongs to a different email); Valerie does not join Harbor. An invalid token
  shows "This invite link is invalid or expired."

### TC-ORG-011 · Change a member's role and remove a member — P1

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/org/team` → **Active members**
- **Steps:**
  1. Change Marcus Lee from Member to **Manager**, click **Update**.
  2. Change him back to **Member**, Update.
  3. Click **Remove** on Marcus (re-run `pnpm db:uat` afterwards if later tests need him).
- **Expected result:** 1–2: the role shows the new value after the page reloads; Marcus's access changes accordingly (as Manager he
  sees volunteers' contact details, as Member he doesn't — see OPS-026). 3: Marcus disappears from Active members and loses access to Harbor's pages.

### TC-ORG-012 · The only admin can't be demoted or removed — P1

- **Tester:** `uat.riley@example.test` / `Uat-Org-2026!` (created in TC-ORG-001) — the only admin of Riverside Mutual Aid
- **Page:** `http://localhost:3202/org/team`
- **Steps:** Try to change Riley's own role to Member and Update.
- **Expected result:** "This is the only admin. Make someone else an admin first." Riley stays admin. There's no Remove button on yourself.

### TC-ORG-013 · Managers and members have limited team powers — P1

- **Tester:** Nora (`org.manager@thankyou.test` / `Password!`) (manager), then Marcus (`org.member@thankyou.test` / `Password!`) (member)
- **Page:** `http://localhost:3202/org/team`
- **Expected result:**
  - Nora can invite teammates and approve/decline join requests, but can't change anyone's role (only admins can) — an attempt
    is refused with an error.
  - Marcus sees "Only org admins and managers can invite teammates." and no Approve/Decline or Remove buttons; role menus are disabled.

### TC-ORG-014 · Edit the organization profile — P1

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/org/settings` (Organization → **Settings**)
- **Test data:** Summary `Neighborhood food pantry serving Queens and Brooklyn families.`; Service area `Queens and Brooklyn`; Hours `Tue–Sat, 9am–5pm`; Skills you often need `driving, spanish, food handling`; Volunteers should reach you by **Messages in ThankYou**
- **Steps:** Change the fields and click **Save profile**. Open `/organizations/harbor-food-bank` signed out.
- **Expected result:** "Saved." The public page shows the new summary. Contact email and phone ("Contact (never shown publicly)") do not appear publicly.

### TC-ORG-015 · Upload and remove a logo — P2

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/org/settings` → **Logo** ("PNG, JPEG or WebP, up to 1 MB")
- **Test data:** a small PNG or JPG square image; then a 2 MB image; then a PDF
- **Steps:**
  1. Choose the small image, click **Upload logo**.
  2. Try the 2 MB image, then the PDF.
  3. Click **Remove**.
- **Expected result:** 1: the image shows as "Current logo" and on the public organization page (served from this site). 2: refused
  ("Images can be up to 1 MB" / unsupported type). 3: "Saved."; the logo is gone.

### TC-ORG-016 · Change the organization's web address — P2

- **Tester:** `uat.riley@example.test` / `Uat-Org-2026!` (created in TC-ORG-001)
- **Page:** `http://localhost:3202/org/settings` → **Web address**
- **Test data:** New address `riverside-aid-uat`; then `harbor-food-bank`
- **Steps:** Enter the new address, **Change address**. Then try `harbor-food-bank`.
- **Expected result:** The page warns "Changing it breaks links you've already shared." First change: you land on the organization
  home; the public page is now `/organizations/riverside-aid-uat`; team, requests and settings are intact. Second: refused (address already in use).

### TC-ORG-017 · Submit the organization for verification — P1

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`), switched to **Bright Futures Tutoring**
- **Page:** `http://localhost:3202/org/settings` → **Verification** (switcher on **Bright Futures Tutoring**)
- **Test data:** Notes for the reviewer `EIN 12-3456789; website example.org/bright; contact Olivia Ortiz.`
- **Steps:** Enter the notes, click **Submit for verification**.
- **Expected result:** The heading reads "Verification · Being reviewed" and the button becomes **Update submission**. The submission
  appears in Admin → Verification → Organizations (ADM-013). The text explains "Only verified organizations can publish requests and approve volunteer hours…".

### TC-ORG-018 · Unverified organizations can write drafts but not publish — P1

- **Tester:** `uat.riley@example.test` / `Uat-Org-2026!` (created in TC-ORG-001) (Riverside is not verified)
- **Page:** `http://localhost:3202/org/requests/new` (Organization → Requests → **New request**)
- **Test data:** Title `Riverbank clean-up`; Category **Events & community**; Description `Pick up litter along the river path. Gloves provided.`; One time next Saturday 09:00, 120 minutes; In person, area `Astoria Park, Queens, NY`
- **Steps:** Complete the wizard and try to publish.
- **Expected result:** The draft saves, but publishing is refused with a message that the organization must be verified first.
  After ThankYou staff approve the organization (ADM-013), publishing works.

### TC-ORG-019 · Switch between organizations — P1

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`) (admin of Harbor Food Bank and Bright Futures Tutoring)
- **Page:** `http://localhost:3202/org/dashboard`, then the switcher at the top right ("Harbor Food Bank")
- **Steps:** Open the switcher, choose **Bright Futures Tutoring**; open Requests; switch back.
- **Expected result:** The page header reads "Bright Futures Tutoring · Admin · Verification required" (or similar) and Requests lists
  only Bright Futures items. Switching back shows Harbor's. Nothing is mixed between the two.

### TC-ORG-020 · Publishing rule: manager's high-risk request needs the owner — P1

- **Tester:** Nora (`org.manager@thankyou.test` / `Password!`) (manager), then Olivia (`org.admin@thankyou.test` / `Password!`) (admin)
- **Page:** Olivia: `http://localhost:3202/org/settings` → **Who can publish requests**; Nora: `http://localhost:3202/org/requests/new`; Olivia: `http://localhost:3202/org/requests`
- **Test data (Nora's request):** Title `Teen helpers for the Saturday shift`; Category **Food & meals**; Description `Students 16+ help pack produce boxes.`; next Saturday 10:00, 120 min; in person, area `Queens, NY`; step 4 tick **If under 18, have a parent or guardian's consent**
- **Steps:**
  1. Nora completes the wizard and clicks Publish.
  2. Olivia opens the request.
  3. Olivia types `Looks good` and clicks **Approve and publish**.
- **Expected result:**
  - 1: "Sent to your organization's owner for approval. It goes live when they approve it." The request isn't public.
  - 2: "Waiting for the organization owner's approval. It isn't public yet." with "Note for the manager (needed if you send it back)",
    **Approve and publish** and **Send back**.
  - 3: "Approved and published." Volunteers can now find it.

### TC-ORG-021 · Owner sends a manager's request back — P2

- **Tester:** Nora (`org.manager@thankyou.test` / `Password!`), Olivia (`org.admin@thankyou.test` / `Password!`)
- **Page:** Olivia: `http://localhost:3202/org/requests` → the request waiting for approval; Nora: `http://localhost:3202/org/requests`
- **Steps:** Repeat TC-ORG-020 step 1 with title `Teen helpers — second try`. Olivia types `Please add what students should wear.` and clicks **Send back**. Nora opens the request.
- **Expected result:** Olivia: "Sent back with your note. It stays private until it's resubmitted." Nora sees "The owner sent this back:
  Please add what students should wear. Edit it and publish again to resubmit."

### TC-ORG-022 · Change the publishing rule — P2

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`), then Nora (`org.manager@thankyou.test` / `Password!`)
- **Page:** Olivia: `http://localhost:3202/org/settings` → **Who can publish requests**; Nora: `http://localhost:3202/org/requests/new`
- **Steps:** Choose **None: managers publish on their own**, click **Save**. Nora creates and publishes a guardian-consent request again.
- **Expected result:** "Saved." Nora's request goes live immediately ("Your request is live…"). Choosing **Every request** instead makes
  every manager request wait for the owner. Marcus (member) sees the rule as text only, without the form.

### TC-ORG-023 · Set the organization type — P1

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/org/settings` → Profile → **Type of organization**
- **Steps:** Open the list; choose **Community group**, **Save profile**; set it back to **Nonprofit**.
- **Expected result:** Options: Nonprofit, School, Community group, Faith-based organization, Government agency, Other. "Saved." each
  time; the value sticks after reload. Marcus (member) can't edit ("Only organization admins can edit these settings.").

### TC-ORG-024 · School coordinators exist only in schools — P1

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`) (Harbor = Nonprofit), then Sam (`school.admin@thankyou.test` / `Password!`, Lincoln High = School)
- **Page:** `http://localhost:3202/org/team` → **Invite a teammate** → Role (Olivia on Harbor Food Bank; Sam on Lincoln High School)
- **Steps:**
  1. Olivia opens the Role list.
  2. Sam opens the Role list, invites `uat.coord@example.test` as **School coordinator**, Send invite.
- **Expected result:** 1: Member, Manager, Admin only. 2: Member, School coordinator, Manager, Admin; "Invite sent."; the pending invite
  shows role School coordinator. Cora is listed as "Role: School coordinator".

### TC-ORG-025 · A school with coordinators can't change type — P2

- **Tester:** Sam (`school.admin@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/org/settings` → **Type of organization**
- **Steps:** Change School → **Nonprofit**, Save profile.
- **Expected result:** Refused: "Change your coordinators to another role before changing the organization type". The type stays School.
  After changing Cora's role to Member (and cancelling pending coordinator invites), the change is allowed.

### TC-ORG-026 · School coordinator's access — P1

- **Tester:** Cora (`school.coordinator@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/org/dashboard` (Lincoln High School)
- **Expected result:** Header "Lincoln High School · School coordinator…" (or Coordinator); she can view requests and applicants, but
  can't accept volunteers, edit settings, invite teammates or see volunteers' email and phone (same limits as a member, see OPS-027).

### TC-ORG-027 · Organization home — P1

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/org/dashboard` (Organization → **Home**)
- **Before you start:** S4, S5
- **Expected result:** "Harbor Food Bank · Admin · Verified", **Post a request**; a reminder to turn on two-step sign-in ("You approve
  volunteers' hours, so protect your account…"); tiles Open requests, Applicants to review **2**, Hours to approve **1**, Unread
  messages; "Latest applicants" (Valerie Accepted ×2, Tara Pending, Diego Pending) and "Recent requests".

### TC-ORG-028 · Organization menu — P2

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/org/dashboard`, then each item in the top menu
- **Expected result:** Top menu: Home, Requests, Applicants, Hours, People, Inbox, Organization. "People" opens the roster with
  Attendance, Forms and Incidents nearby; "Organization" opens Team with tabs Team · Settings · Reports.
