import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238): 6 digits, 30-second steps, SHA-1 — what Google
 * Authenticator, Microsoft Authenticator, 1Password, Authy etc. all use.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer) {
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

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function hotp(secret: string, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS);

/** The step a code matches (allowing one step of clock drift either way), or null. */
export function verifyTotp(secret: string, code: string, ms = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const now = stepAt(ms);
  for (const step of [now, now - 1, now + 1]) {
    const want = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(want, Buffer.from(c))) return step;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string) {
  return `otpauth://totp/${encodeURIComponent(`MATCHX:${account}`)}?secret=${secret}&issuer=MATCHX&digits=6&period=${STEP_SECONDS}`;
}

/** Ten one-time backup codes like "7KQ2-M9XD", and their hashes for storage. */
export function newBackupCodes() {
  const codes = Array.from({ length: 10 }, () => {
    const s = base32Encode(randomBytes(5)).slice(0, 8);
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashBackupCode) };
}
export const hashBackupCode = (c: string) => createHash("sha256").update(c.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");
