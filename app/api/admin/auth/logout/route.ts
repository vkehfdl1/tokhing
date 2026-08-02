import { NextRequest, NextResponse } from "next/server";
import { recordAdminAudit } from "@/lib/admin/audit";
import { adminErrorResponse } from "@/lib/admin/errors";
import {
  ADMIN_SESSION_COOKIE,
  getAdminSession,
  revokeAdminSession,
} from "@/lib/admin/session";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getAdminSession(request);
    if (session) {
      await revokeAdminSession(session.id);
      await recordAdminAudit(request, {
        operatorId: session.operator.id,
        action: "ADMIN_LOGOUT",
        targetType: "admin_operator",
        targetId: session.operator.id,
        success: true,
      });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return adminErrorResponse(error);
  }
}
