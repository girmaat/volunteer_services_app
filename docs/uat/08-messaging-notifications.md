# 08 · Messaging and notifications

Conversations happen per request, between the volunteer and the organizer. **The organizer (or requester) always
sends the first message; volunteers can only reply.** Safety rules: **phone numbers,
emails, links and social handles are hidden until the volunteer is accepted**; messages that look like scams
(gift cards, wire transfers, passwords…) are **held for a moderator**; either side can report, block or end a
conversation. Notifications appear under the bell and on the Notifications page; email preferences are per
type, with one-click unsubscribe.

Setup: `pnpm db:uat`. S1 = Valerie ⇄ Rose conversation on the groceries request (accepted, so contacts are unlocked).
Harbor Food Bank has written to Valerie, Diego and Tara (S4, S5) and Rose to Diego (S3). Nobody has written about
*Walk and talk in the park* yet (S2).

---

### TC-MSG-001 · Inbox lists conversations — P1

- **Tester:** Valerie (`volunteer.local@thankyou.test`)
- **Page:** top menu → **Inbox**
- **Before you start:** S1, S4, S5
- **Expected result:** "Conversations about your requests and applications." with a filter **This role / All**. Rows show the
  other party (Harbor Food Bank, Rose), the request title, the last message and time; the groceries conversation shows "Press 4B.
  See you Thursday!" and is marked unread.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-002 · Read and reply in a conversation — P1

- **Tester:** Valerie, then Rose
- **Page:** Inbox → Rose · *Help me carry groceries upstairs*
- **Test data:** `I'll bring my own bags. See you at 5:30!`
- **Steps:**
  1. Open the conversation and read it.
  2. Type the message in **Message**, click **Send**.
  3. Rose opens Inbox.
- **Expected result:**
  - 1: header "Rose — Help me carry groceries upstairs — Completed"; a **Safety** menu; the safety line "Never share bank
    details, passwords or codes, and never send money or gift cards."; the messages in order with times, starting with
    Rose's "Thank you for offering, Valerie! When could you come?".
  - 2: the message appears at the bottom immediately.
  - 3: Rose's Inbox shows the conversation as unread with the new text; opening it marks it read. Rose gets a "New message from
    Valerie" notification (and at most one email per hour).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-003 · Volunteers can't start a conversation; contact details are hidden before acceptance — P1

- **Tester:** Diego (`dual.role@thankyou.test`, Volunteering), Rose (`requester@thankyou.test`)
- **Page:** Diego: My applications → *Walk and talk in the park* (Pending, S2) → **Messages**
- **Test data:** Rose: `Hi Diego, thanks for applying! Which mornings suit you?`; Diego:
  `Text me at 917-555-0123 or diego.walks@example.org, or find me on instagram @diegowalks`
- **Steps:**
  1. Diego clicks **Messages** on the application.
  2. Rose opens My requests → *Walk and talk in the park* → **Applicants**, clicks **Message** on Diego's card, types
     her message and clicks **Send**.
  3. Diego refreshes the conversation, types his message and clicks **Send**.
  4. Rose opens the conversation (Inbox).
- **Expected result:**
  - 1: the conversation opens with no message box, only "The organizer starts the conversation. You can reply as
    soon as they message you."
  - 2: Rose's message is sent. Diego gets a "New message" notification.
  - 3: the message box is now there and Diego's reply is sent. The page notes "Phone numbers, emails and links stay
    hidden until the volunteer is accepted."
  - 4: Rose sees "[contact details hidden until accepted]" in place of the phone number, the email and the Instagram
    handle. None of "917-555-0123", "diego.walks@example.org" or "@diegowalks" is visible to her.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-004 · Contact details show after acceptance — P1

- **Tester:** Rose, Diego
- **Before you start:** TC-MSG-003
- **Steps:** Rose accepts Diego on *Walk and talk in the park*; Diego sends `Here it is again: 917-555-0123`; Rose reopens the conversation.
- **Expected result:** The new message shows the number in full. The hidden-contacts note is gone.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-005 · Links hidden before acceptance — P2

