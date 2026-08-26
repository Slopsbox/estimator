import { useReducer } from 'react';
import { createHealthCheckDraftState, healthCheckDraftReducer } from './healthCheckDraftReducer';

export function useHealthCheckDraft() {
  return useReducer(healthCheckDraftReducer, undefined, createHealthCheckDraftState);
}
