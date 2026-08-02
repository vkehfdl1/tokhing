// @vitest-environment node
import {describe,expect,it} from "vitest"; import {createLocalServiceClient} from "@/tests/helpers/local-supabase";
describe("issue #43 wallet recovery",()=>{it("exposes atomic adjustment RPC",async()=>{const s=createLocalServiceClient();const u=await s.from("users").select("id").limit(1).single();const r=await s.rpc("get_wallet_diagnostics",{p_user_id:u.data!.id,p_season_id:1});expect(r.error).toBeNull();});});
