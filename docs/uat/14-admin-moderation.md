# 14 · Platform admin and moderation

The admin portal (`http://localhost:3202/admin`) has a dark side menu so staff always know they're in the admin
tools. **Admins** (Ada) see everything: Overview, Moderation, Requests, Categories, Users, Organizations,
Verification, Support messages, Ads and Audit log. **Moderators** (Maya) see only Moderation and Requests. Every
decision is written to the audit log.

Setup: `pnpm db:uat`. Ready-made situations used here: *Help hanging curtains and a shelf* is waiting for review;
S7 = a user report on *Fill in an online benefits form*; S9 = a reported share link; S12 = Ravi's ID waiting for
review; S13 = advertisement panels.

Some cases change accounts (bans, strikes, deletion). Run `pnpm db:uat` again before a new round.

---

### TC-ADM-001 · Admin overview — P1

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin` (account menu → switcher **Platform admin**, or open the address)
- **Expected result:**
  - "Admin dashboard — Platform health + moderation queues." with tiles: Users, New users (7d), Organizations,
    Requests (open), Reports open, Incidents open, Org verification queue, User verification queue, Banned users.
  - "Recent users" (last 8 sign-ups) and "Recent reports" (last 8, including S7 and the S9 share-link reports).
  - A maintenance-mode box (TC-ADM-028).
  - The side menu is dark and lists Overview, Moderation, Requests, Categories, Users, Organizations, Verification,
    Support messages, Ads, Audit log. On a phone the menu becomes a dark top bar with bottom tabs.

### TC-ADM-002 · Moderators see only their queues — P1

- **Tester:** Maya (`moderator@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin`
- **Steps:** Open the address, then try `http://localhost:3202/admin/users`, `http://localhost:3202/admin/organizations`,
  `http://localhost:3202/admin/support` and `http://localhost:3202/admin/audit`.
- **Expected result:**
  - `/admin` takes Maya to **Moderation**. The side menu shows only Moderation and Requests.
  - Users, Organizations and Support messages show **Access denied** ("You don't have permission to view this page.").
  - Audit log shows "The audit log is for platform admins."

### TC-ADM-003 · Approve a request waiting for review — P1

- **Tester:** Maya (`moderator@volunteer-services-app.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/admin/moderation?tab=review`
- **Steps:**
  1. Find *Help hanging curtains and a shelf*. Read the card.
  2. Click **Approve**.
  3. As a visitor, search `curtains` on `http://localhost:3202/opportunities`.
- **Expected result:**
  - 1: tabs **Requests to review**, Held messages, Disputes, Reports. The card shows the title, description and
    "Help inside a home · Upper West Side, Manhattan, NY · Rose (ID verified) · <date>", with a note box and
    **Approve** / **Send back**.
  - 2: "Done." and the card leaves the queue. Rose gets a notification that her request is live.
  - 3: the request is sensitive, so it still doesn't appear to visitors (only to signed-in, ID-verified
    volunteers such as Valerie).

### TC-ADM-004 · Send a request back with a note — P1

- **Tester:** Rose (`requester@volunteer-services-app.test` / `Password!`), then Maya (`moderator@volunteer-services-app.test` / `Password!`)
- **Page:** Rose: `http://localhost:3202/requester/requests/new`. Maya: `http://localhost:3202/admin/moderation?tab=review`
- **Test data:** Rose posts `Help moving a mattress` (category **Help inside a home**, in person, Upper West Side,
  Manhattan, NY, any date next week). Maya's note: `Please say which floor and whether there's an elevator.`
- **Steps:**
  1. Rose posts and publishes the request (it goes to review because the category is sensitive).
  2. Maya clicks **Send back** with an empty note, then types the note and clicks **Send back**.
  3. Rose opens the request.
- **Expected result:**
  - 2: without a note it's refused ("required to send back"); with the note: "Done." The poster's ID status reads
    in plain words ("ID verified", "ID check waiting" or "ID not checked") — never a code like "not_required".
  - 3: Rose sees "A moderator asked for changes: Please say which floor…" and can edit and submit again.

### TC-ADM-005 · Filter the review queue by category — P3

- **Tester:** Maya (`moderator@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/moderation?tab=review`
- **Before you start:** at least one request waiting (e.g. TC-ADM-004 step 1)
- **Steps:** Click a category chip above the cards, then **All**.
- **Expected result:** Only that category's requests show; **All** shows every waiting request. Each chip shows how
  many are waiting.

### TC-ADM-006 · Take down a live request — P1

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Rose (`requester@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/opportunities`
- **Test data:** search `Ride to a medical`; reason `UAT: medical rides need a licensed provider.`
- **Steps:**
  1. Search, open **Take down…** on *Ride to a medical appointment*, type the reason, click **Take down**.
  2. Search `Ride to a medical` on `http://localhost:3202/opportunities` (signed out).
  3. Rose opens My requests.
