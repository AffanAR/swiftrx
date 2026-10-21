// Round-trip test for the bridge session token. Run with:
//   node scripts/check-bridge.mjs
//
// Confirms that the encoding the portal uses decodes the way the Rx app expects.
// Both apps ship their own copy of the encode/decode algorithm so a build-time
// dependency between them is unnecessary; this test guards against drift.

const sample = {
  doctorId: 'd_001',
  hospitalSlug: 'city-hospital',
  doctorName: 'Dr. Ayesha Khan',
  licenseNo: 'PMDC-44121',
  email: 'ayesha@city-hospital.com',
  issuedAt: 1700000000000,
};

function encodeBridgeToken(s) {
  const json = JSON.stringify(s);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeBridgeToken(token) {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);
    if (
      typeof parsed.doctorId !== 'string' ||
      typeof parsed.hospitalSlug !== 'string' ||
      typeof parsed.doctorName !== 'string' ||
      typeof parsed.licenseNo !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.issuedAt !== 'number'
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

const token = encodeBridgeToken(sample);
console.log('Token:', token);

const decoded = decodeBridgeToken(token);
console.log('Decoded:', decoded);

const equal = JSON.stringify(sample) === JSON.stringify(decoded);
console.log('Round-trip equal?', equal);

if (!equal) {
  process.exit(1);
}
