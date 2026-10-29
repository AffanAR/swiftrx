// One-off migration, already run: it moved the seed rows out of mockDb.ts
// into apps/shared/src/seed/*.json. The JSON is the source of truth now, so
// edit it directly. Don't rerun this: it rewrites the JSON from what the
// loader produces, which drops any patient or signed-Rx field it doesn't list
// below (such as safetyOverride) and can shift patient dates by up to half a
// day. Safe to delete.
//
//   It was run as: npx vite-node scripts/gen-seed.mjs
//
// Why JSON and not a straight copy:
//   - MOCK_PATIENTS createdAt values were relative ("120 days ago"), so they
//     are stored as day offsets that the loader rebases from
//     seed/manifest.json's `seededAt`.
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
