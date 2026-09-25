import { describe, expect, it } from 'vitest';
import vercelConfig from '../../vercel.json';

describe('PWA-konfigurasjon', () => {
  it('bruker prompt-oppdatering, komplett first-party precache og ingen bred JS-runtime-cache', async () => {
    const source = await import('../../vite.config.ts?raw').then((module) => module.default);

    expect(source).toContain("registerType: 'prompt'");
    expect(source).toContain("lang: 'nb'");
    expect(source).toContain("'**/*.{js,css,html,ico,png,svg,woff,woff2}'");
    expect(source).not.toContain("urlPattern: /\\.js$/");
    expect(source).not.toContain('skipWaiting: true');
    expect(source).not.toContain('clientsClaim: true');
  });

  it('setter eksplisitte cache-headere for skallfiler og immutable Vite-assets', () => {
    const headers = vercelConfig.headers ?? [];
    const serializedHeaders = JSON.stringify(headers);

    expect(serializedHeaders).toContain('sw.js');
    expect(serializedHeaders).toContain('manifest.webmanifest');
    expect(serializedHeaders).toContain('registerSW.js');
    expect(serializedHeaders).toContain('no-cache');
    expect(serializedHeaders).toContain('immutable');
  });
});