- **Expected result:**
  - 1: "Request taken down." Its status shows "Removed by moderators" with **Restore**.
  - 2: no result.
  - 3: Rose sees the request was removed and the reason. Anyone who had applied is told.

### TC-ADM-007 · Restore a taken-down request — P2

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/opportunities?status=removed`
- **Before you start:** TC-ADM-006
- **Steps:** Click **Restore** on *Ride to a medical appointment*.
- **Expected result:** "Request restored." It appears again on `http://localhost:3202/opportunities`.

### TC-ADM-008 · Release or reject held messages — P1

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), then Maya (`moderator@volunteer-services-app.test` / `Password!`), then Rose (`requester@volunteer-services-app.test` / `Password!`)
- **Page:** Valerie: `http://localhost:3202/inbox` → Rose · *Help me carry groceries upstairs*. Maya:
  `http://localhost:3202/admin/moderation?tab=messages`
- **Test data:** Valerie sends `Can you pay me back by Venmo?` and then `Please buy me a gift card first.`
- **Steps:**
  1. Valerie sends both messages.
  2. Maya opens Held messages: **Deliver** the first, **Reject** the second.
  3. Rose opens the conversation; Valerie opens it again.
- **Expected result:**
  - 1: both show to Valerie as "Held for review · …". Rose doesn't see them.
  - 2: each card shows sender, recipient, the text and the reason it was held; each decision says "Done.".
  - 3: Rose sees the Venmo message only. Valerie sees the gift-card message marked "Not delivered".

### TC-ADM-009 · Decide a dispute — P1

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/moderation?tab=disputes`
- **Before you start:** a dispute exists (TC-HRS-006: Valerie disputed declined hours; or TC-REV-004's "Open a dispute")
- **Test data:** Decision notes `UAT: checked the sign-in sheet; the hours stand.`
- **Steps:** Open the dispute, type the notes, click **Uphold** (or **Overturn (remove record)** / **Dismiss**).
- **Expected result:** Notes are required ("both people see these"). After deciding: "Done.", the dispute leaves the
  queue, and both people get a notification with the decision and the notes. Overturning a no-show or late
  cancellation removes it from the volunteer's reliability.

### TC-ADM-010 · Reports queue — P1

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/reports`
- **Before you start:** S7, S9
- **Steps:**
  1. Read the queue. Filter **Status** = Submitted, click **Filter**.
  2. On Valerie's scam report (S7) type Admin notes `UAT: looking into it`, set status **in_review**, click
     **Update status**.
- **Expected result:**
  - 1: "Reports queue — Review user-submitted reports and take action." Valerie's report "Report: scam · Request:
    Fill in an online benefits form · Reported by Valerie" and two share-link reports for *Community garden
    weeding* (state "Reported", "Auto-block threshold" information).
  - 2: "Saved." The report shows **In review**. Valerie's Settings → Reports filed shows the same status.

