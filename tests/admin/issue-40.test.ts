// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createLocalServiceClient } from "@/tests/helpers/local-supabase";

describe("issue #40 season close readiness", () => {
  it("classifies every blocking market for governed bulk processing", async () => {
    const service = createLocalServiceClient();
    const readiness = await service.rpc("get_season_close_readiness", {
      p_season_id: 1,
      p_page: 1,
      p_page_size: 20,
    });

    expect(readiness.error).toBeNull();
    expect(readiness.data).toBeTruthy();
  });
});
