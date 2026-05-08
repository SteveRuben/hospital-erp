/**
 * MFA (Multi-Factor Authentication) Service
 * TOTP-based 2FA for admin and medecin roles
 * Pure implementation using Node.js crypto (RFC 6238)
 */

import crypto from 'crypto';
import QRCode from 'qrcode';
import { query } from '../config/db.js';

const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // allow ±1 period tolerance

// Base32 encoding/decoding (RFC 4648)
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += BASE32_CHARS[parseInt(chunk, 2)];
  }
  return result;
}

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

// Generate TOTP token for a given time
function generateTOTP(secret: string, time: number = Date.now()): string {
  const counter = Math.floor(time / 1000 / TOTP_PERIOD);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % (10 ** TOTP_DIGITS);

  return code.toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Generate a new MFA secret for a user
 */
export function generateSecret(username: string): { secret: string; otpauthUrl: string } {
  const buffer = crypto.randomBytes(20);
  const secret = base32Encode(buffer);
  const otpauthUrl = `otpauth://totp/Hospital%20ERP:${encodeURIComponent(username)}?secret=${secret}&issuer=Hospital%20ERP&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
  return { secret, otpauthUrl };
}

/**
 * Generate QR code as data URL for the TOTP setup
 */
export async function generateQRCode(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

/**
 * Verify a TOTP token against a secret (with window tolerance)
 * Uses constant-time comparison to prevent timing attacks
 */
export function verifyToken(token: string, secret: string): boolean {
  const now = Date.now();
  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const time = now + i * TOTP_PERIOD * 1000;
    const expected = generateTOTP(secret, time);
    // Constant-time comparison to prevent timing attacks
    if (expected.length === token.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a user has MFA enabled
 */
export async function isMfaEnabled(userId: number): Promise<boolean> {
  const result = await query('SELECT mfa_enabled FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0 && result.rows[0].mfa_enabled === true;
}

/**
 * Get user's MFA secret (for verification)
 */
export async function getMfaSecret(userId: number): Promise<string | null> {
  const result = await query('SELECT mfa_secret FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) return null;
  return result.rows[0].mfa_secret || null;
}

/**
 * Enable MFA for a user (store secret, mark as enabled)
 */
export async function enableMfa(userId: number, secret: string): Promise<void> {
  await query('UPDATE users SET mfa_secret = $1, mfa_enabled = TRUE WHERE id = $2', [secret, userId]);
}

/**
 * Disable MFA for a user
 */
export async function disableMfa(userId: number): Promise<void> {
  await query('UPDATE users SET mfa_secret = NULL, mfa_enabled = FALSE WHERE id = $1', [userId]);
}

/**
 * Check if MFA is required for a given role
 */
export function isMfaRequired(role: string): boolean {
  return ['admin', 'medecin'].includes(role);
}

export default {
  generateSecret,
  generateQRCode,
  verifyToken,
  isMfaEnabled,
  getMfaSecret,
  enableMfa,
  disableMfa,
  isMfaRequired,
};
