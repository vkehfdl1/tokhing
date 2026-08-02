// @vitest-environment node
import{describe,expect,it}from"vitest";import{createLocalServiceClient}from"@/tests/helpers/local-supabase";describe("issue47",()=>{it("diagnoses season incident",async()=>{const s=createLocalServiceClient();const r=await s.rpc("preview_season_incident",{p_season_id:1});expect(r.error).toBeNull();});});
