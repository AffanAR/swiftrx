// One-off generator: dumps the seed data from mockDb.ts into JSON files.
// Not part of the app or the test suite — run it by hand after editing the
// seed data, then delete it.
//
//   npx vite-node scripts/gen-seed.mjs
//
// Why JSON and not a straight copy:
//   - MOCK_PATIENTS createdAt values are relative ("120 days ago"). The loader
//     rebases those offsets from seed/manifest.json's `seededAt`, so a JSON
//     round-trip stays relative instead of freezing absolute dates.
//   - Signed Rx embed full patient + diagnosis objects. JSON stores ids and the
//     loader resolves them, so the two lists cannot drift apart.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'apps/shared/src/seed');

const db = await import('../apps/shared/src/mockDb.ts');

const NOW = Date.now();
const DAY = 86400000;

function daysAgo(iso) {
  return Math.round((NOW - new Date(iso).getTime()) / DAY);
}

function write(name, value) {
  writeFileSync(join(OUT, name + '.json'), JSON.stringify(value, null, 2) + '\n', 'utf8');
  console.log('wrote ' + name + '.json');
}

mkdirSync(OUT, { recursive: true });

write(
  'patients',
  db.MOCK_PATIENTS.map(function (p) {
    return {
      id: p.id,
      hospitalSlug: p.hospitalSlug,
      name: p.name,
      age: p.age,
      sex: p.sex,
      weightKg: p.weightKg,
      contact: p.contact,
      allergies: p.allergies,
      activeProblems: p.activeProblems,
      activeMedications: p.activeMedications,
      recentVitals: p.recentVitals,
      createdAtDaysAgo: daysAgo(p.createdAt),
    };
  }),
);

// Store the reference, not a copy of the patient/diagnosis object.
write(
  'signedRx',
  db.MOCK_SIGNED_RX.map(function (rx) {
    return {
      id: rx.id,
      signedAt: rx.signedAt,
      hospitalSlug: rx.hospitalSlug,
      patientId: rx.patient.id,
      diagnosisCode: rx.diagnosis.code,
      medications: rx.medications,
      investigations: rx.investigations,
      doctorId: rx.doctorId,
      doctorName: rx.doctorName,
      doctorLicense: rx.doctorLicense,
    };
  }),
);

write('hospitals', db.MOCK_HOSPITALS);
write('users', db.MOCK_USERS);
write('drugs', db.MOCK_DRUGS);
write('diagnoses', db.MOCK_DIAGNOSES);
write('investigations', db.MOCK_INVESTIGATIONS);
write('quickPacks', db.MOCK_QUICK_PACKS);
write('audit', db.MOCK_AUDIT);

write('manifest', {
  seededAt: new Date(NOW).toISOString(),
  note: 'patient createdAtDaysAgo is rebased from seededAt when the loader runs',
});
