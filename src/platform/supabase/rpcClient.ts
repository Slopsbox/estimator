import type { Database } from '../../lib/database.types';

type PublicFunctions = Database['public']['Functions'];

export function isExpiredJwtError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'PGRST303';
}

export interface RpcClient {
  rpc<Name extends keyof PublicFunctions>(
    name: Name,
    args: PublicFunctions[Name]['Args'],
  ): Promise<{ data: PublicFunctions[Name]['Returns'] | null; error: unknown }>;
}
