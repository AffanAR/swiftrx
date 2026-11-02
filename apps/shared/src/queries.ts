// =============================================================================
//  SwiftRx Shared — Query hooks
// =============================================================================
//  TanStack Query on top of the data client (api.ts). Pages read through the
//  `use…` hooks below, which suspend until their data is there, so a page's
//  data is always defined; <PageBoundary> (status.tsx) shows the loading and
//  error states. Writes go through the mutation hooks, which refetch whatever
//  the write may have changed.
//
//  Query keys nest under a few roots ('hospitals', 'prescriptions', 'audit',
//  'users', 'catalog'), so invalidating a root refetches everything under it.
// =============================================================================

import {
  QueryClient,
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { ApiError, api, type DoctorInvite, type NewHospital, type NewPatient } from './api';
import type { Hospital, HospitalFeatures, RxDesign, User } from './types';

/** Doctors, patients and signed Rx per hospital, for the admin's hospital list. */
export interface HospitalStats {
  doctors: number;
  patients: number;
  prescriptions: number;
}

export const queries = {
  hospitals: () =>
    queryOptions({ queryKey: ['hospitals', 'list'], queryFn: () => api.hospitals.list() }),
  hospital: (slug: string) =>
    queryOptions({
      queryKey: ['hospitals', 'detail', slug],
      queryFn: () => api.hospitals.get(slug),
    }),
  /** What a portal's sign-in page shows; needs no session. */
  hospitalProfile: (slug: string) =>
    queryOptions({
      queryKey: ['hospitals', 'profile', slug],
      queryFn: () => api.hospitals.profile(slug),
    }),
  doctors: (slug: string) =>
    queryOptions({
      queryKey: ['hospitals', 'detail', slug, 'doctors'],
      queryFn: () => api.users.listDoctors(slug),
    }),
  patients: (slug: string) =>
    queryOptions({
      queryKey: ['hospitals', 'detail', slug, 'patients'],
      queryFn: () => api.patients.list(slug),
    }),
  /** Counts per hospital slug. Built from the lists until the API has a stats endpoint. */
  hospitalStats: () =>
    queryOptions({
      queryKey: ['hospitals', 'stats'],
      queryFn: async (): Promise<Record<string, HospitalStats>> => {
        const hospitals = await api.hospitals.list();
        const [users, rx, rosters] = await Promise.all([
          api.users.list(),
          api.prescriptions.list(),
          Promise.all(hospitals.map((h) => api.patients.list(h.slug))),
        ]);
        return Object.fromEntries(
          hospitals.map((h, i) => [
            h.slug,
            {
              doctors: users.filter((u) => u.role === 'doctor' && u.hospitalSlug === h.slug).length,
              patients: rosters[i].length,
              prescriptions: rx.filter((r) => r.hospitalSlug === h.slug).length,
            },
          ]),
        );
      },
    }),
  users: () => queryOptions({ queryKey: ['users'], queryFn: () => api.users.list() }),
  /** One hospital's signed Rx, or every hospital's when `slug` is left out. */
  prescriptions: (slug?: string) =>
    queryOptions({
      queryKey: slug ? ['prescriptions', slug] : ['prescriptions', 'all'],
      queryFn: () => api.prescriptions.list(slug),
    }),
  /** One hospital's audit events, or every event when `slug` is left out. */
  audit: (slug?: string) =>
    queryOptions({
      queryKey: slug ? ['audit', slug] : ['audit', 'all'],
      queryFn: () => api.audit.list(slug),
    }),
  catalog: () =>
    queryOptions({
      queryKey: ['catalog'],
      queryFn: () => api.catalog.get(),
      // Drugs and diagnoses don't change while the app is open.
      staleTime: Infinity,
    }),
};

export const useHospitals = () => useSuspenseQuery(queries.hospitals()).data;
export const useHospital = (slug: string) => useSuspenseQuery(queries.hospital(slug)).data;
export const useHospitalProfile = (slug: string) =>
  useSuspenseQuery(queries.hospitalProfile(slug)).data;
export const useDoctors = (slug: string): User[] => useSuspenseQuery(queries.doctors(slug)).data;
export const usePatients = (slug: string) => useSuspenseQuery(queries.patients(slug)).data;
export const useHospitalStats = () => useSuspenseQuery(queries.hospitalStats()).data;
export const useUsers = () => useSuspenseQuery(queries.users()).data;
export const usePrescriptions = (slug?: string) =>
  useSuspenseQuery(queries.prescriptions(slug)).data;
export const useAudit = (slug?: string) => useSuspenseQuery(queries.audit(slug)).data;

// --- Writes -------------------------------------------------------------------

/**
 * What to refetch after each kind of write. Broad on purpose: refetching the
 * mock is free, and once there's a real API these can be narrowed. The Rx
 * store calls these directly, since it writes outside React.
 */
export const afterWrite = {
  hospitalCreated: (qc: QueryClient) => refetch(qc, ['hospitals'], ['audit']),
  hospitalUpdated: (qc: QueryClient) => refetch(qc, ['hospitals']),
  // Patients live under 'hospitals', and the admin's stats count them.
  patientCreated: (qc: QueryClient) => refetch(qc, ['hospitals'], ['audit']),
  // Signing bumps the hospital's monthly usage and the stats as well.
  rxSigned: (qc: QueryClient) => refetch(qc, ['prescriptions'], ['hospitals'], ['audit']),
};

export function useCreateHospital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hospital: NewHospital) => api.hospitals.create(hospital),
    onSuccess: () => afterWrite.hospitalCreated(qc),
  });
}

