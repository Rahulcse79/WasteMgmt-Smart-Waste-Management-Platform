import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getKey(hex: string): Buffer {
  if (hex.length === 64) return Buffer.from(hex, 'hex');
  // Fallback: derive deterministic key (not recommended for prod)
  return scryptSync(hex, 'wastemgmt.salt', 32);
}

/** Encrypts a raw UTF-8 string into the form: iv:tag:ciphertext (all hex). */
export function encryptString(plain: string, hexKey: string): string {
  const key = getKey(hexKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${data.toString('hex')}`;
}

/** Decrypts iv:tag:ciphertext back into the original UTF-8 string. */
export function decryptString(token: string, hexKey: string): string {
  const [ivHex, tagHex, dataHex] = token.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Malformed encrypted payload');
  }
  const key = getKey(hexKey);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const out = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return out.toString('utf8');
}

/** Encrypts a JSON-serialisable value into the form: iv:tag:ciphertext (all hex). */
export function encryptPayload(plain: unknown, hexKey: string): string {
  return encryptString(JSON.stringify(plain), hexKey);
}

/** Decrypts iv:tag:ciphertext back into the original value. */
export function decryptPayload<T = unknown>(token: string, hexKey: string): T {
  return JSON.parse(decryptString(token, hexKey)) as T;
}
