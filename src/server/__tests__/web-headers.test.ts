/**
 * @jest-environment node
 */
import { createHash } from 'node:crypto';
import path from 'node:path';

import appJson from '../../../app.json';

type RouterOptions = { sitemap?: boolean; headers?: Record<string, string> };

const routerOptions = (): RouterOptions => {
  const entry = appJson.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-router');
  return (Array.isArray(entry) ? entry[1] : {}) as RouterOptions;
};

/** The hydration script Expo Router inlines into every server-rendered page, from the installed Expo CLI. */
function hydrationScript(): string {
  const cli = path.dirname(require.resolve('@expo/cli/package.json', { paths: [require.resolve('expo/package.json')] }));
  const html = require.resolve('@expo/router-server/build/utils/html', { paths: [cli] });
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- resolved at run time
  return (require(html) as { getHydrationFlagScriptContents: () => string }).getHydrationFlagScriptContents();
}

describe('web security headers (app.json → expo-router plugin)', () => {
  const { headers = {}, sitemap } = routerOptions();
  const csp = headers['Content-Security-Policy'] ?? '';

  it('turns off the generated /_sitemap page', () => {
    expect(sitemap).toBe(false);
  });

  it('sets the hardening headers', () => {
    expect(headers).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  });

  it("allows Expo Router's inline hydration script by its current hash", () => {
    const hash = createHash('sha256').update(hydrationScript()).digest('base64');
    // If this fails after an Expo update, put the new hash into the CSP in app.json.
    expect(csp).toContain(`'sha256-${hash}'`);
  });
});
