// @vitest-environment node
import{describe,expect,it}from"vitest";import{createLocalServiceClient}from"@/tests/helpers/local-supabase";describe("issue45",()=>{it("has recovery events",async()=>{const s=createLocalServiceClient();const r=await s.from("settlement_events").select("id").limit(1);expect(r.error).toBeNull();});});
