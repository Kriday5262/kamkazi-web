/**
 * Stage 4.5 — symmetric encryption for OAuth tokens at rest.
 *
 * AES-256-GCM with a key derived from SESSION_SECRET via scrypt (no extra
 * env vars). Ciphertext format: base64url(iv(12) || authTag(16) || data).
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const KEY = scryptSync(
  process.env["SESSION_SECRET"] ?? "dev-only-change-me",
  "kamkazi-token-enc",
  32,
);

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, "base64url");
  if (buf.length < 29) throw new Error("encrypted blob too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
