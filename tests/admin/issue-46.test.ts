// @vitest-environment node
import{describe,expect,it}from"vitest";import{createLocalServiceClient}from"@/tests/helpers/local-supabase";describe("issue46",()=>{it("supports season scoped pagination",async()=>{const s=createLocalServiceClient();const r=await s.from("wallets").select("id").eq("season_id",1).range(0,19);expect(r.error).toBeNull();});});
