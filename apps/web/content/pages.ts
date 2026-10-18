/**
 * Content for the information pages. Kept in the codebase (reviewed and versioned like code).
 * Bodies use the small Markdown subset in components/content/Markdown.tsx.
 *
 * Before launch, have counsel review Terms and Privacy for your entity, jurisdiction and data flows.
 */
export type InfoPageContent = { slug: string; title: string; kicker?: string; lead: string; updated?: string; body: string };

const UPDATED = "October 18, 2026";

export const ABOUT: InfoPageContent = {
  slug: "about",
  title: "About Volunteer Services",
  kicker: "About us",
  lead: "Volunteer Services connects volunteers with neighbors and nonprofits who need a hand, and makes it easy to do good safely.",
  body: `## Why we exist
Most people want to help. Most organizations and neighbors could use more of it. What gets in the way is finding each other, agreeing on the details and trusting that it will go well. Volunteer Services takes care of that part so the helping can happen.

## Who it's for
- **Volunteers** who want work that fits their skills and their week: a Saturday shift nearby, or an hour of tutoring from home.
- **Neighbors** who need help with groceries, forms, rides or technology, without sharing their address or phone number with strangers.
- **Nonprofits, schools and community groups** who post shifts and projects, review applicants, take attendance and report on volunteer hours.

## How we keep it safe
Safety is built into every step rather than added on top.
- Exact addresses and contact details are shared only after an application is accepted.
- Messages stay inside Volunteer Services. Phone numbers and emails are hidden until you accept someone, and scam-like messages are held for review.
- Organizations are verified before they get the Verified badge.
- Volunteers under 18 need a parent or guardian's consent and never have a public profile.
- Anyone can block or report from a profile or a conversation, and a real person reviews every report.

Read more on our [Trust & safety](/trust-safety) page.

## What we believe
- **Respect people's time.** Clear details up front, reminders before a shift and honest reviews afterwards.
- **Privacy by default.** Volunteer profiles are private; you decide who sees yours by sharing a link you can turn off.
- **Credit where it's due.** Hours count once the organization or person you helped approves them, so your record means something.

## Get in touch
Questions, partnership ideas or press? [Contact us](/contact). Organizations can [register here](/org/signup).`
};

export const HOW_IT_WORKS: InfoPageContent = {
  slug: "how-it-works",
  title: "How Volunteer Services works",
  kicker: "How it works",
  lead: "From finding an opportunity to logging your hours, here's what to expect, whether you're volunteering, asking for help or running an organization.",
  body: `## For volunteers
1. **Create a free account** and tell us what you like doing, where and when you're available.
2. **Find an opportunity.** Browse [opportunities](/opportunities) or let us pick matches for you. Filter by date, category and in person or remote.
3. **Apply** with a short note. The organizer reviews applications and accepts, waitlists or declines kindly.
4. **Get the details.** Once you're accepted you'll see the exact address and any instructions. The organizer messages you to coordinate; you can reply in Volunteer Services messages.
5. **Show up.** We remind you 48 hours and 2 hours before. If plans change, cancel as early as you can so someone on the waitlist can take your place.
6. **Get credit.** After the work is marked complete, the organizer approves your hours and you both leave a review. Your hours and badges build up in Impact.

## For neighbors who need help
1. **Post a request** describing what you need, when, and the general area. Your exact address stays private.
2. **Review volunteers** who apply. You can see their reliability, ratings and reviews before you accept anyone.
3. **Message and agree on details.** You start the conversation with the volunteer you choose.
4. **Mark it complete** and leave a review. Approve the volunteer's hours so they get credit.

## For organizations
1. **Register your organization** and invite your team. Verification gives you the Verified badge volunteers look for.
2. **Post shifts and projects**, one-off or recurring, with requirements such as minimum age, background checks or waivers.
3. **Review applicants**, confirm schedules and take attendance with check-in codes.
4. **Approve hours and export reports** for grants, schools and your board.

## Safety at every step
Contact details stay hidden until someone is accepted, messages are screened for scams, and anyone can block or report. See [Trust & safety](/trust-safety) for details.

## Ready to start?
[Browse opportunities](/opportunities), [create an account](/signup) or [register your organization](/org/signup).`
};

