import type { Database } from '../../lib/database.types';

type PublicFunctions = Database['public']['Functions'];

export interface RpcClient {
  rpc<Name extends keyof PublicFunctions>(
    name: Name,
    args: PublicFunctions[Name]['Args'],
  ): Promise<{ data: PublicFunctions[Name]['Returns'] | null; error: unknown }>;
}