### TC-ADM-011 · Strike or temporarily ban from a report — P2

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Rose (`requester@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/reports` → Valerie's report → **View details** (`http://localhost:3202/admin/reports/<id>`)
- **Test data:** Strike reason `UAT: misleading request`
- **Steps:**
  1. Under "User enforcement" type the reason and click **Apply strike**.
  2. Rose signs in and opens her profile.
- **Expected result:** 1: "Saved — Your changes were applied." The strike shows in Admin → Users for Rose (Strikes 1)
  and in the audit log. 2: Rose sees a warning that her account has a strike. (Temporary ban is tested in TC-ADM-018.)

### TC-ADM-012 · Review an ID submission — P1

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Ravi (`volunteer.remote@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/verification?tab=users` → Ravi → **Review**
  (`http://localhost:3202/admin/verification/users/<id>`)
- **Before you start:** S12
- **Test data:** Approval notes `UAT: document matches the profile.`
- **Steps:**
  1. Click **Download** on the document and open it.
  2. Type the notes and click **Approve**.
  3. Ravi opens `http://localhost:3202/settings/verification`.
- **Expected result:** 1: the uploaded image downloads. 2: "Saved."; Ravi leaves the queue. 3: Ravi's status is
  approved (ID verified) and he can now apply to opportunities that need verified volunteers. Rejecting instead
  (with a reason) keeps verification required and lets him upload again.

### TC-ADM-013 · Review an organization's verification — P1

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Olivia (`org.admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/verification?tab=organizations`
- **Before you start:** TC-ORG-017 (Olivia submitted Bright Futures Tutoring for verification)
- **Test data:** Reason `UAT: please add your registration number.`
- **Steps:**
  1. On Bright Futures Tutoring type the reason and click **Ask for more**.
  2. Olivia opens Bright Futures' home (switcher → Bright Futures Tutoring) and resubmits.
  3. Ada clicks **Approve**.
- **Expected result:**
  - 1: "Saved."; Olivia sees "needs more information" with the reason.
  - 3: "Saved."; Bright Futures gets the **Verified** badge, can publish requests and approve hours, and its
    opportunities appear in the "Verified organizations only" filter.

### TC-ADM-014 · Suspend and reinstate a verified organization — P2

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/verification?tab=organizations` (or Organizations → **View org**)
- **Test data:** Reason `UAT: suspension test`
- **Steps:**
  1. In "Suspend a verified organization (address)" type `lincoln-high-school`, type the reason, click **Suspend**.
  2. As a visitor search `homework` on `http://localhost:3202/opportunities`.
  3. Back as Ada, find Lincoln High School in the organization list (now Suspended) and click **Reinstate**.
- **Expected result:** 1: "Saved." 2: Lincoln High's opportunities no longer appear. 3: they appear again and the
  school is verified again.

### TC-ADM-015 · Moderate a shared link — P1

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/admin/reports` → one of the S9 share-link reports → **View details**
- **Before you start:** S9
- **Steps:**
  1. Click **Open shared page** and copy its address.
  2. Back on the report click **Warn owner**, then **Block link**. Open the shared page as a visitor.
  3. Click **Unblock**, then **Clear reports**. Open the shared page again.
- **Expected result:**
  - The report shows the token, destination (`/opportunities/<id>`), type OPPORTUNITY and "Reports: 2".
  - 2: each action says "Saved"; the visitor sees "This link is no longer available".
  - 3: the link works again and the caution box is gone.
  - Olivia (the link's owner) sees a notice about the reported link on her profile.

### TC-ADM-016 · Find users — P2

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/users`
- **Steps:**
  1. Search `volunteer-services-app.test`, click **Apply**.
  2. Set **Verification** = Submitted, Apply.
  3. Set **Admin role** = Admin: Super, Apply. Then **Clear**.
- **Expected result:** 1: all seed users with their type, trust and admin columns. 2: only Ravi. 3: only Ada.
  Clear resets the filters. "No users match the current filters." shows for an empty result.

### TC-ADM-017 · Strike and clear strikes — P2

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/users` → search `dual.role`
- **Test data:** Strike reason `UAT: late twice`
- **Steps:** Type the reason, click **Strike**; then click **Clear strikes**.
- **Expected result:** "Strike applied." (Strikes 1), then "Strikes cleared." (Strikes 0). Clearing a user with no
  strikes is disabled ("User has no strikes to clear."). Both actions are in the audit log.

### TC-ADM-018 · Ban and unban a user — P1

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Ravi (`volunteer.remote@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/users` → search `volunteer.remote`
- **Test data:** Ban reason `UAT: ban test`; Days **1 day**
- **Steps:**
  1. Type the reason, choose 1 day, click **Ban**.
  2. Ravi tries to sign in at `http://localhost:3202/login`.
  3. Ada opens `http://localhost:3202/admin/enforcement`, then clicks **Unban** for Ravi.
  4. Ravi signs in again.
- **Expected result:** 1: "User banned."; the row shows the ban end time. 2: "This account is suspended" — no sign-in.
  If Ravi was already signed in elsewhere, his next page load signs him out. 3: Active bans lists Ravi with the
  reason; "Recent enforcement actions" lists the ban. After Unban: "User unbanned." 4: sign-in works.

### TC-ADM-019 · Shadow-ban — P3

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), Rose (`requester@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/users` → search `volunteer.local`
- **Steps:**
  1. Click **Shadow-ban** for Valerie.
  2. Valerie sends `Shadow test` in the groceries conversation (`http://localhost:3202/inbox`).
  3. Rose opens the conversation. Then Ada clicks **Lift shadow-ban**.
- **Expected result:** 2: Valerie sees her message as sent. 3: Rose doesn't see it. Valerie's new requests and
  messages stay visible only to her until the shadow-ban is lifted.

### TC-ADM-020 · Grant and revoke admin access — P2

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Nora (`org.manager@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/users` → search `org.manager`
- **Steps:**
  1. Click **Grant admin**. Nora opens `http://localhost:3202/admin`.
  2. Ada clicks **Revoke admin** for Nora. Nora refreshes.
  3. Ada searches her own email and looks at the Revoke admin button.
- **Expected result:** 1: "Admin role updated."; Nora can open the admin portal. 2: "Admin access revoked."; Nora
  gets **Access denied**. 3: Revoke is disabled ("You can't revoke your own admin access.").

### TC-ADM-021 · Delete a user — P3

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/users`
- **Before you start:** a test account you created (e.g. `uat.vol3@example.test` from 02)
- **Steps:** Find it, click **Delete**, type `delete` (lower case) and confirm; then type `DELETE` and confirm.
- **Expected result:** Lower case is refused ("Type DELETE to confirm."). With DELETE: "User deleted." and the account
  can't sign in. Ada's own row has no Delete ("You cannot delete yourself").

### TC-ADM-022 · Record a background check — P3

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Ravi (`volunteer.remote@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/users` → search `volunteer.remote`
- **Steps:** Set **Background check** = cleared and click **Save**. Ravi opens an opportunity that requires a cleared
  background check (e.g. one posted in TC-OPS-002).
- **Expected result:** "Saved." Ravi's eligibility no longer lists the background check as missing.

### TC-ADM-023 · Organizations management — P2

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/organizations`
- **Steps:**
  1. Search `harbor`, Apply. Then clear the search and sort by **Members**.
  2. For Bright Futures Tutoring click **Disable required**, then **Require verification**.
  3. Change Bright Futures' type and click **Set**; change it back.
- **Expected result:** "Organization management" lists Harbor Food Bank (Approved), Bright Futures Tutoring (Needs
  review or required) and Lincoln High School (Approved) with type, members, verification and last update. Each
  change says "Saved." and is in the audit log. **View org** opens the public profile.

### TC-ADM-024 · Categories — P2

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Rose (`requester@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/categories`
- **Steps:**
  1. Untick **Open for new requests** on *Translation & language* and **Save**.
  2. Rose starts a new request at `http://localhost:3202/requester/requests/new`.
  3. Turn the category back on.
- **Expected result:** 1: "Saved."; the category shows "Off". Sensitive categories show "Sensitive: each request is
  reviewed". Each category has **Who can post** and **Who can volunteer** (Anyone with a verified email / Verified
  (ID-checked) people only). 2: the turned-off category isn't offered. Existing requests in it are unaffected.

### TC-ADM-025 · Incident reports — P2

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/incidents`
- **Before you start:** TC-OPS-020 (Olivia recorded an incident)
- **Test data:** Internal notes `UAT: called the org`; Outcome `Resolved with the volunteer.`
- **Steps:** Filter Status = Open, Severity = Any. Type the notes and outcome, set status **Resolved**, click **Update**.
- **Expected result:** "Incident review" lists the incident with its organization. "Saved."; the status changes, and
  Olivia sees the outcome on her Incidents page.

### TC-ADM-026 · Enforcement overview — P3

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/enforcement`
- **Before you start:** TC-ADM-017 and TC-ADM-018 done (or any strike or ban)
- **Expected result:** "Strike / ban management" with **Active bans** (user, until, reason, Unban) and **Recent
  enforcement actions** (last 50: when, action, target, actor). **Open user management** goes to Users.

### TC-ADM-027 · Audit log — P1

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/audit`
- **Before you start:** any admin or moderator action above
- **Steps:** Read the newest entries. Copy a target id from one row, paste it in **Target id**, click **Filter**.
  Use **Older →** and **← Newer**.
- **Expected result:** "Audit log — Every change made by admins and moderators, newest first." Each row shows when,
  who (email and role), the action, the target and details. The filter shows only that target's entries.

### TC-ADM-028 · Maintenance mode — P1

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/admin`
- **Test data:** Message `We're upgrading Volunteer Services. Back in 15 minutes.`
- **Steps:**
  1. Tick **Enable maintenance mode**, type the message, click **Save**.
  2. Wait 30 seconds. As a visitor open `http://localhost:3202/` and `http://localhost:3202/opportunities`.
  3. Ada opens `http://localhost:3202/admin` (still works), clicks **Disable now**.
  4. After 30 seconds, the visitor opens `http://localhost:3202/maintenance`.
- **Expected result:**
  - 1: "Saved"; the box says Enabled.
  - 2: both go to the maintenance page: "We'll be right back", the message and "Last update: …", with Go home, Log in
    and Admin links.
  - 3: the admin portal and log-in page keep working during maintenance.
  - 4: the maintenance page redirects to the home page because maintenance is off.

### TC-ADM-029 · Advertisement panels — P2

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/admin/ads`
- **Before you start:** S13. Use a browser window at least 1280 px wide for the visitor.
- **Steps:**
  1. Read the page. Untick **Show the right panel**, click **Save**.
  2. As a visitor open `http://localhost:3202/` (wait up to a minute and refresh).
  3. Turn the right panel back on.
- **Expected result:**
  - 1: "Advertisements" explains that ads show beside the public pages on wide screens, labelled "Sponsored". Panels
    box with the two switches; Left and Right lists showing each ad's status — "Harbor Food Bank holiday drive"
    **Showing**, "Become a reading buddy" **Showing**, "Paused sponsor ad" **Off**, "Last month's campaign"
    **Expired**. "Panel settings saved."
  - 2: only the left "Sponsored" card shows. On a phone-width window no ads show at all.

### TC-ADM-030 · Create, schedule, turn off and delete an ad — P2

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/admin/ads` → **New ad**
- **Test data:** Title `Spring food drive — volunteers wanted`; Text `Help sort donations on Saturdays.`; Link
  `/opportunities`; Panel **Left**; Order `0`; Expires after **yesterday's date**; Image: a PNG under 1 MB
- **Steps:**
  1. Fill in the form, click **Create ad**. Then use **Edit** to set Expires after to a date next month and save.
  2. Visitor opens `http://localhost:3202/` and clicks the new ad.
  3. Click **Turn off**, then **Delete ad**.
  4. Try creating an ad with Link `javascript:alert(1)`.
- **Expected result:** 1: "Ad created." It first shows **Expired**, then **Showing** after the edit ("Ad saved.").
  2: the ad shows with its image and "Sponsored"; clicking opens Opportunities. 3: "Ad turned off." (gone from the
  site), then "Ad deleted." 4: refused ("That didn't save.") — only https links or pages on this site are allowed.

### TC-ADM-031 · Support messages from organizations — P2

- **Tester:** Ada (`admin@volunteer-services-app.test` / `Password!`)
- **Page:** `http://localhost:3202/admin/support`
- **Before you start:** TC-MSG-021 step 1 (Olivia messaged the team)
- **Expected result:** "Support messages" lists "Olivia · Harbor Food Bank" with her last message and **Needs a
  reply**. Opening it goes to the conversation in the Inbox, where Ada can reply; after replying the row shows
  **Answered**. With no messages: "No support messages yet".

### TC-ADM-032 · The admin portal is closed to everyone else — P1

- **Tester:** Valerie (`volunteer.local@volunteer-services-app.test` / `Password!`), then Olivia (`org.admin@volunteer-services-app.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/admin`, `http://localhost:3202/admin/users`, `http://localhost:3202/admin/moderation`
- **Steps:** Open each address as each tester.
- **Expected result:** Valerie and Olivia get **Access denied** ("You don't have permission to view this page.").
  The visitor gets the log-in page. The account menu of non-staff users never shows "Platform admin".
