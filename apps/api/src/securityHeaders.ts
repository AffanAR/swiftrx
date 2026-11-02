// =============================================================================
//  SwiftRx — Security headers
// =============================================================================
//  The headers the production server (scripts/serve.mjs) sends with the pages
//  and files, and the API (app.ts) sends with its JSON. One module, so the two
//  can't drift apart and the tests can check both.
//
//  The pages' Content-Security-Policy allows what the apps load, and nothing
//  else:
//    - scripts: the build's own files, and the inline script each index.html
//      runs before first paint to pick the theme. That one is allowed by its
//      SHA-256, which serve.mjs takes from the built index.html when it starts,
//      so an edit to the script can't leave a stale hash behind;
//    - styles: the build's CSS, Google Fonts' stylesheet, and inline styles.
//      Inline styles have to stay: the prescription print template
//      (apps/shared/src/print.ts) is an HTML string full of style="..."
//      attributes, and the Rx pad sets the paper size in a <style> element it
//      writes at print time. Inline CSS can't run code, and the only way it
//      could send anything out, url(), is held to this origin and Google
//      Fonts by img-src and font-src;
//    - fonts: Google Fonts' files;
//    - fetches: this origin only, where the API is (/api).
//  No plugins, no <base>, forms post to this origin only, and no other site
//  may show a page in a frame (clickjacking).
//
//  The Rx pad prints in the page itself (#print-area and window.print()), not
//  in a new window, so printing needs nothing more.
// =============================================================================

import { createHash } from 'node:crypto';

/**
 * Browsers use HTTPS for a year for the domain and every subdomain, once
 * they've seen this over HTTPS (they ignore it over plain HTTP, so it's safe
 * to send from a local server). No `preload`: that one is hard to take back.
 */
export const HSTS = 'max-age=31536000; includeSubDomains';

/** Sent with every response: pages, files and the API. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': HSTS,
  'X-Content-Type-Options': 'nosniff',
  // For browsers without CSP frame-ancestors. Nothing frames a SwiftRx page,
  // not even SwiftRx.
  'X-Frame-Options': 'DENY',
  // Full addresses stay on this origin; other sites (Google Fonts) get no
  // Referer, so they don't learn which hospital or page asked. Not
  // `no-referrer`: with it, browsers send `Origin: null` on same-origin
  // POSTs, and the API refuses those (app.ts, sameOrigin).
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  // A page another site opens can't reach back into it through window.opener.
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/** For anything that isn't an app page: JSON, plain text, a file opened on its own. */
export const NOTHING_CSP = "default-src 'none'; frame-ancestors 'none'";

const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';

/** The CSP for an app's index.html, allowing its inline scripts by hash. */
export function pageContentSecurityPolicy(indexHtml: string): string {
  const scripts = ["'self'", ...inlineScriptHashes(indexHtml).map((h) => `'${h}'`)];
  return [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_CSS}`,
    `font-src 'self' ${GOOGLE_FONTS_FILES}`,
    "img-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * `sha256-<base64>` for each inline <script> in the HTML, as a browser hashes
 * it: the exact text between the tags, as UTF-8. Scripts with a src are
 * covered by 'self' instead.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(attributes)) continue;
    hashes.push('sha256-' + createHash('sha256').update(body, 'utf8').digest('base64'));
  }
  return hashes;
}
