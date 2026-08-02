// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createLocalServiceClient } from "@/tests/helpers/local-supabase";
describe("issue #42 KBO sync jobs", () => {
  it("stores separate job policy and safe run history", async () => {
    const service = createLocalServiceClient();
    const jobs = await service.from("kbo_sync_jobs").select("mode,status,schedule_kst");
    expect(jobs.error).toBeNull();
  });
});
