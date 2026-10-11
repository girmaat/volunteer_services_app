# Email: delivery, templates and deliverability

## How email is sent
- `apps/api/src/auth/email.ts` → `sendEmail({ to, subject, text, html, headers })`.
  `EMAIL_TRANSPORT=log` (default locally) prints to the API console; `smtp` sends via `SMTP_HOST/PORT/USER/PASS`
  (Postmark's SMTP endpoint in production, see Phase 5). `disabled` drops mail.
- Product notifications go through `modules/notifications/service.ts` → `notify(userId, type, …)`:
  it writes the in-app notification, checks the user's per-type preference, and sends one HTML + plain-text email
  built by `templates.ts`. Every send is recorded in `email_log` (used for the hourly message digest and reminder de-duplication).
- Events are queued jobs (pg-boss), never sent inside a web request: `notify.application_received`,
  `notify.application_status`, `notify.request_*`, `notify.review_requested`, `notify.message_received` (max one email an hour),
  `reminders.attendance` (every 15 min; 48 h and 2 h before a confirmed shift).

## Unsubscribe
- Every product email carries `List-Unsubscribe: <API_PUBLIC_URL/v1/notifications/unsubscribe?token=…>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), plus a footer link to `/unsubscribe?token=…` on the web.
- Tokens are HMAC-signed (`NOTIFICATION_SECRET`, required in production) over user id + notification type; no table.
- Account/security mail (verify email, password reset, team invites) is transactional and always sent.

## DNS for the sending domain (do this before UAT emails go to real inboxes)
| Record | Value (example for Postmark; use the values the provider shows) |
| --- | --- |
| SPF (TXT on the root or bounce subdomain) | `v=spf1 include:spf.mtasv.net ~all` |
| DKIM (TXT `<selector>._domainkey`) | the public key from the provider's "Sender signatures → DNS" page |
| Return-Path (CNAME `pm-bounces`) | `pm.mtasv.net` |
| DMARC (TXT `_dmarc`) | start with `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain; fo=1`, move to `p=quarantine` after two clean weeks |

Check with `dig TXT yourdomain`, `dig TXT <selector>._domainkey.yourdomain`, `dig TXT _dmarc.yourdomain`, and send a test to
mail-tester.com (aim for 10/10) before switching `EMAIL_TRANSPORT=smtp` in production.
