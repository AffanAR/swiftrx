import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  HSTS,
  NOTHING_CSP,
  SECURITY_HEADERS,
  inlineScriptHashes,
  pageContentSecurityPolicy,
} from './securityHeaders';

/** The CSP as a map of directive → its sources. */
function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(';').map((d) => {
      const [name, ...sources] = d.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

const APPS = ['admin', 'doctor-portal'].map((app) => ({
  app,
  html: readFileSync(fileURLToPath(new URL(`../../${app}/index.html`, import.meta.url)), 'utf8'),
}));

describe('inlineScriptHashes', () => {
  it('hashes a script as browsers do: its exact text, SHA-256, base64', () => {
    // The worked example in the CSP specification (and MDN).
    expect(inlineScriptHashes("<script>alert('Hello, world.');</script>")).toEqual([
      'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng=',
    ]);
  });

  it('counts whitespace, and skips scripts loaded from a file', () => {
    const html = `
      <script type="module" crossorigin src="/assets/index-abc.js"></script>
      <script> a() </script>
      <SCRIPT type="module">b()</SCRIPT >`;
    const [spaced, upper] = inlineScriptHashes(html);
    expect(inlineScriptHashes(html)).toHaveLength(2);
    expect(spaced).not.toBe(inlineScriptHashes('<script>a()</script>')[0]);
    expect(upper).toBe(inlineScriptHashes('<script>b()</script>')[0]);
  });
});

describe('pageContentSecurityPolicy', () => {
  it.each(APPS)(
    "allows $app's inline theme script by hash, and no other inline code",
    ({ html }) => {
      const csp = directives(pageContentSecurityPolicy(html));
      const scripts = csp.get('script-src') ?? [];

      expect(scripts[0]).toBe("'self'");
      expect(scripts.slice(1)).toEqual(inlineScriptHashes(html).map((h) => `'${h}'`));
      expect(scripts).toHaveLength(2); // the theme script is the only inline one
      expect(scripts).not.toContain("'unsafe-inline'");
      expect(scripts).not.toContain("'unsafe-eval'");
    },
  );

  it.each(APPS)("loads $app's fonts and fetches only from where they are", ({ html }) => {
    const csp = directives(pageContentSecurityPolicy(html));

    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('style-src')).toEqual([
      "'self'",
      "'unsafe-inline'", // the print template's style attributes
      'https://fonts.googleapis.com',
    ]);
    expect(csp.get('font-src')).toEqual(["'self'", 'https://fonts.gstatic.com']);
    expect(csp.get('img-src')).toEqual(["'self'"]);
    expect(csp.get('connect-src')).toEqual(["'self'"]);
    // And every stylesheet the page links to is one the policy allows.
    for (const [, href] of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) {
      expect(href.startsWith('https://fonts.googleapis.com/') || href.startsWith('/')).toBe(true);
    }
  });

  it('refuses plugins, <base>, forms to other sites and every frame', () => {
    const csp = directives(pageContentSecurityPolicy(''));

    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'none'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('script-src')).toEqual(["'self'"]);
  });
});

describe('SECURITY_HEADERS', () => {
  it('keeps browsers on HTTPS for a year, subdomains included', () => {
    expect(SECURITY_HEADERS['Strict-Transport-Security']).toBe(HSTS);
    const maxAge = Number(/max-age=(\d+)/.exec(HSTS)?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(HSTS).toContain('includeSubDomains');
  });

  it('refuses framing and keeps the Origin header on same-origin writes', () => {
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    // `no-referrer` would make browsers send `Origin: null` on the apps' own
    // POSTs, which the API refuses as cross-origin.
    expect(SECURITY_HEADERS['Referrer-Policy']).toBe('same-origin');
  });

  it("gives everything that isn't a page a policy that allows nothing", () => {
    expect(directives(NOTHING_CSP)).toEqual(
      new Map([
        ['default-src', ["'none'"]],
        ['frame-ancestors', ["'none'"]],
      ]),
    );
  });
});
