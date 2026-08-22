import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminErrorResponse, AdminRequestError } from "@/lib/admin/errors";
import { verifySharedAdminPassword } from "@/lib/admin/password";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  SHARED_ADMIN_OPERATOR,
  createAdminSessionCookie,
} from "@/lib/admin/session";

const LoginSchema = z.object({
  username: z.string().trim().min(1).max(50).optional(),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const input = LoginSchema.parse(await request.json());
    if (!verifySharedAdminPassword(input.password)) {
      throw new AdminRequestError(
        401,
        "ADMIN_LOGIN_FAILED",
        "비밀번호를 확인해주세요.",
      );
    }

    const session = createAdminSessionCookie(true);
    const response = NextResponse.json({ operator: SHARED_ADMIN_OPERATOR });
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
    return adminErrorResponse(error);
  }
}
