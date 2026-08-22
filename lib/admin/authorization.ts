import "server-only";
import type { NextRequest } from "next/server";
import { AdminRequestError } from "@/lib/admin/errors";
import {
  canUseAdminPermission,
  type AdminPermission,
} from "@/lib/admin/permissions";
import { getAdminSession } from "@/lib/admin/session";
import type { AdminSession } from "@/lib/admin/types";

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

  if (permission) {
    if (
      !canUseAdminPermission(
        session.operator.role,
        session.operator.mustChangePassword,
        permission,
      )
    ) {
      const passwordChangeRequired =
        session.operator.mustChangePassword &&
        permission !== "password:change";
      throw new AdminRequestError(
        403,
        passwordChangeRequired
          ? "ADMIN_PASSWORD_CHANGE_REQUIRED"
          : "ADMIN_PERMISSION_DENIED",
        passwordChangeRequired
          ? "임시 비밀번호를 먼저 변경해야 합니다."
          : "이 작업을 수행할 권한이 없습니다.",
      );
    }
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
