import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRequestContext } from "@/lib/admin/audit";
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
  let attemptId: number | null = null;
  const service = createAdminServiceClient();

  try {
    const input = LoginSchema.parse(await request.json());
    const context = getAdminRequestContext(request);
    const rateIdentity = `${input.username}@${context.ipAddress ?? "unknown"}`;
    const { data: attemptData, error: attemptError } = await service.rpc(
      "admin_begin_login_attempt",
      {
        p_identity: rateIdentity,
        p_username: input.username,
        p_ip_address: context.ipAddress,
        p_user_agent: context.userAgent,
      },
    );
    if (attemptError) throw attemptError;
    const attempt = attemptData as Readonly<{
      allowed: boolean;
      retryAfterSeconds: number;
      attemptId?: number;
    }>;
    if (!attempt.allowed) {
      throw new AdminRequestError(
        429,
        "ADMIN_LOGIN_RATE_LIMITED",
        `${attempt.retryAfterSeconds}초 후 다시 시도해주세요.`,
      );
    }
    if (!attempt.attemptId) {
      throw new Error("로그인 시도 식별자를 발급하지 못했습니다.");
    }
    attemptId = attempt.attemptId;

    const { data, error } = await service
      .from("admin_operators")
      .select(
        "id, username, display_name, role, password_hash, is_active, must_change_password, last_login_at, created_at, updated_at",
      )
      .eq("username", input.username)
      .maybeSingle();

    if (
      error ||
      !data ||
      !data.is_active ||
      !(await verifyAdminPassword(input.password, data.password_hash))
    ) {
      const { error: failureError } = await service.rpc(
        "admin_fail_login_attempt",
        {
          p_attempt_id: attemptId,
          p_error_message: "아이디 또는 비밀번호를 확인해주세요.",
        },
      );
      if (failureError) throw failureError;
      attemptId = null;
      throw new AdminRequestError(
        401,
        "ADMIN_LOGIN_FAILED",
        "아이디 또는 비밀번호를 확인해주세요.",
      );
    }

    const operator = parseAdminOperator(data);
    const session = await createAdminSession(
      operator.id,
      data.password_hash,
      rateIdentity,
      attemptId,
      context,
    );
    attemptId = null;

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
    if (attemptId !== null) {
      const { error: failureError } = await service.rpc(
        "admin_fail_login_attempt",
        {
          p_attempt_id: attemptId,
          p_error_message:
            error instanceof Error ? error.message : "로그인 실패",
        },
      );
      if (failureError) {
        console.error(
          "관리자 로그인 실패 시도 마무리 오류",
          failureError,
        );
      }
    }
    return adminErrorResponse(error);
  }
}
