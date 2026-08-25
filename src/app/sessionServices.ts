import { createEstimationService } from '../domains/estimation/services/estimationService';
import {
  clearCreateRequestId,
  clearSessionPointer,
  getOrCreateCreateRequestId,
  readSessionPointer,
  writeLastUsedName,
  writeSessionPointer,
} from '../lib/localStorage';
import { ensureAnonymousIdentity, supabase } from '../lib/supabase';
import type { RpcClient } from '../platform/supabase/rpcClient';
import { createRoomMembershipService } from '../rooms/services/roomMembershipService';

const rpc: RpcClient = {
  rpc: async (name, args) => {
    const result = await supabase.rpc(name, args);
    return { data: result.data, error: result.error };
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
  storage,
  realtime: supabase,
};
