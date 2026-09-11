import { createEstimationService } from '../domains/estimation/services/estimationService';
import { createHealthCheckService } from '../domains/health-check/services/healthCheckService';
import type { HealthCheckRpcPort } from '../domains/health-check/services/types';
import {
  clearCreateRequestId,
  clearSessionPointer,
  getOrCreateCreateRequestId,
  readSessionPointer,
  writeLastUsedName,
  writeSessionPointer,
} from '../lib/localStorage';
import { ensureAnonymousIdentity, rpcWithAuthRecovery, supabase } from '../lib/supabase';
import type { RpcClient } from '../platform/supabase/rpcClient';
import { createRoomMembershipService } from '../rooms/services/roomMembershipService';

const rpc: RpcClient = {
  rpc: async (name, args) => {
    const result = await rpcWithAuthRecovery(name, args);
    return { data: result.data, error: result.error };
  },
};

const healthRpc: HealthCheckRpcPort = {
  rpc: async (name, args) => {
    const result = await rpcWithAuthRecovery(name, args);
    return {
      data: result.data,
      error: result.error ? { code: result.error.code } : null,
    };
  },
};

const storage = {
  readSessionPointer,
  writeSessionPointer,
  clearSessionPointer,
  getOrCreateCreateRequestId,
  clearCreateRequestId,
  writeLastUsedName,
};

export const sessionServices = {
  roomMembership: createRoomMembershipService({ rpc, ensureIdentity: ensureAnonymousIdentity, storage }),
  estimation: createEstimationService({ rpc, ensureIdentity: ensureAnonymousIdentity }),
  health: createHealthCheckService({ rpc: healthRpc, ensureIdentity: ensureAnonymousIdentity }),
  storage,
  realtime: supabase,
};