export const HELP: InfoPageContent = {
  slug: "help",
  title: "Help center",
  kicker: "Help",
  lead: "Answers to the questions we hear most. Can't find what you need? Contact us and we'll get back to you.",
  body: `## Getting started
### Do I need an account to browse?
No. Anyone can browse opportunities and organizations. You need a free account to apply, post a request or message someone.

### I didn't get the verification email
Check your spam or junk folder and make sure the address is spelled correctly. You can ask for a new link from the sign-in page. Links expire after a while for your security.

### How old do I have to be?
Volunteers must be at least 16. Volunteers under 18 need a parent or guardian's consent for opportunities that ask for it, and some opportunities set a higher minimum age.

## Volunteering
### How do I apply?
Open an opportunity and click **Apply**. Add a short note about why you're a good fit. You'll be notified when the organizer responds.

### When do I see the exact address?
Only after your application is accepted. Until then you see the general area, such as "Queens, NY".

### Can I message an organizer before I'm accepted?
The organizer starts the conversation. Once they message you, you can reply in Volunteer Services messages. Your application note is shown to them with your application.

### I can't make it anymore. What do I do?
Open the application and click **Cancel my spot**, ideally more than 24 hours before the start. Cancelling within 24 hours counts as a late cancellation on your reliability.

### What is the waitlist?
When an opportunity is full you can join the waitlist. If a spot opens, we offer it to you and hold it for 24 hours. You're never added without saying yes.

### How do my hours get counted?
After the work is marked complete, the organizer or person you helped approves your hours. Approved hours show in Impact and on your shared profile. You can also report time for approval if something was missed.

### Who can see my profile?
Nobody, unless you share it. In Profile → **Share your profile** you can create a link, choose what it shows and turn it off at any time. Creating a new link cuts off the old one.

## Asking for help
### How do I post a request?
Choose **Requesting help** from the menu and click **Post a request**. Describe what you need, when and the general area. Requests about sensitive matters are only shown to verified volunteers.

### How do I choose a volunteer?
Open your request and go to **Applicants**. You'll see each volunteer's completed count, reliability and rating. Accept the person you'd like, then send them a message.

## Organizations
### How do we get verified?
After you register, an administrator reviews your details. Verified organizations get a badge on their profile and opportunities.

### Can my whole team manage applications?
Yes. Invite teammates as admins, managers or members from **Organization → Team**. Admins and managers share the organization inbox.

### How do we contact the Volunteer Services team?
Signed-in organization members can use **Message the Volunteer Services team** on the [Contact](/contact) page. Your conversation stays in your Inbox.

## Safety and privacy
### How do I block or report someone?
Use **Report** or **Block** on their profile or in the conversation. A member of our team reviews every report.

### Someone asked me for money or a gift card
Don't pay. Report the message. Volunteer Services never asks volunteers or neighbors for payment, and real organizers don't either.

### How do I delete my account?
Go to **Settings → Account** and choose **Delete my account**. See our [Privacy policy](/privacy) for what we keep and for how long.

## Still need help?
[Contact us](/contact). If someone is in danger, call 911 or your local emergency number first.`
};

export const TRUST_SAFETY: InfoPageContent = {
  slug: "trust-safety",
  title: "Trust & safety",
  kicker: "Trust & safety",
  lead: "Volunteering means meeting people you don't know yet. Here's how Volunteer Services protects volunteers, neighbors and organizations, and what you can do too.",
  body: `## Privacy until there's trust
- **Addresses stay private.** Everyone sees only the general area until an application is accepted.
- **Contact details are masked.** Phone numbers, emails and links in messages are hidden until the volunteer is accepted.
- **Profiles are private.** Volunteers share their profile only through a link they control and can turn off.
- **Volunteers under 18** never have a shareable profile, and their contact details stay masked even after acceptance.

## Verified organizations
Organizations that complete our review show a **Verified** badge. We check that the organization exists and that the person managing it is authorized to act for it. You can filter opportunities to verified organizations only.

## Safer messaging
- Conversations happen inside Volunteer Services, so there's a record if something goes wrong.
- The organizer or requester sends the first message; volunteers reply. This stops unsolicited contact.
- Messages that look like scams, such as requests for gift cards or payment apps, are held for review and never delivered unless a moderator releases them.
- New accounts have limits on how many conversations they can start in a day.

## Reliability and reviews
Reviews are double-blind: neither side sees the other's review until both are in, or 14 days pass. After that they're published and can't be edited. Late cancellations and no-shows affect reliability, and either side can dispute an unfair review or record.

## Blocking and reporting
You can block or report anyone from their profile or a conversation. Blocking ends the conversation for both of you. Our trust and safety team reviews every report and may warn, restrict or remove accounts that break our [Code of conduct](/code-of-conduct).

## Tips for meeting in person
- Meet in a public place the first time when you can.
- Tell a friend where you're going.
- Keep conversations in Volunteer Services messages until you're comfortable.
- Never share bank details or passwords, and never pay to volunteer.
- Trust your instincts. You can always cancel and report.

## In an emergency
Volunteer Services is not an emergency service. If someone is in danger, call 911 or your local emergency number first, then report what happened to us.

## Report a concern
Use **Report** on a profile or in a conversation, or [contact us](/contact).`
};

