// Local bridge into @swiftrx/shared. This keeps the existing src/* import
// paths stable (e.g. `import { MOCK_PATIENTS } from './shared-bridge'`) while
// delegating the actual data to the shared package.
export {
  MOCK_PATIENTS,
  MOCK_DRUGS,
  MOCK_DIAGNOSES,
  MOCK_INVESTIGATIONS,
  MOCK_QUICK_PACKS,
  MOCK_SIGNED_RX,
  MOCK_AUDIT,
  MOCK_HOSPITALS,
  MOCK_USERS,
  findDrug,
  getHospital,
  getUserById,
  getUserByEmail,
  listDoctorsForHospital,
  listPatientsForHospital,
  listSignedRxForHospital,
  listAuditForHospital,
  appendAudit,
  appendSignedRx,
} from '@swiftrx/shared';
