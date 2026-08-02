// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  createLocalServiceClient,
  LOCAL_FIXTURES,
} from "@/tests/helpers/local-supabase";

describe("deterministic local admin fixtures", () => {
  it("loads the seeded users, games, markets, and active season", async () => {
    const supabase = createLocalServiceClient();
    const [users, games, markets, activeSeason] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("games").select("*", { count: "exact", head: true }),
      supabase.from("markets").select("*", { count: "exact", head: true }),
      supabase
        .from("seasons")
        .select("id")
        .eq("status", "ACTIVE")
        .single(),
    ]);

    expect(users.error).toBeNull();
    expect(games.error).toBeNull();
    expect(markets.error).toBeNull();
    expect(activeSeason.error).toBeNull();
    expect(users.count).toBe(3);
    expect(games.count).toBe(5);
    expect(markets.count).toBe(5);
    expect(activeSeason.data?.id).toBe(LOCAL_FIXTURES.activeSeasonId);
  });
});