export const CODE_OF_CONDUCT: InfoPageContent = {
  slug: "code-of-conduct",
  title: "Code of conduct",
  kicker: "Community standards",
  lead: "Volunteer Services works because people treat each other with respect. These standards apply to everyone: volunteers, neighbors, organizations and our own team.",
  updated: UPDATED,
  body: `## Be respectful
Treat everyone with courtesy and dignity. We don't allow harassment, hate speech, threats, bullying, or discrimination based on race, ethnicity, national origin, religion, gender, gender identity, sexual orientation, age, disability or any other protected characteristic.

## Be honest
- Describe opportunities and requests accurately, including what's involved and any requirements.
- Represent yourself truthfully. Don't impersonate another person or organization.
- Only report hours you actually volunteered. Only approve hours that were really given.
- Leave reviews that reflect your real experience.

## Be reliable
Show up when you've committed to, and cancel as early as possible if you can't. Organizers should keep details up to date and let volunteers know about changes promptly.

## Keep it safe
- Never ask for or offer money, gift cards, loans or payment apps. Volunteering is unpaid.
- Don't ask for passwords, bank details or identity documents through messages.
- Don't share someone else's personal information without their permission.
- Follow extra care when working with minors or vulnerable adults, and follow the organization's safeguarding rules.

## Keep it appropriate
No sexual content, solicitation or romantic advances. No illegal activity, weapons, drugs or alcohol as part of an opportunity. No spam, advertising or recruiting unrelated to the opportunity.

## Respect privacy
Use contact details only to coordinate the volunteering you agreed on. Don't move people off the platform to avoid our safety protections.

## What happens if the rules are broken
Depending on how serious it is, we may remove content, hold messages, give a warning, limit features, suspend or permanently remove an account. Serious threats to safety may be reported to the authorities. If you think we made a mistake, reply to our notice or [contact us](/contact).

## Report a concern
Use **Report** on any profile or conversation. Reports are confidential.`
};

export const TERMS: InfoPageContent = {
  slug: "terms",
  title: "Terms of service",
  kicker: "Legal",
  lead: "These terms explain the rules for using Volunteer Services. Please read them carefully: by creating an account or using the service you agree to them.",
  updated: UPDATED,
  body: `## 1. About these terms
These Terms of Service ("Terms") are an agreement between you and Volunteer Services ("Volunteer Services", "we", "us") about your use of our website and services (the "Service"). Our [Privacy policy](/privacy) and [Code of conduct](/code-of-conduct) are part of these Terms.

## 2. What Volunteer Services is, and isn't
Volunteer Services is a platform that helps volunteers, individuals and organizations find each other and coordinate unpaid volunteer work. We are not a party to any arrangement between users, we don't employ volunteers, and we don't supervise volunteer activities. Organizations and individuals who post opportunities are responsible for them.

## 3. Eligibility
You must be at least 16 years old to use Volunteer Services. If you are under 18, you confirm that a parent or guardian has agreed to these Terms, and some opportunities require their written consent. Organizations must be lawfully established and represented by someone authorized to act for them.

## 4. Your account
- Give accurate information and keep it up to date.
- Keep your password secure; you're responsible for activity on your account.
- Staff accounts may be required to use two-step sign-in.
- Tell us right away if you think your account has been used without permission.

## 5. Posting opportunities and requests
If you post an opportunity or request, you agree that it is accurate, lawful and unpaid; that you will provide a safe environment and any training, supervision or equipment it requires; that you comply with laws that apply to you, including background checks, safeguarding and insurance where required; and that you will approve hours honestly.

## 6. Volunteering
Volunteers take part voluntarily and at their own risk, and are responsible for judging whether an opportunity is suitable for them. Follow the organizer's reasonable instructions and safety rules, and cancel as early as possible if you can't attend.

## 7. Acceptable use
You agree to follow our [Code of conduct](/code-of-conduct). You must not misuse the Service, including by scraping it, trying to get around its security or privacy protections, sending spam, or using it to collect payment.

## 8. Content
You keep ownership of what you post. You give Volunteer Services a non-exclusive, worldwide, royalty-free licence to host, display and share that content as needed to run and promote the Service, in line with your privacy choices. You're responsible for having the rights to what you post. We may remove content that breaks these Terms.

## 9. Reviews, hours and records
Reviews and hour approvals must be honest. Volunteer records reflect what organizers and requesters approved; Volunteer Services doesn't independently verify that the work took place.

## 10. Suspension and termination
You can delete your account at any time in Settings. We may suspend or end access if you break these Terms, create risk for others or if required by law. Sections that by their nature should survive termination will survive.

## 11. Disclaimers
The Service is provided "as is" and "as available". To the fullest extent allowed by law, we disclaim all warranties, express or implied. We don't guarantee that any opportunity, user or organization is safe, suitable or as described, even if verified.

## 12. Limitation of liability
To the fullest extent allowed by law, Volunteer Services is not liable for indirect, incidental, special, consequential or punitive damages, or for any loss arising from interactions or activities between users. Our total liability for any claim is limited to one hundred US dollars (US$100). Some jurisdictions don't allow these limits, so they may not apply to you.

## 13. Indemnity
You agree to indemnify Volunteer Services against claims arising from your content, your volunteer activities or opportunities you post, or your breach of these Terms, to the extent allowed by law.

## 14. Changes
We may update these Terms. If a change is material we'll tell you in the app or by email before it takes effect. Continuing to use the Service after that means you accept the updated Terms.

## 15. Governing law and disputes
These Terms are governed by the laws of the State of New York, USA, without regard to conflict-of-laws rules. Disputes will be resolved in the state or federal courts located in New York County, New York, unless the law where you live requires otherwise.

## 16. Contact
Questions about these Terms? [Contact us](/contact).`
};

