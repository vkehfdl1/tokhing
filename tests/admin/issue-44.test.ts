// @vitest-environment node
import{describe,expect,it}from"vitest";import{createLocalServiceClient}from"@/tests/helpers/local-supabase";describe("issue44",()=>{it("previews match correction",async()=>{const s=createLocalServiceClient();const r=await s.rpc("preview_match_correction",{p_game_id:901});expect(r.error).toBeNull();});});
