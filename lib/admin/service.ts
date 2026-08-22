import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createAdminServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("관리자 서버용 Supabase 환경변수가 없습니다.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      storageKey: "tokhin-admin-service",
    },
  });
}
