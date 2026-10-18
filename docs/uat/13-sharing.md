# 13 · Sharing links

Anyone signed in can share an open opportunity, an organization's profile, an impact story or an invitation to
join ThankYou. A share link opens a ThankYou page (`/share/<code>`) with a short, safe preview — the general area,
never a street address or contact details — and a button to open the real page. The person who made the link
chooses who can open it and for how long, and can replace it. Anyone can report a link; three different people
reporting it takes it down automatically, and moderators handle the rest (TC-ADM-015).

Volunteer profile share links are a separate feature, covered in TC-PUB-009. Verified hour records are covered in
06 (TC-HRS-022 to TC-HRS-026).

Setup: `pnpm db:uat`. S9 = Olivia shared *Community garden weeding* and Valerie and Diego reported the link.

> **Share window on Windows/Mac:** when you click **Share**, some browsers open the computer's own share panel
> first. Close it (Cancel / Esc) and ThankYou's share window opens. The steps below use ThankYou's window.

Two browser windows help: a normal window signed in, and a private/incognito window for the signed-out visitor.

---

### TC-SHR-001 · Share an open opportunity — P1

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`)
- **Page:** `http://localhost:3202/volunteer/opportunities/recommended` → *Community garden weeding* (its page is
  `http://localhost:3202/volunteer/opportunities/<id>`)
- **Steps:**
  1. Open *Community garden weeding*. In the right-hand column click **Share this opportunity**.
  2. Look at the share window, then click **Copy**.
  3. Paste the link into the address bar of a private/incognito window and open it.
- **Expected result:**
  - 2: the window "Share" shows **Who can view** (Anyone with link — selected, Logged-in users, Only me), **Expiry**
    (7 days, 30 days — selected, No expiry), the link (`http://localhost:3202/share/…`) with **Copy**, "Share via"
    tiles (Text / SMS, Email, WhatsApp, Facebook, X / Twitter, LinkedIn), a **QR code** and **Done**. Copy confirms
    the link was copied.
  - 3: the page says "Shared opportunity", the title *Community garden weeding* with a "Verified" tag, the short
    description, **Location: Jersey City, NJ** and **When:** the opportunity's date and time, then "Ready to help?"
    with **Volunteer / Apply**, **Browse opportunities** and **Report this link**.

### TC-SHR-002 · A visitor goes from a shared link to the opportunity — P1

- **Tester:** Visitor (signed out, no login needed)
- **Page:** the link from TC-SHR-001 (`http://localhost:3202/share/<code>`)
- **Before you start:** TC-SHR-001
- **Steps:**
  1. Click **Volunteer / Apply**.
  2. Go back and click **Browse opportunities**.
- **Expected result:**
  - 1: the opportunity's public page `http://localhost:3202/opportunities/<id>` opens with **Create an account to
    apply** and **Log in** (no apply form, no street address).
  - 2: `http://localhost:3202/opportunities` opens.

### TC-SHR-003 · A shared page shows only public details — P1

