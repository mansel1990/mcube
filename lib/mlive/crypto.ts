import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * AES-256-GCM token blob. The same layout is used by any future reader:
 * base64( 12-byte iv || ciphertext || 16-byte tag ).
 * `MLIVE_TOKEN_KEY` is either standard base64 of 32 bytes, or a passphrase
 * whose SHA-256 is the key.
 */
export function tokenKeyBytes(raw: string): Buffer {
  const trimmed = raw.trim();
  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32 && decoded.toString("base64").replace(/=+$/, "") === trimmed.replace(/=+$/, "")) {
      return decoded;
    }
  } catch {
    /* passphrase */
  }
  return createHash("sha256").update(trimmed, "utf8").digest();
}

export function encryptToken(plaintext: string, rawKey: string): string {
  const key = tokenKeyBytes(rawKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}

export function decryptToken(blob: string, rawKey: string): string {
  const key = tokenKeyBytes(rawKey);
  const buf = Buffer.from(blob, "base64");
  if (buf.length < 12 + 16) throw new Error("token blob is too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(12, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
