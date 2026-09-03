import { useEffect, useReducer } from 'react';
import { createHealthCheckDraftState, healthCheckDraftReducer } from './healthCheckDraftReducer';
import { readHealthCheckDraft, writeHealthCheckDraft } from '../storage/healthCheckStorage';

export function useHealthCheckDraft(draftKey?: string) {
  const reducer = useReducer(
    healthCheckDraftReducer,
    undefined,
    () => draftKey ? readHealthCheckDraft(draftKey) ?? createHealthCheckDraftState() : createHealthCheckDraftState(),
  );
  const [state] = reducer;

  useEffect(() => {
    if (draftKey) writeHealthCheckDraft(draftKey, state);
  }, [draftKey, state]);

  return reducer;
}
