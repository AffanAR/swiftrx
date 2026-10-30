import { createQueryClient } from '@swiftrx/shared';

/**
 * The portal's query cache. main.tsx provides it to React; the Rx store, which
 * writes outside React, uses it to refetch what a signed Rx or a new patient
 * changed.
 */
export const queryClient = createQueryClient();
