/**
 * Generer stabil initialbakgrunn basert på navn.
 * Bruker en deterministisk hash slik at samme navn alltid gir samme farge.
 */
export function avatarColor(name: string): string {
  const colors = [
    'oklch(0.56 0.14 165)',
    'oklch(0.56 0.17 35)',
    'oklch(0.55 0.15 270)',
    'oklch(0.55 0.16 50)',
    'oklch(0.54 0.14 320)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Hent initialer fra navn (maks 2 initialer, store bokstaver).
 */
export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
