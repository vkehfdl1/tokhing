import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { createAdminServiceClient } from "@/lib/admin/service";
import {
  parseAdminSession,
  type AdminSession,
} from "@/lib/admin/types";

export const ADMIN_SESSION_COOKIE = "tokhin_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAdminSession(
  operatorId: string,
): Promise<Readonly<{ token: string; expiresAt: Date }>> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000);
  const { error } = await createAdminServiceClient()
    .from("admin_sessions")
    .insert({
      operator_id: operatorId,
      token_hash: hashToken(token),
      expires_at: expiresAt.toISOString(),
    });

  if (error) throw new Error(`관리자 세션 생성 실패: ${error.message}`);
  return { token, expiresAt };
}

export async function getAdminSession(
  request: NextRequest,
): Promise<AdminSession | null> {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const { data, error } = await createAdminServiceClient()
    .from("admin_sessions")
    .select(
      "id, operator_id, expires_at, reauthenticated_at, revoked_at, admin_operators!inner(id, username, display_name, role, is_active, must_change_password, last_login_at, created_at, updated_at)",
    )
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error || !data) return null;

  const session = parseAdminSession(data);
  if (
    data.revoked_at ||
    !session.operator.isActive ||
    new Date(session.expiresAt).getTime() <= Date.now()
  ) {
    return null;
  }

  return session;
}

export async function revokeAdminSession(sessionId: string): Promise<void> {
  const { error } = await createAdminServiceClient()
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) throw new Error(`관리자 세션 종료 실패: ${error.message}`);
}

export async function revokeOperatorSessions(
  operatorId: string,
  exceptSessionId?: string,
): Promise<void> {
  let query = createAdminServiceClient()
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("operator_id", operatorId)
    .is("revoked_at", null);

  if (exceptSessionId) query = query.neq("id", exceptSessionId);
  const { error } = await query;
  if (error) throw new Error(`운영자 세션 무효화 실패: ${error.message}`);
}

export async function markSessionReauthenticated(
  sessionId: string,
): Promise<void> {
  const { error } = await createAdminServiceClient()
    .from("admin_sessions")
    .update({ reauthenticated_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) throw new Error(`재인증 시간 갱신 실패: ${error.message}`);
}
