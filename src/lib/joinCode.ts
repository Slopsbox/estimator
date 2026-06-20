import { JOIN_CODE_CHARS } from './constants';

/**
 * Genererer en tilfeldig 4-tegns sesjonskode.
 * Bruker kun tegn fra JOIN_CODE_CHARS (A-Z unntatt I og O, 2-9 unntatt 0 og 1).
 */
export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += JOIN_CODE_CHARS[Math.floor(Math.random() * JOIN_CODE_CHARS.length)];
  }
  return code;
}
