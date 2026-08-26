import { describe, expect, it, vi } from 'vitest';

describe('HealthCheckPreview module isolation', () => {
  it('imports without touching network, storage or the session layer', async () => {
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const storageSpies = [
      vi.spyOn(Storage.prototype, 'getItem'),
      vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(Storage.prototype, 'removeItem'),
      vi.spyOn(Storage.prototype, 'clear'),
    ];
    const sessionModuleSpy = vi.fn();
    vi.doMock('../../hooks/SessionProvider', () => {
      sessionModuleSpy();
      throw new Error('Preview imported the session layer');
    });

    try {
      const preview = await import('../../pages/HealthCheckPreview');
      expect(preview.HealthCheckPreviewPage).toBeTypeOf('function');
      expect(sessionModuleSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      storageSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    } finally {
      vi.doUnmock('../../hooks/SessionProvider');
      vi.restoreAllMocks();
    }
  });
});
