

// Public-safe rendering helpers (marketing pages must never leak private contact or exact addresses)
export const STREET_WORDS = [
  "street","st","avenue","ave","road","rd","boulevard","blvd","lane","ln","drive","dr","court","ct","place","pl","way","parkway","pkwy","circle","cir","suite","ste","apt","apartment","unit"
];

export function redactEmails(text: string) {
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]");
}

export function redactPhones(text: string) {
  // Common US phone patterns
  return text.replace(/(?:\+?1[\s.-]?)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g, "[redacted phone]");
}

export function redactAddressLike(text: string) {
  // Replace obvious street-address patterns like "123 Main St" (keeps the rest of the sentence)
  const streetRe = new RegExp(
    String.raw`\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:${STREET_WORDS.join("|")})\b`,
    "gi"
  );
  return text.replace(streetRe, "[address redacted]");
}

export function sanitizePublicDescription(text: string) {
  const input = String(text || "");
  // Keep it readable but remove likely private info
  let out = input;
  out = redactEmails(out);
  out = redactPhones(out);
  out = redactAddressLike(out);
  return out;
}

export function looksPreciseLocation(text: string) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  // Digits often indicate a street number or unit/zip. Also block @ mentions (emails) and common street words.
  if (/\d/.test(t)) return true;
  if (t.includes("@")) return true;
  return STREET_WORDS.some((w) => t.includes(` ${w}`) || t.endsWith(` ${w}`));
}

export function derivePublicLocation(mode: string, rawLocation: string | null | undefined, orgLocation: string | null | undefined) {
  const m = String(mode || "remote").toLowerCase();
  if (m === "remote") return "Remote";

  // Prefer the request's own area (reduced to "City, ST"), then the organization's area.
  const raw = String(rawLocation || "").trim();
  if (raw) {
    if (!looksPreciseLocation(raw)) {
      const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
      return parts.length > 2 ? parts.slice(-2).join(", ") : raw;
    }
    // Try to reduce "123 Main St, City, ST 02139" -> "City, ST"
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const cityState = parts.slice(-2).join(", ").replace(/\b\d{5}(?:-\d{4})?\b/g, "").trim();
      if (cityState && !looksPreciseLocation(cityState)) return cityState;
    }
  }

  const orgLoc = String(orgLocation || "").trim();
  if (orgLoc && !looksPreciseLocation(orgLoc)) return orgLoc;

  // If we can't safely derive, never leak the raw string
  return "Location shared after you apply";
}

export function coarseLocationFromText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Prefer the last 1-2 comma-separated segments (often "City, ST" or "Region, Country").
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  let candidate = parts.length >= 2 ? `${parts[parts.length - 2]}, ${parts[parts.length - 1]}` : parts[0];

  // If it looks like a street address (digits / common street tokens), fall back to the last segment.
  const looksStreety = /\d/.test(candidate) || /\b(st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|apt|suite|unit)\b/i.test(candidate);
  if (looksStreety && parts.length >= 1) {
    candidate = parts[parts.length - 1];
  }

  candidate = candidate.replace(/\s+/g, " ").trim();
  if (!candidate) return null;

  // Safety: cap length.
  if (candidate.length > 80) candidate = candidate.slice(0, 80).trim();

  return candidate;
}