- **Tester:** Olivia (`org.admin@thankyou.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** Olivia: `http://localhost:3202/opportunities` → search `Saturday distribution` → *Saturday distribution
  shift*. Visitor: the copied link.
- **Steps:**
  1. As Olivia, open *Saturday distribution shift* from the search results, click **Share this opportunity**, then
     **Copy**.
  2. Open the link in the private window.
- **Expected result:**
  - Location shows **Queens, NY** (the public area). The street address *87-10 Queens Blvd* never appears, and no
    email address or phone number appears anywhere on the page.
  - The page's tab title is the opportunity's title.

### TC-SHR-004 · "Logged-in users" links hide details from visitors — P2

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** Valerie: `http://localhost:3202/volunteer/opportunities/<id>` of *Event setup crew* → **Share this
  opportunity**. Visitor: the copied link.
- **Steps:**
  1. In the share window choose **Logged-in users**, click **Update link**, then **Copy**.
  2. Open the link in the private window.
  3. Click **Log in to view** and sign in as Ravi (`volunteer.remote@thankyou.test` / `Password!`).
- **Expected result:**
  - 1: the link changes (a new code).
  - 2: the page says "ThankYou shared link — Sign in to view details." with no title, place or date, a **Log in to
    view** button and "Some details are hidden. Sign in to view the full preview and open the shared content."
  - 3: after signing in you come back to the same share page and now see *Event setup crew* with its details.

### TC-SHR-005 · "Only me" links work only for their owner — P3

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** Valerie: *Event setup crew* (`http://localhost:3202/volunteer/opportunities/<id>`) → **Share this
  opportunity**
- **Steps:**
  1. Choose **Only me**, click **Update link**, **Copy**.
  2. Open the link in Valerie's own window, then in the private window.
- **Expected result:** Valerie sees the preview. The visitor sees "Page not found" (the link doesn't reveal that
  anything exists).

### TC-SHR-006 · Replacing a link turns the old one off; expiry is shown — P2

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** *Community garden weeding* (`http://localhost:3202/volunteer/opportunities/<id>`) → **Share this
  opportunity**
- **Steps:**
  1. With **Anyone with link** and **30 days**, click **Copy** and keep this first link in a note.
  2. Choose **7 days**, click **Update link**, and copy the second link.
  3. In the private window open the first link, then the second.
- **Expected result:**
  - 2: the link in the window changes.
  - 3: the first link shows "Link revoked — This shared link has been revoked.", "This link is no longer
    available", "This link has been revoked." and a greyed **Link unavailable** instead of the button. The second
    link works normally.

### TC-SHR-007 · Share an organization and an impact story — P2

- **Tester:** Diego (`dual.role@thankyou.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/organizations/harbor-food-bank`, then
  `http://localhost:3202/impact-stories/a-new-phone-and-a-new-friend`
- **Steps:**
  1. On Harbor Food Bank's profile click **Share**, then **Copy**; open the link in the private window and click
     its button.
  2. On the story click **Share**, **Copy**, and open the link in the private window.
- **Expected result:**
  - 1: the share page says "Shared organization", "Harbor Food Bank" with a Verified tag, and its button opens
    `http://localhost:3202/organizations/harbor-food-bank`.
  - 2: the share page says "Shared impact story", the story title and its summary; the button opens the story.

### TC-SHR-008 · Invite a friend — P3

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`), then Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/settings` (account menu → **Settings**)
- **Steps:**
  1. Under "Invite friends" click **Generate invite link**, then **Copy**.
  2. Open the link in the private window and click the button.
- **Expected result:** The page says "Invitation", "You're invited to ThankYou — Find volunteer opportunities near
  you or online, or get a hand from your neighbors. It's free.", "Join ThankYou", and **Create a free account**
  opens `http://localhost:3202/signup`.

### TC-SHR-009 · A reported link warns viewers; three reports take it down — P1

- **Tester:** Visitor (signed out, no login needed), then Ravi (`volunteer.remote@thankyou.test` / `Password!`)
- **Page:** the S9 link. Find it as Ada (`admin@thankyou.test` / `Password!`): `http://localhost:3202/admin/reports`
  → a "Share link" report → **Open shared page**, and copy that address (`http://localhost:3202/share/<code>`).
- **Before you start:** S9
- **Test data:** Reason **Scam / fraud**; Details `UAT: third report on this link.`
- **Steps:**
  1. Open the link in a private window.
  2. Sign in as Ravi in that window, open the link again, click **Report this link**, choose the reason, type the
     details and click **Submit report**.
  3. Refresh the page.
- **Expected result:**
  - 1: a yellow box "**Use caution:** this link has been reported by community members. Reports: 2" above the
    preview. The link still works.
  - 2: "Thanks — we'll review this."
  - 3: three different people have now reported it, so it's taken down: "This link is no longer available" and
    **Link unavailable**. In Admin → Reports the link shows as Blocked.
  - Reporting the same link twice from the same account doesn't add a second report.

### TC-SHR-010 · Sensitive, unpublished and finished requests can't be shared — P2

- **Tester:** Valerie (`volunteer.local@thankyou.test` / `Password!`), Rose (`requester@thankyou.test` / `Password!`)
- **Page:** Valerie: *Explain my electricity bill* (`http://localhost:3202/volunteer/opportunities/<id>`, find it
  with Search on `http://localhost:3202/volunteer/opportunities/recommended`). Rose:
  `http://localhost:3202/requester/requests` → *Draft: garden cleanup*.
- **Steps:** Look for a Share button on each page.
- **Expected result:** *Explain my electricity bill* (sensitive) has no **Share this opportunity** button, even for
  an ID-verified volunteer who can see it. Drafts, requests waiting for review and completed or cancelled requests
  have no share button either.

### TC-SHR-011 · A visitor who clicks Share is asked to log in — P3

- **Tester:** Visitor (signed out, no login needed)
- **Page:** `http://localhost:3202/organizations/harbor-food-bank`
- **Steps:** Click **Share**.
- **Expected result:** The log-in page opens (`http://localhost:3202/login`). No link is created for a visitor.
