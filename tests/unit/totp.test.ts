import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hashBackupCode, hotp, newBackupCodes, verifyTotp } from "@/server/auth/totp";

// RFC 6238 test secret "12345678901234567890" (ASCII), SHA-1.
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("two-step login codes", () => {
  it("base32 round-trips", () => {
    const b = Buffer.from([0, 1, 2, 250, 255, 7, 8]);
    expect(base32Decode(base32Encode(b))).toEqual(b);
  });
  it("matches the RFC 6238 test vectors", () => {
    expect(hotp(SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(hotp(SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(hotp(SECRET, Math.floor(1234567890 / 30))).toBe("005924");
  });
  it("accepts the current code and one step either side, nothing older", () => {
    const t = 1_800_000_000_000;
    const step = Math.floor(t / 30_000);
    expect(verifyTotp(SECRET, hotp(SECRET, step), t)).toBe(step);
    expect(verifyTotp(SECRET, hotp(SECRET, step - 1), t)).toBe(step - 1);
    expect(verifyTotp(SECRET, hotp(SECRET, step - 2), t)).toBeNull();
    expect(verifyTotp(SECRET, "12345", t)).toBeNull();
  });
  it("backup codes hash the same however they're typed", () => {
    const { codes, hashes } = newBackupCodes();
    expect(codes).toHaveLength(10);
    expect(hashBackupCode(codes[0].toLowerCase().replace("-", " "))).toBe(hashes[0]);
  });
});