export const PRIVACY: InfoPageContent = {
  slug: "privacy",
  title: "Privacy policy",
  kicker: "Legal",
  lead: "Your privacy matters to us. This policy explains what we collect, why, who can see it and the choices you have.",
  updated: UPDATED,
  body: `## Summary
- We collect what we need to match volunteers with opportunities and keep people safe.
- Your exact address, phone number and email are never shown publicly.
- Volunteer profiles are private; you decide who sees yours.
- We don't sell your personal information.
- You can download or delete your data at any time.

## Information we collect
### Information you give us
- **Account details:** name, email address, password (stored securely hashed) and, for volunteers, date of birth to apply age rules.
- **Profile details:** display name, general location, skills, interests, availability, languages and "About you" text.
- **Requests and opportunities:** descriptions, dates, general area and, when needed, an exact address that's shared only with accepted volunteers.
- **Messages and files** you send in Volunteer Services, and reports you file.
- **Volunteer records:** applications, attendance, hours, reviews and badges.
- **Organization details:** name, mission, location and verification information.

### Information collected automatically
- Device and log information such as IP address (stored in a hashed form for rate-limiting and abuse prevention), browser type and pages visited.
- Cookies that keep you signed in and remember your preferences. We don't use advertising cookies.

## How we use information
- To run the Service: create your account, show relevant opportunities, process applications and deliver messages and notifications.
- To keep people safe: mask contact details, screen messages for scams, review reports and enforce our [Code of conduct](/code-of-conduct).
- To keep records: hours, reviews and certificates you choose to share.
- To improve Volunteer Services, using aggregated information.
- To meet legal obligations.

## Who can see your information
- **Publicly:** opportunities (with the general area only) and organization profiles.
- **Organizers you apply to:** your display name, application note, reliability, rating and relevant profile details. Your exact contact details are shared only after acceptance, and never for volunteers under 18.
- **People you share a link with:** your accomplishments and the details you switch on in Profile → Share your profile. Turning the link off stops access immediately.
- **Our team:** authorized staff, to provide support and enforce our policies.
- **Service providers** who host our systems and send email for us, under contracts that protect your information.
- **Authorities**, when the law requires it or to prevent serious harm.

## How long we keep information
We keep your information while your account is open. When you delete your account we remove or anonymize your personal information within 30 days, except where we must keep certain records longer for safety, legal or accounting reasons. Approved volunteer hours may be kept in anonymized form in an organization's reports.

## Your choices and rights
- Update your profile and privacy settings at any time in Settings.
- Control who can message you and block anyone.
- Download your data or delete your account in **Settings → Account**.
- Depending on where you live (for example California or the EU/UK), you may have additional rights to access, correct, delete or port your information and to object to certain processing. [Contact us](/contact) to make a request; we'll respond within the time the law requires.

## Children
Volunteer Services is not for children under 16. Volunteers aged 16 and 17 have extra protections: no shareable profile, masked contact details and guardian consent where an opportunity requires it. If you believe a child under 16 has an account, please contact us.

## Security
We use encryption in transit, hashed passwords, two-step sign-in for staff, access controls and monitoring. No system is perfectly secure, so please use a strong, unique password.

## Changes to this policy
We'll post any changes here and update the date above. If a change is material we'll tell you in the app or by email.

## Contact
Questions or requests about privacy? [Contact us](/contact).`
};

export const ALL_PAGES = [ABOUT, HOW_IT_WORKS, HELP, TRUST_SAFETY, CODE_OF_CONDUCT, TERMS, PRIVACY];
