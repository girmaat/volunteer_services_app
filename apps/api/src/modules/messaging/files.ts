/**
 * Attachment checks: size limit, an allow-list of types, and content sniffing so a file can't claim
 * to be a PDF while being something else. A malware scanner (e.g. ClamAV) plugs in at `scan` in Phase 5.
 */
import crypto from "node:crypto";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const startsWith = (b: Buffer, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

export function sniffType(buf: Buffer, declaredName: string): string | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    // Office Open XML (docx): a zip whose entries include word/.
    const head = buf.subarray(0, Math.min(buf.length, 64 * 1024)).toString("latin1");
    if (head.includes("word/") && /\.docx$/i.test(declaredName)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return null;
  }
  // Plain text: valid UTF-8, no NUL bytes.
  if (/\.(txt|csv)$/i.test(declaredName) && !buf.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buf);
      return /\.csv$/i.test(declaredName) ? "text/csv" : "text/plain";
    } catch {
      return null;
    }
  }
  return null;
}

export type FileCheck = { ok: true; mime: string; sha256: string } | { ok: false; reason: string };

export async function checkAttachment(buf: Buffer, name: string): Promise<FileCheck> {
  if (!buf.length) return { ok: false, reason: "The file is empty." };
  if (buf.length > MAX_ATTACHMENT_BYTES) return { ok: false, reason: "Files can be up to 5 MB." };
  if (/\.(exe|bat|cmd|com|scr|js|vbs|ps1|sh|jar|msi|apk|dmg|html?|svg)$/i.test(name)) return { ok: false, reason: "That file type isn't allowed." };
  const mime = sniffType(buf, name);
  if (!mime) return { ok: false, reason: "Share PDFs, images (PNG, JPEG, WebP), Word documents or text files." };
  const scanned = await scan(buf);
  if (!scanned) return { ok: false, reason: "The file didn't pass our safety check." };
  return { ok: true, mime, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
}

/** Malware scan hook. Rejects the EICAR test signature today; Phase 5 wires a real scanner. */
async function scan(buf: Buffer): Promise<boolean> {
  return !buf.subarray(0, 4096).toString("latin1").includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE");
}
