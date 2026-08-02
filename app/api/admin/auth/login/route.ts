import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordAdminAudit } from "@/lib/admin/audit";
import { adminErrorResponse, AdminRequestError } from "@/lib/admin/errors";
import { verifyAdminPassword } from "@/lib/admin/password";
import { createAdminServiceClient } from "@/lib/admin/service";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSession,
} from "@/lib/admin/session";
import { parseAdminOperator } from "@/lib/admin/types";

const LoginSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(50),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let operatorId: string | null = null;

  try {
    const input = LoginSchema.parse(await request.json());
    const service = createAdminServiceClient();
    const { data, error } = await service
      .from("admin_operators")
      .select(
        "id, username, display_name, role, password_hash, is_active, must_change_password, last_login_at, created_at, updated_at",
      )
      .eq("username", input.username)
      .maybeSingle();

    operatorId = data?.id ?? null;
    if (
      error ||
      !data ||
      !data.is_active ||
      !(await verifyAdminPassword(input.password, data.password_hash))
    ) {
      throw new AdminRequestError(
        401,
        "ADMIN_LOGIN_FAILED",
        "아이디 또는 비밀번호를 확인해주세요.",
      );
    }

    const operator = parseAdminOperator(data);
    const session = await createAdminSession(operator.id);
    const { error: loginUpdateError } = await service
      .from("admin_operators")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", operator.id);
    if (loginUpdateError) throw loginUpdateError;

    await recordAdminAudit(request, {
      operatorId: operator.id,
      action: "ADMIN_LOGIN",
      targetType: "admin_operator",
      targetId: operator.id,
      success: true,
    });

    const response = NextResponse.json({ operator });
    response.cookies.set(ADMIN_SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    try {
      await recordAdminAudit(request, {
        operatorId,
        action: "ADMIN_LOGIN",
        targetType: "admin_operator",
        targetId: operatorId ?? undefined,
        success: false,
        errorMessage: error instanceof Error ? error.message : "로그인 실패",
      });
    } catch (auditError) {
      console.error("관리자 로그인 실패 감사 로그 저장 오류", auditError);
    }
    return adminErrorResponse(error);
  }
}
