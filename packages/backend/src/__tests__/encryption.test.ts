/**
 * PHI Encryption Service Tests
 *
 * Covers:
 * - Round-trip encrypt/decrypt with valid key
 * - Output format (iv:authTag:ciphertext base64)
 * - Probabilistic IV (same plaintext → different ciphertexts)
 * - Tampered ciphertext detection (auth tag failure)
 * - Null / undefined / empty inputs
 * - encryptFields / decryptFields object helpers
 * - Passthrough mode (no key, invalid key length, placeholder)
 *
 * Module loads the key at import time, so we use dynamic import
 * after setting process.env.PHI_ENCRYPTION_KEY in each describe block.
 */

import { describe, it, expect, beforeAll, afterEach, jest } from '@jest/globals';

const VALID_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 hex chars

describe('encryption (key configured)', () => {
  let svc: typeof import('../services/encryption.js');

  beforeAll(async () => {
    process.env.PHI_ENCRYPTION_KEY = VALID_KEY;
    jest.resetModules();
    svc = await import('../services/encryption.js');
  });

  it('reports encryption enabled', () => {
    expect(svc.isEncryptionEnabled()).toBe(true);
  });

  it('round-trips a string', () => {
    const plaintext = 'patient: Jean Dupont, NIR: 1234567890123';
    const cipher = svc.encrypt(plaintext);
    expect(cipher).not.toBe(plaintext);
    expect(cipher).not.toBeNull();
    const decrypted = svc.decrypt(cipher!);
    expect(decrypted).toBe(plaintext);
  });

  it('round-trips unicode and emoji', () => {
    const plaintext = 'Hôpital — 🏥 — Côte d\'Ivoire';
    const cipher = svc.encrypt(plaintext);
    const decrypted = svc.decrypt(cipher!);
    expect(decrypted).toBe(plaintext);
  });

  it('output has format iv:authTag:ciphertext (3 base64 parts)', () => {
    const cipher = svc.encrypt('hello');
    expect(cipher).not.toBeNull();
    const parts = cipher!.split(':');
    expect(parts).toHaveLength(3);
    // IV is 12 bytes → 16 base64 chars (with padding)
    expect(Buffer.from(parts[0], 'base64')).toHaveLength(12);
    // Auth tag is 16 bytes → 24 base64 chars (with padding)
    expect(Buffer.from(parts[1], 'base64')).toHaveLength(16);
    // Ciphertext is non-empty
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = svc.encrypt('same input');
    const b = svc.encrypt('same input');
    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(svc.decrypt(a!)).toBe('same input');
    expect(svc.decrypt(b!)).toBe('same input');
  });

  it('returns null for null/undefined inputs', () => {
    expect(svc.encrypt(null)).toBeNull();
    expect(svc.encrypt(undefined)).toBeNull();
    expect(svc.decrypt(null)).toBeNull();
    expect(svc.decrypt(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    // Empty string is falsy → treated as null per implementation
    expect(svc.encrypt('')).toBeNull();
    expect(svc.decrypt('')).toBeNull();
  });

  it('decrypt of non-encrypted string passes through (migration safe)', () => {
    // Plain string (no colons) → returned as-is
    expect(svc.decrypt('plain text')).toBe('plain text');
    // Wrong number of colons → returned as-is
    expect(svc.decrypt('foo:bar')).toBe('foo:bar');
    expect(svc.decrypt('foo:bar:baz:qux')).toBe('foo:bar:baz:qux');
  });

  it('decrypt of tampered ciphertext returns the input unchanged (auth tag fails → catch)', () => {
    const cipher = svc.encrypt('sensitive');
    const parts = cipher!.split(':');
    // Flip a bit in the ciphertext
    const tamperedBuf = Buffer.from(parts[2], 'base64');
    tamperedBuf[0] ^= 0x01;
    const tampered = `${parts[0]}:${parts[1]}:${tamperedBuf.toString('base64')}`;
    // Implementation catches GCM auth failure and returns the input as-is
    const result = svc.decrypt(tampered);
    expect(result).toBe(tampered);
    expect(result).not.toBe('sensitive');
  });

  it('decrypt of malformed base64 returns input unchanged', () => {
    const malformed = 'not-base64:also-bad:still-bad';
    expect(svc.decrypt(malformed)).toBe(malformed);
  });

  it('encryptFields encrypts only listed string fields', () => {
    const obj = {
      id: 42,
      nom: 'Dupont',
      numero_identite: '1234567890123',
      groupe_sanguin: 'A+',
      created_at: new Date('2026-01-01').toISOString(),
    };
    const enc = svc.encryptFields(obj, ['numero_identite', 'groupe_sanguin']);
    expect(enc.id).toBe(42); // untouched
    expect(enc.nom).toBe('Dupont'); // not in list
    expect(enc.numero_identite).not.toBe('1234567890123');
    expect(enc.groupe_sanguin).not.toBe('A+');
    // Round-trip
    const dec = svc.decryptFields(enc, ['numero_identite', 'groupe_sanguin']);
    expect(dec.numero_identite).toBe('1234567890123');
    expect(dec.groupe_sanguin).toBe('A+');
  });

  it('encryptFields skips non-string fields', () => {
    const obj = { age: 42, alive: true, name: 'X' };
    const enc = svc.encryptFields(obj, ['age', 'alive', 'name']);
    expect(enc.age).toBe(42);
    expect(enc.alive).toBe(true);
    expect(enc.name).not.toBe('X'); // string field encrypted
  });

  it('does not mutate the original object', () => {
    const obj = { secret: 'hello' };
    const enc = svc.encryptFields(obj, ['secret']);
    expect(obj.secret).toBe('hello'); // original unchanged
    expect(enc.secret).not.toBe('hello');
  });
});

describe('encryption (no key — passthrough mode)', () => {
  let svc: typeof import('../services/encryption.js');

  beforeAll(async () => {
    delete process.env.PHI_ENCRYPTION_KEY;
    jest.resetModules();
    svc = await import('../services/encryption.js');
  });

  it('reports encryption disabled', () => {
    expect(svc.isEncryptionEnabled()).toBe(false);
  });

  it('encrypt passes plaintext through unchanged', () => {
    expect(svc.encrypt('hello')).toBe('hello');
  });

  it('decrypt passes input through unchanged', () => {
    expect(svc.decrypt('hello')).toBe('hello');
    expect(svc.decrypt('foo:bar:baz')).toBe('foo:bar:baz');
  });

  it('encryptFields returns object with unchanged values', () => {
    const obj = { secret: 'plaintext', other: 1 };
    const result = svc.encryptFields(obj, ['secret']);
    expect(result.secret).toBe('plaintext');
  });
});

describe('encryption (invalid key configurations)', () => {
  afterEach(() => {
    delete process.env.PHI_ENCRYPTION_KEY;
  });

  it('refuses CHANGE_ME placeholder (passthrough)', async () => {
    process.env.PHI_ENCRYPTION_KEY = 'CHANGE_ME_64_HEX_CHARS';
    jest.resetModules();
    const svc = await import('../services/encryption.js');
    expect(svc.isEncryptionEnabled()).toBe(false);
    expect(svc.encrypt('x')).toBe('x');
  });

  it('refuses key shorter than 64 chars (passthrough)', async () => {
    process.env.PHI_ENCRYPTION_KEY = '0123456789abcdef'; // 16 chars
    jest.resetModules();
    const svc = await import('../services/encryption.js');
    expect(svc.isEncryptionEnabled()).toBe(false);
  });

  it('refuses key longer than 64 chars (passthrough)', async () => {
    process.env.PHI_ENCRYPTION_KEY = VALID_KEY + 'extra';
    jest.resetModules();
    const svc = await import('../services/encryption.js');
    expect(svc.isEncryptionEnabled()).toBe(false);
  });
});
