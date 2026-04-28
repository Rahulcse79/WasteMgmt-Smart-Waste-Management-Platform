import { describe, expect, it } from 'vitest';
import { encryptString, decryptString, encryptPayload, decryptPayload } from '../../src/utils/crypto.js';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('crypto', () => {
  it('round-trips a string through AES-256-GCM', () => {
    const ct = encryptString('hello world', KEY);
    expect(typeof ct).toBe('string');
    expect(ct.split(':')).toHaveLength(3);
    expect(decryptString(ct, KEY)).toBe('hello world');
  });

  it('round-trips JSON objects via encryptPayload/decryptPayload', () => {
    const obj = { user: 'alice', n: 7, deep: { ok: true } };
    const ct = encryptPayload(obj, KEY);
    const back = decryptPayload<typeof obj>(ct, KEY);
    expect(back).toEqual(obj);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encryptString('same', KEY);
    const b = encryptString('same', KEY);
    expect(a).not.toEqual(b);
  });

  it('fails to decrypt with the wrong key', () => {
    const ct = encryptString('top-secret', KEY);
    const bad = 'f'.repeat(64);
    expect(() => decryptString(ct, bad)).toThrow();
  });

  it('rejects malformed payloads', () => {
    expect(() => decryptString('not-a-payload', KEY)).toThrow();
    expect(() => decryptString('aa:bb', KEY)).toThrow();
    expect(() => decryptPayload('totally-broken', KEY)).toThrow();
  });

  it('handles unicode + emoji round-trip', () => {
    const text = 'Smart 🚛 waste — café | 中文 | 🇮🇳';
    expect(decryptString(encryptString(text, KEY), KEY)).toBe(text);
  });

  it('handles large payloads (~64KB)', () => {
    const big = 'x'.repeat(64 * 1024);
    expect(decryptString(encryptString(big, KEY), KEY).length).toBe(big.length);
  });

  it('detects tampering via the GCM auth tag', () => {
    const ct = encryptString('tamper-me', KEY);
    const [iv, tag, data] = ct.split(':');
    // Flip the last hex nibble of the ciphertext.
    const flipped = data!.slice(0, -1) + (data!.slice(-1) === '0' ? '1' : '0');
    expect(() => decryptString(`${iv}:${tag}:${flipped}`, KEY)).toThrow();
  });
});

