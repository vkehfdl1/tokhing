// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createLocalServiceClient } from "@/tests/helpers/local-supabase";

describe("issue #38 team master data", () => {
  it("stores aliases, pending mappings, and merge state", async () => {
    const service = createLocalServiceClient();
    const [teams, aliases, pending] = await Promise.all([
      service.from("teams").select("id, is_active, merged_into_team_id").limit(1),
      service.from("team_aliases").select("id, source, alias, team_id").limit(1),
      service
        .from("team_mapping_requests")
        .select("id, source, external_name, status")
        .limit(1),
    ]);

    expect(teams.error).toBeNull();
    expect(aliases.error).toBeNull();
    expect(pending.error).toBeNull();
  });
});
