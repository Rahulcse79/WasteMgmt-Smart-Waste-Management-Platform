import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/utils/password.js';

describe('password utility', () => {
  it('hashes are non-trivially long and not equal to plaintext', async () => {
    const h = await hashPassword('Hello#2026');
    expect(h.length).toBeGreaterThan(40);
    expect(h).not.toContain('Hello#2026');
  });

  it('verifies correct password', async () => {
    const h = await hashPassword('Hello#2026');
    expect(await verifyPassword('Hello#2026', h)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const h = await hashPassword('Hello#2026');
    expect(await verifyPassword('hello#2026', h)).toBe(false);
    expect(await verifyPassword('', h)).toBe(false);
  });

  it('produces unique hashes for the same input (salt)', async () => {
    const a = await hashPassword('SamePass#1');
    const b = await hashPassword('SamePass#1');
    expect(a).not.toBe(b);
    expect(await verifyPassword('SamePass#1', a)).toBe(true);
    expect(await verifyPassword('SamePass#1', b)).toBe(true);
  });
});
