import { describe, expect, it } from "vitest";
import localSupabase from "@/scripts/local-supabase-env.mjs";

const { loadLocalSupabaseEnv } = localSupabase;
describe("local Supabase environment guard", () => {
  it("loads loopback API and database URLs", () => {
    const env = loadLocalSupabaseEnv();

    expect(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname).toBe("127.0.0.1");
    expect(new URL(env.SUPABASE_DB_URL).hostname).toBe("127.0.0.1");
    expect(env.SUPABASE_LOCAL_ONLY).toBe("1");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy();
  });
});
