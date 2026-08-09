// @vitest-environment node

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import localSupabase from "@/scripts/local-supabase-env.mjs";
import { createLocalServiceClient } from "@/tests/helpers/local-supabase";

const { loadLocalSupabaseEnv } = localSupabase;

describe("issue #36 server authorization boundary", () => {
  it("stores operators and audit logs outside anon access", async () => {
    const env = loadLocalSupabaseEnv();
    const service = createLocalServiceClient();
    const anon = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          storageKey: "tokhin-local-anon",
        },
      },
    );

    const [operators, auditLogs, anonActivation] = await Promise.all([
      service
        .from("admin_operators")
        .select("id, username, role, is_active")
        .limit(1),
      service.from("admin_audit_logs").select("id, action").limit(1),
      anon.rpc("activate_season", { p_season_id: 999_999 }),
    ]);

    expect(operators.error).toBeNull();
    expect(auditLogs.error).toBeNull();
    expect(anonActivation.error?.code).toBe("42501");
  });
});
