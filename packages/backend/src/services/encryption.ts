/**
 * PHI Encryption Service
 * AES-256-GCM encryption for Protected Health Information at rest
 * 
 * Usage:
 *   encrypt('sensitive data') → 'iv:authTag:ciphertext' (base64)
 *   decrypt('iv:authTag:ciphertext') → 'sensitive data'
 * 
 * The encryption key is loaded from PHI_ENCRYPTION_KEY env var (32 bytes hex).
 * If not configured, encryption is disabled (passthrough mode) with a warning.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

// Load encryption key from environment
const KEY_HEX = process.env.PHI_ENCRYPTION_KEY || '';
let encryptionKey: Buffer | null = null;

if (KEY_HEX && KEY_HEX.length === 64 && KEY_HEX !== 'CHANGE_ME_64_HEX_CHARS') {
  encryptionKey = Buffer.from(KEY_HEX, 'hex');
  console.log('[ENCRYPTION] PHI encryption enabled (AES-256-GCM)');
} else {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[ENCRYPTION] WARNING: PHI_ENCRYPTION_KEY not configured — sensitive data stored in plaintext');
  }
}

/**
 * Check if encryption is available
 */
export function isEncryptionEnabled(): boolean {
  return encryptionKey !== null;
}

/**
 * Encrypt a plaintext string
 * Returns format: base64(iv):base64(authTag):base64(ciphertext)
 * Returns plaintext unchanged if encryption is not configured
 */
export function encrypt(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  if (!encryptionKey) return plaintext; // Passthrough if no key

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 * Expects format: base64(iv):base64(authTag):base64(ciphertext)
 * Returns the string unchanged if it doesn't look encrypted (no colons)
 */
export function decrypt(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  if (!encryptionKey) return ciphertext; // Passthrough if no key

  // Check if the value looks encrypted (has the iv:tag:data format)
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return ciphertext; // Not encrypted, return as-is

  try {
    const [ivB64, authTagB64, encryptedB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const encrypted = Buffer.from(encryptedB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch {
    // If decryption fails, the value might not be encrypted (migration period)
    return ciphertext;
  }
}

/**
 * Encrypt multiple fields in an object (returns new object)
 */
export function encryptFields<T extends Record<string, unknown>>(obj: T, fields: string[]): T {
  if (!encryptionKey) return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === 'string') {
      (result as any)[field] = encrypt(result[field] as string);
    }
  }
  return result;
}

/**
 * Decrypt multiple fields in an object (returns new object)
 */
export function decryptFields<T extends Record<string, unknown>>(obj: T, fields: string[]): T {
  if (!encryptionKey) return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === 'string') {
      (result as any)[field] = decrypt(result[field] as string);
    }
  }
  return result;
}

// Fields on the Prisma Patient model that should be encrypted at rest.
// Use camelCase to match Prisma's TS API directly — encrypted/decrypted at
// the route boundary, no snake_case conversion needed inside the service.
export const PATIENT_ENCRYPTED_FIELDS = [
  'numeroIdentite',
  'contactUrgenceNom',
  'contactUrgenceTelephone',
] as const;

// Note: groupeSanguin is an enum column (CHECK constraint), cannot be
// encrypted without dropping the enum. Either leave plaintext (current
// behavior, lowest cardinality so least informative) or migrate to TEXT.

// Fields that should be encrypted on Observation rows
export const OBSERVATION_ENCRYPTED_FIELDS = [
  'valeurTexte',
  'commentaire',
] as const;

export default { encrypt, decrypt, encryptFields, decryptFields, isEncryptionEnabled };
