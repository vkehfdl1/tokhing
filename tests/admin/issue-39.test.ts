// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createLocalServiceClient } from "@/tests/helpers/local-supabase";

describe("issue #39 draft season policies", () => {
  it("stores configurable initial grants and governed draft operations", async () => {
    const service = createLocalServiceClient();
    const seasons = await service
      .from("seasons")
      .select("id, status, initial_grant_amount")
      .limit(1);
    const updateRpc = await service.rpc("admin_update_draft_season", {
      p_operator_id: null,
      p_season_id: 2,
      p_name: "Season 2",
      p_start_date: "2026-05-19",
      p_end_date: "2026-06-21",
      p_initial_grant_amount: 1000,
    });

    expect(seasons.error).toBeNull();
    expect(updateRpc.error).toBeNull();
  });
});
