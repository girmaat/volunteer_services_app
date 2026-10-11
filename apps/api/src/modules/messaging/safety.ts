/**
 * Message safety (Phase 4.6): contact details are masked until an application is accepted, and
 * messages that look like scams wait for a moderator instead of being delivered.
 */

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// 7+ digits allowing spaces, dots, dashes and brackets: (555) 123-4567, +1 555 123 4567, 5551234567.
const PHONE = /(?:\+?\d[\d\s().-]{5,}\d)/g;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const BARE_DOMAIN = /\b[a-z0-9-]{2,}\.(?:com|org|net|io|co|me|app|ly|gg|info|biz|us|link|site|xyz)\b(?:\/[^\s<>"]*)?/gi;
const HANDLE = /(?:^|\s)@(?:[a-z0-9_.]{3,30})\b|\b(?:whatsapp|telegram|signal|snapchat|instagram|insta|ig)\s*[:@]?\s*[a-z0-9_.+-]{3,}/gi;

// Dates such as 2026-10-24 or 10/24/2026 aren't phone numbers.
const DATE = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})$/;

export const MASK_CONTACT = "[contact details hidden until accepted]";
export const MASK_LINK = "[link hidden until accepted]";

function digitsCount(s: string) {
  return (s.match(/\d/g) || []).length;
}

/** Hides emails, phone numbers, links and social handles. */
export function maskContacts(body: string): string {
  return body
    .replace(EMAIL, MASK_CONTACT)
    .replace(URL, MASK_LINK)
    .replace(BARE_DOMAIN, MASK_LINK)
    .replace(PHONE, (m) => (digitsCount(m) >= 7 && !DATE.test(m.trim()) ? MASK_CONTACT : m))
    .replace(HANDLE, (m) => (m.startsWith(" ") ? " " : "") + MASK_CONTACT);
}

export function containsLink(body: string) {
  // An email address's domain isn't a link (emails are masked separately).
  const text = body.replace(EMAIL, " ");
  URL.lastIndex = 0;
  BARE_DOMAIN.lastIndex = 0;
  return URL.test(text) || BARE_DOMAIN.test(text);
}

const SCAM_PATTERNS: [RegExp, string][] = [
  [/\bgift\s*cards?\b/i, "gift cards"],
  [/\bwire\s*(?:transfer|money)\b|\bwestern\s*union\b|\bmoney\s*gram\b/i, "wire transfer"],
  [/\b(?:bitcoin|btc|crypto(?:currency)?|usdt|ethereum)\b/i, "crypto"],
  [/\b(?:cash\s*app|cashapp|venmo|zelle|paypal\s*me)\b/i, "payment app"],
  [/\b(?:bank\s*account|routing\s*number|account\s*number|iban)\b/i, "bank details"],
  [/\b(?:social\s*security|ssn)\b/i, "social security number"],
  [/\b(?:password|passcode|verification\s*code|one[-\s]?time\s*code|otp)\b/i, "passwords or codes"],
  [/\b(?:send|lend|loan)\s+(?:me\s+)?(?:\$|money|cash|funds)/i, "asking for money"]
];

/** Returns why a message should be held for review, or null. New accounts can't send links before acceptance. */
export function holdReason(body: string, opts: { unlocked: boolean; senderAgeDays: number }): string | null {
  for (const [re, label] of SCAM_PATTERNS) if (re.test(body)) return `Mentions ${label}`;
  if (!opts.unlocked && opts.senderAgeDays < 7 && containsLink(body)) return "Link from a new account";
  return null;
}
