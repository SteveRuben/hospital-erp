/**
 * MFA Service Tests
 *
 * Covers:
 * - generateSecret: format, length, otpauth URL fields
 * - verifyToken: correct token accepted, wrong rejected
 * - verifyToken: window tolerance (±1 period of 30s)
 * - verifyToken: tokens outside window rejected
 * - verifyToken: malformed/empty tokens rejected (no crash)
 * - verifyToken: timing-safe comparison (different lengths)
 * - isMfaRequired: roles
 *
 * The DB-dependent functions (isMfaEnabled, getMfaSecret, enableMfa,
 * disableMfa) are not tested here — they're thin wrappers around `query`
 * and require an integration test with a real or mocked DB.
 */

import { describe, it, expect, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';
import mfa, { generateSecret, verifyToken, isMfaRequired } from '../services/mfa.js';

const TOTP_PERIOD = 30; // matches mfa.ts
const TOTP_DIGITS = 6;
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Mirror of mfa.ts internal generateTOTP/base32Decode for test-side computation.
// Keeps test independent of the implementation it verifies.
function base32Decode(str: string): Buffer {
  let bits = '';
  for (const char of str.toUpperCase()) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function computeTOTP(secret: string, atMs: number): string {
  const counter = Math.floor(atMs / 1000 / TOTP_PERIOD);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % (10 ** TOTP_DIGITS);
  return code.toString().padStart(TOTP_DIGITS, '0');
}

describe('mfa.generateSecret', () => {
  it('returns base32 secret of expected length (20 bytes → 32 chars)', () => {
    const { secret } = generateSecret('alice');
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBe(32);
  });

  it('returns a different secret each call', () => {
    const a = generateSecret('alice').secret;
    const b = generateSecret('alice').secret;
    expect(a).not.toBe(b);
  });

  it('returns a valid otpauth URL with required fields', () => {
    const { secret, otpauthUrl } = generateSecret('dr.house');
    expect(otpauthUrl).toContain('otpauth://totp/');
    expect(otpauthUrl).toContain(`secret=${secret}`);
    expect(otpauthUrl).toContain('issuer=Hospital%20ERP');
    expect(otpauthUrl).toContain('algorithm=SHA1');
    expect(otpauthUrl).toContain('digits=6');
    expect(otpauthUrl).toContain('period=30');
  });

  it('URL-encodes the username in the otpauth URL', () => {
    const { otpauthUrl } = generateSecret('user@example.com');
    expect(otpauthUrl).toContain(encodeURIComponent('user@example.com'));
  });
});

describe('mfa.verifyToken', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts the current token', () => {
    const { secret } = generateSecret('alice');
    const token = computeTOTP(secret, Date.now());
    expect(verifyToken(token, secret)).toBe(true);
  });

  it('rejects a wrong token', () => {
    const { secret } = generateSecret('alice');
    expect(verifyToken('000000', secret)).toBe(false);
  });

  it('accepts the previous-period token (±1 window tolerance)', () => {
    const { secret } = generateSecret('alice');
    const now = 1_700_000_000_000; // fixed reference
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const previous = computeTOTP(secret, now - TOTP_PERIOD * 1000);
    expect(verifyToken(previous, secret)).toBe(true);
  });

  it('accepts the next-period token (±1 window tolerance)', () => {
    const { secret } = generateSecret('alice');
    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const next = computeTOTP(secret, now + TOTP_PERIOD * 1000);
    expect(verifyToken(next, secret)).toBe(true);
  });

  it('rejects a token from 90 seconds ago (outside window)', () => {
    const { secret } = generateSecret('alice');
    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const old = computeTOTP(secret, now - 3 * TOTP_PERIOD * 1000);
    expect(verifyToken(old, secret)).toBe(false);
  });

  it('rejects a token from the future (90s ahead, outside window)', () => {
    const { secret } = generateSecret('alice');
    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const future = computeTOTP(secret, now + 3 * TOTP_PERIOD * 1000);
    expect(verifyToken(future, secret)).toBe(false);
  });

  it('rejects an empty token without crashing (timing-safe)', () => {
    const { secret } = generateSecret('alice');
    expect(verifyToken('', secret)).toBe(false);
  });

  it('rejects a token with wrong length (5 digits) without crashing', () => {
    const { secret } = generateSecret('alice');
    expect(verifyToken('12345', secret)).toBe(false);
  });

  it('rejects a token with extra digits (7) without crashing', () => {
    const { secret } = generateSecret('alice');
    expect(verifyToken('1234567', secret)).toBe(false);
  });

  it('rejects non-numeric input without crashing', () => {
    const { secret } = generateSecret('alice');
    expect(verifyToken('abcdef', secret)).toBe(false);
  });

  it('uses crypto.timingSafeEqual (length mismatch should not throw)', () => {
    // crypto.timingSafeEqual throws if buffers differ in length; the implementation
    // guards with `expected.length === token.length` first. This regression test
    // ensures that guard stays in place.
    const { secret } = generateSecret('alice');
    expect(() => verifyToken('1', secret)).not.toThrow();
    expect(() => verifyToken('1234567890123456', secret)).not.toThrow();
  });

  it('does not accept a valid code from another secret', () => {
    const a = generateSecret('alice').secret;
    const b = generateSecret('bob').secret;
    const tokenForA = computeTOTP(a, Date.now());
    expect(verifyToken(tokenForA, b)).toBe(false);
  });
});

describe('mfa.isMfaRequired', () => {
  it('requires MFA for admin', () => {
    expect(isMfaRequired('admin')).toBe(true);
  });

  it('requires MFA for medecin', () => {
    expect(isMfaRequired('medecin')).toBe(true);
  });

  it('does not require MFA for comptable, laborantin, reception', () => {
    expect(isMfaRequired('comptable')).toBe(false);
    expect(isMfaRequired('laborantin')).toBe(false);
    expect(isMfaRequired('reception')).toBe(false);
  });

  it('does not require MFA for unknown roles (defensive default)', () => {
    expect(isMfaRequired('superuser')).toBe(false);
    expect(isMfaRequired('')).toBe(false);
  });
});

describe('mfa default export', () => {
  it('exposes the same functions as named exports', () => {
    expect(mfa.generateSecret).toBe(generateSecret);
    expect(mfa.verifyToken).toBe(verifyToken);
    expect(mfa.isMfaRequired).toBe(isMfaRequired);
  });
});