- **Tester:** Rose, then Valerie, then Rose
- **Page:** Rose: *Walk and talk in the park* → Applicants → Valerie → **Message**; Valerie: Inbox
- **Before you start:** Rose sends Valerie `Hi Valerie, thanks for applying!` (Valerie can't write first).
- **Test data:** Valerie replies `Here's my volunteer profile: https://example.org/valerie and www.example.com/about`
- **Expected result:** Rose sees "[link hidden until accepted]" for both links.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-006 · Scam-like messages are held for a moderator — P1

- **Tester:** Valerie, Rose, then Maya (`moderator@thankyou.test`)
- **Page:** Inbox → groceries conversation
- **Test data:** `Could you buy two gift cards for me before Thursday?`
- **Steps:**
  1. Valerie sends the message.
  2. Rose opens the conversation.
  3. Maya opens Moderation → **Held messages**.
- **Expected result:**
  - 1: Valerie sees her message marked "Held for review · mentions gift cards".
  - 2: Rose does **not** see it.
  - 3: the message is in Held messages; releasing it delivers it to Rose, rejecting it keeps it hidden (see ADM-008).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-007 · Other held patterns — P2

- **Tester:** Valerie (groceries conversation)
- **Test data (send each separately):** `Please send me money for the bus`; `What's your bank account number?`;
  `Tell me the verification code you got`; `I can pay you on Venmo`
- **Expected result:** Each is held with a reason: asking for money, bank details, passwords or codes, payment app.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-008 · Attach a file — P2

- **Tester:** Valerie, then Rose
- **Page:** groceries conversation
- **Test data:** a small PDF or JPG (under 5 MB); a file renamed `script.html`
- **Steps:**
  1. Under "Attach a file (PDF, image, Word or text, up to 5 MB)" choose the PDF, optional text `Shopping list attached`, **Send**.
  2. Rose opens the conversation and clicks the file.
  3. Valerie tries the `.html` file.
- **Expected result:** 1–2: the message shows the file; Rose downloads the same file. 3: "That file type isn't allowed." Nothing is sent.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-009 · Organizer starts a conversation from an application — P2

- **Tester:** Olivia (`org.admin@thankyou.test`), then Ravi (`volunteer.remote@thankyou.test`)
- **Before you start:** Ravi applied to a Bright Futures request (e.g. VDS-016)
- **Steps:**
  1. Ravi: My applications → the application → **Messages**.
  2. Olivia (switcher → Bright Futures Tutoring): Applicants → Ravi's application → **Message**, sends `Welcome, Ravi!`.
  3. Ravi opens Inbox.
- **Expected result:** 1: the conversation with "Bright Futures Tutoring" opens read-only: "The organizer starts the
  conversation…". 2: the message is sent as the organization. 3: Ravi sees the message and can reply. A volunteer
  can't open a conversation about a request they haven't applied to.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-010 · Report a conversation — P1

- **Tester:** Rose
- **Page:** Inbox → groceries conversation → **Safety**
- **Test data:** Report a concern **Harassment**; What happened? `Testing the report button during UAT.`
- **Steps:** Open Safety, choose the category, type the text, click **Send report**.
- **Expected result:** "Thanks — our team will review this conversation. You can also block them." The report appears in the
  admin Reports queue and in Rose's Settings → Reports filed.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-011 · Block from a conversation — P1

- **Tester:** Rose, then Valerie
- **Before you start:** this blocks Valerie for Rose; re-run `pnpm db:uat` afterwards if other tests need them talking.
- **Steps:**
  1. Rose: Safety → **Block Valerie**.
  2. Valerie opens the conversation and tries to send `Hello?`.
- **Expected result:** 1: "Blocked. Neither of you can message the other, and the conversation is closed." The message box and
  Send button are gone. 2: Valerie can't send either. Valerie appears in Rose's Settings → Blocked users.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-012 · End a conversation — P2

- **Tester:** Valerie
- **Page:** Inbox → Harbor Food Bank · *Deliver meals…* conversation → Safety → **End conversation**
- **Expected result:** "Conversation ended. It stays here, read-only." The page says "This conversation has ended and is
  read-only." No message box for either side.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-013 · Organization inbox — P2

- **Tester:** Olivia (`org.admin@thankyou.test`)
- **Page:** Organization → **Inbox**
- **Before you start:** S4, S5
- **Expected result:** Conversations with Valerie (Deliver meals, Saturday shift), Diego and Tara (Saturday shift), each
  starting with Harbor's welcome message. Replies are sent as the organization ("Harbor Food Bank"). Olivia's own
  "ThankYou support" thread also appears here once she has written to the team (TC-MSG-021).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-014 · Notifications bell — P1

- **Tester:** Valerie
- **Page:** any page → bell icon at the top right ("Notifications, N unread")
- **Before you start:** S1–S5 (Valerie has several unread)
- **Steps:**
  1. Click the bell.
  2. Click "You're in: “Saturday distribution shift”".
- **Expected result:** 1: a menu of recent notifications, unread ones highlighted. 2: opens the Saturday application; that
  notification is now read and the unread count drops by one.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-015 · Notifications page — P1

- **Tester:** Valerie
- **Page:** bell → see all, or `/notifications`
- **Steps:**
  1. Read the page; switch to **Unread**.
  2. Click **Mark all as read**.
- **Expected result:**
  - 1: "Notifications — N unread", **Mark all as read**, **Email settings**, filters All / Unread (N), entries grouped
    (TODAY, Yesterday, This week, Earlier), each with a link (View application →, Leave a review →, Reply →).
  - 2: "Nothing unread — You've seen everything." on the Unread filter; the bell shows no unread count.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-016 · Notifications reach the right person for key events — P1

- **Tester:** as listed
- **Steps and expected notifications:**

  | Action | Who is notified | Notification says / links to |
  | --- | --- | --- |
  | A volunteer applies (VDS-016) | Request owner (Olivia/Rose) | new applicant → Applicants |
  | Owner accepts (REQ-011) | Volunteer | "You're in: “<title>”" → application |
  | Owner waitlists or declines | Volunteer | application update → application |
  | Owner marks complete | Volunteer | "How did “<title>” go?" → Leave a review |
  | New message | Other party | "New message from <name>" → Reply |
  | Hours approved / changed / declined | Volunteer | hours decision → Impact |
  | Sensitive request approved by moderator | Poster | request approved → request |
  | Join request (S8) | Org admins/managers | join request → Team |

- **Expected result:** Each notification arrives (bell + Notifications page) and its link opens the right page. Emails for the
  same events appear in the API terminal unless turned off (TC-MSG-017).
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-017 · Choose which emails you get — P2

- **Tester:** Valerie
- **Page:** Settings → **Notifications** (`/settings/notifications`)
- **Steps:**
  1. Read the table. Untick **Email** for "New messages (email at most once an hour)". Click **Save preferences**.
  2. Have Rose send Valerie a message.
- **Expected result:**
  - 1: "Account and security emails (sign-in links, password resets) are always sent." and a table with Email / In app columns
    for each type (applications, decisions, reminders, messages, reviews, request status, disputes, hours, calendar updates,
    forms and consent, saved searches). "Preferences saved."
  - 2: an in-app notification arrives but **no** message email for Valerie appears in the API terminal.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-018 · One-click unsubscribe from an email — P2

- **Tester:** Valerie
- **Page:** the unsubscribe link at the bottom of any email to Valerie in the API terminal ("Unsubscribe from these emails: http://localhost:3202/unsubscribe?token=…")
- **Steps:** Open the link (no sign-in needed) and click **Unsubscribe**.
- **Expected result:** "Stop emails for <type>?" then "You won't get emails for “<type>” any more. In-app notifications are
  unchanged." Settings → Notifications shows that email turned off.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-019 · Invalid unsubscribe link — P3

- **Tester:** Visitor
- **Page:** `/unsubscribe?token=abc`
- **Expected result:** "This unsubscribe link isn't valid. You can change every email setting in Settings → Notifications."
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-020 · Who can message you (privacy setting) — P2

- **Tester:** Diego, then Rose
- **Page:** Diego: Settings → **Privacy & Safety**
- **Steps:**
  1. Diego chooses **No one** under Messaging permissions, **Save changes**.
  2. Rose opens Diego's conversation (*Set up my new phone*) and tries to send `Thanks again!`.
  3. Diego sets it back to **Anyone**.
- **Expected result:** 2: the message is refused (Diego accepts no messages). 3: messaging works again.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:

### TC-MSG-021 · Organizations message the ThankYou team; admins reply — P2

- **Tester:** Olivia (`org.admin@thankyou.test`), then Ada (`admin@thankyou.test`)
- **Page:** Olivia: `/contact`; Ada: Admin → **Support messages** (`/admin/support`)
- **Test data:** Olivia: `How do we get our second location verified?`; Ada: `Send us the address and we'll review it.`
- **Steps:**
  1. Olivia opens Contact us. Under **Message the ThankYou team** types her message and clicks **Send message**.
  2. Ada opens Admin → **Support messages**.
  3. Ada opens the thread, types her reply and clicks **Send**.
  4. Olivia opens Inbox.
- **Expected result:**
  - 1: Olivia lands in a conversation titled "ThankYou support" with her message. Below it, the email form still
    works with her name and email filled in and locked.
  - 2: a row "Olivia · Harbor Food Bank" with her message and a **Needs a reply** tag.
  - 3: the reply is sent; the row now says **Answered**.
  - 4: Olivia sees Ada's reply in the "ThankYou support" conversation and gets a notification.
  - Volunteers and requesters without an organization don't see "Message the ThankYou team" on Contact us.
- **Result:** ☐ Pass ☐ Fail ☐ Blocked — Notes:
