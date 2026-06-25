import type { Size, Value } from './types';

export const SIZES: { key: Size; label: string }[] = [
  { key: 'xs', label: 'XS' },
  { key: 's', label: 'S' },
  { key: 'm', label: 'M' },
  { key: 'l', label: 'L' },
  { key: 'xl', label: 'XL' },
];

export const VALUES: { key: Value; emoji: string; label: string; desc: string }[] = [
  { key: 'bronze', emoji: '🥉', label: 'Bronse', desc: 'Lav verdi' },
  { key: 'silver', emoji: '🥈', label: 'Sølv', desc: 'Middels' },
  { key: 'gold', emoji: '🥇', label: 'Gull', desc: 'Høy verdi' },
];

export const VALUE_MEDAL: Record<Value, string> = {
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
};

export const SIZE_ORDER: Record<Size, number> = { xs: 0, s: 1, m: 2, l: 3, xl: 4 };

export const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
