/**
 * Time-based one-time passwords (RFC 6238, the codes authenticator apps show), with node crypto only.
 * SHA-1, 6 digits, 30-second steps: what Google Authenticator, 1Password, Authy and others expect.
 * Secrets are stored encrypted (AES-256-GCM) with a key from MFA_SECRET_KEY.
 */
import crypto from "crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(crypto.randomBytes(20));

/** The 6-digit code for a secret at a time step. */
export function hotp(secret: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export const currentStep = (at = Date.now()) => Math.floor(at / 1000 / STEP_SECONDS);

/**
 * Checks a code against the current step and one on either side (clock drift). Returns the step it
 * matched, or null. A step at or before `lastStep` is refused so a code can't be replayed.
 */
export function verifyTotp(secret: string, code: string, lastStep: number | null = null, at = Date.now()): number | null {
  const c = String(code).replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const now = currentStep(at);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep != null && step <= lastStep) continue;
    const expected = hotp(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return step;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string, issuer = "Volunteer Services") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

// ---- Secret storage ---------------------------------------------------------------------------------

function key(raw: string) {
  return crypto.createHash("sha256").update(raw).digest();
}

export function sealSecret(secret: string, rawKey: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(rawKey), iv);
  const body = Buffer.concat([c.update(secret, "utf8"), c.final()]);
  return `v1:${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${body.toString("base64url")}`;
}

export function openSecret(sealed: string, rawKey: string): string | null {
  const [v, iv, tag, body] = String(sealed).split(":");
  if (v !== "v1" || !iv || !tag || !body) return null;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Ten single-use recovery codes like "k7m2p-9xq4r". */
export function recoveryCodes(n = 10): string[] {
  const alpha = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: n }, () => {
    const b = crypto.randomBytes(10);
    const s = Array.from(b, (x) => alpha[x % alpha.length]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export const hashRecovery = (code: string) => crypto.createHash("sha256").update(code.trim().toLowerCase().replace(/\s/g, "")).digest("hex");
