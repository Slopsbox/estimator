import { describe, expect, it } from 'vitest';

/**
 * Tester join_code-genereringen isolert.
 * Koden er inlined her siden den er en intern helper.
 */

const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += JOIN_CODE_CHARS[Math.floor(Math.random() * JOIN_CODE_CHARS.length)];
  }
  return code;
}

describe('generateJoinCode', () => {
  it('genererer kode med 4 tegn', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateJoinCode()).toHaveLength(4);
    }
  });

  it('bruker kun tillatte tegn (ingen I, O, 0, 1)', () => {
    const forbidden = new Set(['I', 'O', '0', '1']);
    for (let i = 0; i < 100; i++) {
      const code = generateJoinCode();
      for (const char of code) {
        expect(forbidden.has(char), `Ugyldig tegn "${char}" i kode "${code}"`).toBe(false);
      }
    }
  });

  it('bruker kun tegn fra tillatt sett', () => {
    const allowed = new Set(JOIN_CODE_CHARS);
    for (let i = 0; i < 100; i++) {
      const code = generateJoinCode();
      for (const char of code) {
        expect(allowed.has(char), `Tegn "${char}" er ikke i tillatt sett`).toBe(true);
      }
    }
  });

  it('genererer store bokstaver', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateJoinCode();
      expect(code).toBe(code.toUpperCase());
    }
  });

  it('produserer variasjon (ikke alltid samme kode)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateJoinCode()));
    // Med 32^4 ≈ 1M mulige koder bør 50 forsøk gi minst 40 unike
    expect(codes.size).toBeGreaterThan(40);
  });
});
