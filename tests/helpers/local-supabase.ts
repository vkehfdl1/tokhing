import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import localSupabase from "@/scripts/local-supabase-env.cjs";

const { loadLocalSupabaseEnv } = localSupabase;

export const LOCAL_FIXTURES = {
  users: {
    first: "a1111111-1111-1111-1111-111111111111",
    second: "a2222222-2222-2222-2222-222222222222",
    third: "a3333333-3333-3333-3333-333333333333",
  },
  games: {
    scheduled: 901,
    finished: 904,
    canceled: 905,
  },
  activeSeasonId: 1,
} as const;

export function createLocalServiceClient(): SupabaseClient {
  const env = loadLocalSupabaseEnv();

  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        storageKey: "tokhin-local-service",
      },
    },
  );
}

export function resetLocalDatabase(): void {
  execFileSync("supabase", ["db", "reset", "--local"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}
