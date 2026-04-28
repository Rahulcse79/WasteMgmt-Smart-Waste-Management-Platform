import { describe, expect, it } from 'vitest';
import { checkPassword } from '../../src/utils/passwordPolicy.js';

describe('passwordPolicy.checkPassword', () => {
  describe('rejects', () => {
    const cases: Array<[string, string]> = [
      ['', 'too short empty'],
      ['short1A', 'less than 10 chars'],
      ['Password!', '9 chars'],
      ['1234567890', 'no letter'],
      ['abcdefghij', 'no digit'],
      ['ABCDEFGHIJ', 'no digit'],
      ['aaaaaaaaaa1', 'repeated chars'],
      ['password123', 'common'],
      ['12345678', 'common short'],
      ['qwerty', 'common'],
      ['letmein', 'common short'],
      ['welcome', 'common short'],
      ['changeme', 'common short'],
      ['wastemgmt', 'common short'],
      ['coraltele', 'common short'],
    ];
    it.each(cases)('%s → invalid (%s)', (pw) => {
      const r = checkPassword(pw);
      expect(r.ok).toBe(false);
    });

    it('rejects non-strings', () => {
      // @ts-expect-error testing runtime guard
      expect(checkPassword(null).ok).toBe(false);
      // @ts-expect-error testing runtime guard
      expect(checkPassword(undefined).ok).toBe(false);
      // @ts-expect-error testing runtime guard
      expect(checkPassword(12345).ok).toBe(false);
    });

    it('rejects > 256 chars', () => {
      const r = checkPassword('Aa1' + 'x'.repeat(260));
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('max_length_256');
    });
  });

  describe('accepts', () => {
    it.each([
      'StrongPass1A',
      'Tr0ub4dor&3plus',
      'CorrectHorseBattery1',
      'Aa1!Aa1!Aa1!',
      'Coral2026Telecom!',
      'Mongoose#Lover42',
    ])('%s → valid', (pw) => {
      const r = checkPassword(pw);
      expect(r.ok).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(2);
    });
  });

  it('reports a numeric score 0–4', () => {
    expect(checkPassword('Aa1Aa1Aa1Aa').score).toBeGreaterThanOrEqual(2);
    expect(checkPassword('Aa1Aa1Aa1Aa!').score).toBe(4);
  });
});
