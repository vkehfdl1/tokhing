// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createLocalServiceClient } from "@/tests/helpers/local-supabase";

describe("issue #41 weekly grant policy", () => {
  it("exposes policy, schedule preview, and run history", async () => {
    const service = createLocalServiceClient();
    const status = await service.rpc("get_weekly_grant_status");

    expect(status.error).toBeNull();
    expect(status.data).toMatchObject({
      amount: 300,
      weekday: 1,
      grant_time: "00:00",
      expected_recipient_count: 3,
      estimated_total_payout: 900,
    });
  });
});
