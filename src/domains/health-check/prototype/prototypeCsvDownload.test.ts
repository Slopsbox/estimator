import { describe, expect, it, vi } from 'vitest';
import { downloadPrototypeCsv, PROTOTYPE_CSV_FILENAME } from './prototypeCsvDownload';

function dependencies() {
  const anchor = {
    href: '',
    download: '',
    rel: '',
    hidden: false,
    click: vi.fn(),
    remove: vi.fn(),
  };
  const scheduled: Array<() => void> = [];
  const revokeObjectURL = vi.fn();
  return {
    anchor,
    scheduled,
    revokeObjectURL,
    value: {
      createBlob: vi.fn((text: string, mediaType: string) => new Blob([text], { type: mediaType })),
      createObjectURL: vi.fn(() => 'blob:prototype'),
      revokeObjectURL,
      createAnchor: vi.fn(() => anchor),
      appendAnchor: vi.fn(),
      scheduleCleanup: vi.fn((cleanup: () => void) => scheduled.push(cleanup)),
    },
  };
}

describe('downloadPrototypeCsv', () => {
  it('starter lokal nedlasting og rydder URL i planlagt callback', () => {
    const harness = dependencies();

    expect(downloadPrototypeCsv('demo', harness.value)).toBe(true);
    expect(harness.anchor).toMatchObject({
      href: 'blob:prototype',
      download: PROTOTYPE_CSV_FILENAME,
      rel: 'noopener',
      hidden: true,
    });
    expect(harness.anchor.click).toHaveBeenCalledOnce();
    expect(harness.anchor.remove).toHaveBeenCalledOnce();
    expect(harness.revokeObjectURL).not.toHaveBeenCalled();

    harness.scheduled[0]?.();
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:prototype');
  });

  it.each(['createObjectURL', 'appendAnchor', 'click'] as const)(
    'feiler lukket og rydder midlertidige ressurser når %s feiler',
    (operation) => {
      const harness = dependencies();
      if (operation === 'click') harness.anchor.click.mockImplementation(() => { throw new Error('blocked'); });
      else harness.value[operation].mockImplementation(() => { throw new Error('blocked'); });

      expect(downloadPrototypeCsv('demo', harness.value)).toBe(false);
      expect(harness.anchor.remove).toHaveBeenCalledTimes(operation === 'createObjectURL' ? 0 : 1);
      expect(harness.revokeObjectURL).toHaveBeenCalledTimes(operation === 'createObjectURL' ? 0 : 1);
      expect(harness.value.scheduleCleanup).not.toHaveBeenCalled();
    },
  );

  it('beholder vellykket resultat når planlegging av opprydding feiler', () => {
    const harness = dependencies();
    harness.value.scheduleCleanup.mockImplementation(() => { throw new Error('scheduler unavailable'); });

    expect(downloadPrototypeCsv('demo', harness.value)).toBe(true);
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:prototype');
  });
});
