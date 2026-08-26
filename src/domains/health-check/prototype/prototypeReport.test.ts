import { describe, expect, it } from 'vitest';
import { SQUAD_HEALTH_TEMPLATE_V1 } from '../domain';
import {
  PROTOTYPE_HEALTH_REPORT,
  createPrototypeReportCsv,
  escapePrototypeCsvText,
} from './prototypeReport';

describe('prototypeReport', () => {
  it('har deterministiske sammendrag for alle områdene i malversjon 1', () => {
    expect(PROTOTYPE_HEALTH_REPORT).toEqual({
      measurementDate: '2026-08-15',
      responseCount: 6,
      areas: SQUAD_HEALTH_TEMPLATE_V1.areas.map((area, index) => ({
        key: area.key,
        title: area.title,
        score: [5.8, 6.1, 5.4, 4.7, 5.2, 4.3, 5.6][index],
      })),
    });
  });

  it('lager eksakt, deterministisk prototype-CSV med semikolon og CRLF', () => {
    expect(createPrototypeReportCsv()).toBe([
      'Advarsel;Måledato;Områdenøkkel;Område;Poeng (av 7);Antall svar',
      'SYNTETISKE DEMODATA;2026-08-15;joy_energy;Arbeidsglede og energi;5,8;6',
      'SYNTETISKE DEMODATA;2026-08-15;people_safety;Menneskene og tryggheten;6,1;6',
      'SYNTETISKE DEMODATA;2026-08-15;direction_meaning;Oppgaver, retning og mening;5,4;6',
      'SYNTETISKE DEMODATA;2026-08-15;quality_technical_health;Kvalitet og teknisk helse;4,7;6',
      'SYNTETISKE DEMODATA;2026-08-15;squad_collaboration;Samarbeid i squaden;5,2;6',
      'SYNTETISKE DEMODATA;2026-08-15;organization_collaboration;Samarbeid med resten av organisasjonen;4,3;6',
      'SYNTETISKE DEMODATA;2026-08-15;learning_improvement;Læring og forbedring;5,6;6',
      '',
    ].join('\r\n'));
  });

  it.each([
    ['vanlig tekst', 'vanlig tekst'],
    ['tekst;med skilletegn', '"tekst;med skilletegn"'],
    ['tekst "med" sitat', '"tekst ""med"" sitat"'],
    ['to\nlinjer', '"to\nlinjer"'],
    ['=SUM(A1:A2)', "'=SUM(A1:A2)"],
    [' +cmd', "' +cmd"],
    ['\n=cmd', '"\'\n=cmd"'],
    ['-1+2', "'-1+2"],
    ['@mention', "'@mention"],
  ])('escaper prototype-CSV-tekst %j formel- og formattrygt', (value, expected) => {
    expect(escapePrototypeCsvText(value)).toBe(expected);
  });
});
