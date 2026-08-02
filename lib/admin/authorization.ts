import "server-only";
import type { NextRequest } from "next/server";
import { AdminRequestError } from "@/lib/admin/errors";
import { getAdminSession } from "@/lib/admin/session";
import type { AdminRole, AdminSession } from "@/lib/admin/types";

export type AdminPermission =
  | "operators:read"
  | "operators:manage"
  | "audit:read"
  | "admin:mutate";

const PERMISSIONS: Readonly<Record<AdminPermission, readonly AdminRole[]>> = {
  "operators:read": ["OWNER", "OPERATOR", "VIEWER"],
  "operators:manage": ["OWNER"],
  "audit:read": ["OWNER", "OPERATOR"],
  "admin:mutate": ["OWNER", "OPERATOR"],
};

const REAUTH_MAX_AGE_MS = 10 * 60 * 1000;

export async function requireAdminSession(
  request: NextRequest,
  permission?: AdminPermission,
  requireRecentReauthentication = false,
): Promise<AdminSession> {
  const session = await getAdminSession(request);
  if (!session) {
    throw new AdminRequestError(
      401,
      "ADMIN_AUTH_REQUIRED",
      "운영자 로그인이 필요합니다.",
    );
  }

  if (
    permission &&
    !PERMISSIONS[permission].includes(session.operator.role)
  ) {
    throw new AdminRequestError(
      403,
      "ADMIN_PERMISSION_DENIED",
      "이 작업을 수행할 권한이 없습니다.",
    );
  }

  if (
    requireRecentReauthentication &&
    Date.now() - new Date(session.reauthenticatedAt).getTime() >
      REAUTH_MAX_AGE_MS
  ) {
    throw new AdminRequestError(
      401,
      "ADMIN_REAUTH_REQUIRED",
      "중요 작업 전에 비밀번호를 다시 확인해주세요.",
    );
  }

  return session;
}
