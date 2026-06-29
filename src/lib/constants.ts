import type { Size, Value } from './types';

export const SIZES: { key: Size; label: string }[] = [
  { key: 'xs', label: 'XS' },
  { key: 's', label: 'S' },
  { key: 'm', label: 'M' },
  { key: 'l', label: 'L' },
  { key: 'xl', label: 'XL' },
];

export const SIZE_DESCRIPTIONS: Record<Size, { time: string; description: string; example: string }> = {
  xs: {
    time: '~2 timer',
    description: 'Triviell, ingen avhengigheter',
    example: 'Endre spacing fra x til y',
  },
  s: {
    time: '~1 dag',
    description: 'Liten, minimale avhengigheter',
    example: 'Legge til betalingsinfo på pensjonsoppsummering',
  },
  m: {
    time: '2–3 dager',
    description: 'Noe kompleksitet, mulige avhengigheter',
    example: 'Fjerne steg i behandlingsforsikringsflyt + oppdatere navigasjon',
  },
  l: {
    time: '3–5 dager',
    description: 'Ukjente elementer, avhengigheter',
    example: 'Implementere prisberegning inkl. variabel G',
  },
  xl: {
    time: 'Flere uker',
    description: 'Stor, kompleks, splitt opp',
    example: 'Hente og vise bedriftskundes tilbud i tom handlekurv',
  },
};

export const VALUES: { key: Value; emoji: string; label: string; desc: string }[] = [
  { key: 'bronze', emoji: '🥉', label: 'Bronse', desc: 'Lav verdi' },
  { key: 'silver', emoji: '🥈', label: 'Sølv', desc: 'Middels' },
  { key: 'gold', emoji: '🥇', label: 'Gull', desc: 'Høy verdi' },
];

export const VALUE_DESCRIPTIONS: Record<Value, { description: string; priority: string }> = {
  gold: {
    description: 'Høy verdi, treffer OKR direkte.',
    priority: 'Prioriteres øverst.',
  },
  silver: {
    description: 'God verdi, mulig OKR-kobling.',
    priority: 'Viktig men ikke kritisk.',
  },
  bronze: {
    description: 'Nyttig sak, lav OKR-relevans.',
    priority: 'Tas når kapasitet tillater.',
  },
};

export const VALUE_MEDAL: Record<Value, string> = {
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
};

export const SIZE_ORDER: Record<Size, number> = { xs: 0, s: 1, m: 2, l: 3, xl: 4 };

export const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
