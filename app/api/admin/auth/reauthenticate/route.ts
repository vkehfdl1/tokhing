import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse, AdminRequestError } from "@/lib/admin/errors";
import { verifySharedAdminPassword } from "@/lib/admin/password";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionCookie,
} from "@/lib/admin/session";

const ReauthenticateSchema = z.object({
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminSession(request);
    const input = ReauthenticateSchema.parse(await request.json());
    if (!verifySharedAdminPassword(input.password)) {
      throw new AdminRequestError(
        401,
        "ADMIN_REAUTH_FAILED",
        "비밀번호가 일치하지 않습니다.",
      );
    }

    const session = createAdminSessionCookie(true);
    const response = NextResponse.json({ success: true });
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