/** The platform admin suspends or reactivates a hospital. */
export function useSetHospitalStatus(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: Hospital['status']) => api.hospitals.setStatus(slug, status),
    onSuccess: (hospital) => {
      qc.setQueryData(queries.hospital(hospital.slug).queryKey, hospital);
      return refetch(qc, ['hospitals'], ['audit']);
    },
  });
}

export function useUpdateHospitalSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { slug: string; features: HospitalFeatures; rxDesign: RxDesign }) =>
      api.hospitals.updateSettings(v.slug, { features: v.features, rxDesign: v.rxDesign }),
    onSuccess: (hospital) => {
      // Show the saved values straight away, before the refetch lands.
      qc.setQueryData(queries.hospital(hospital.slug).queryKey, hospital);
      return afterWrite.hospitalUpdated(qc);
    },
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patient: NewPatient) => api.patients.create(patient),
    onSuccess: () => afterWrite.patientCreated(qc),
  });
}

/** The query client each app creates once and provides at its root. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data only changes through this tab's own writes, and those refetch
        // what they touch, so a cached read can be reused for a while.
        staleTime: 30_000,
        // Retry what might be a network blip, never a 4xx: a missing hospital
        // or a refused write won't succeed on the next try.
        retry: (failures, error) =>
          !(error instanceof ApiError && error.status < 500) && failures < 2,
      },
    },
  });
}

// --- internals ---------------------------------------------------------------

function refetch(qc: QueryClient, ...keys: string[][]) {
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/** A hospital admin invites a doctor; the roster and the audit log refetch. */
export function useInviteDoctor(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invite: DoctorInvite) => api.users.invite(invite),
    onSuccess: () => refetch(qc, [...queries.doctors(slug).queryKey], ['audit']),
  });
}

/** The platform admin invites a hospital's admin. */
export function useInviteHospitalAdmin(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; name: string }) =>
      api.users.inviteHospitalAdmin(slug, input),
    onSuccess: () => refetch(qc, ['audit']),
  });
}

/** A new password link for one of the admin's hospital's users. */
export function usePasswordLink() {
  return useMutation({ mutationFn: (userId: string) => api.users.passwordLink(userId) });
}
