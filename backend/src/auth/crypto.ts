import crypto from "crypto";

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomTokenUrlSafe(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}
