// Thin re-export from @swiftrx/shared so the Rx pad can keep using its old
// import paths (`import { DRUGS } from '../data'`). The single source of
// truth lives in apps/shared/src/mockDb.ts.
export {
  MOCK_DRUGS as DRUGS,
  MOCK_DIAGNOSES as DIAGNOSES,
  MOCK_INVESTIGATIONS as INVESTIGATIONS,
  MOCK_QUICK_PACKS as QUICK_PACKS,
  MOCK_PATIENTS as PATIENTS,
} from '@swiftrx/shared';
