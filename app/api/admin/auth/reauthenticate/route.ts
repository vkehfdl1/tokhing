import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordAdminAudit } from "@/lib/admin/audit";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse, AdminRequestError } from "@/lib/admin/errors";
import { verifyAdminPassword } from "@/lib/admin/password";
import { createAdminServiceClient } from "@/lib/admin/service";
import { markSessionReauthenticated } from "@/lib/admin/session";

const ReauthenticateSchema = z.object({
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAdminSession(request);
    const input = ReauthenticateSchema.parse(await request.json());
    const { data, error } = await createAdminServiceClient()
      .from("admin_operators")
      .select("password_hash")
      .eq("id", session.operator.id)
      .single();

    if (
      error ||
      !data ||
      !(await verifyAdminPassword(input.password, data.password_hash))
    ) {
      throw new AdminRequestError(
        401,
        "ADMIN_REAUTH_FAILED",
        "비밀번호가 일치하지 않습니다.",
      );
    }

    await markSessionReauthenticated(session.id);
    await recordAdminAudit(request, {
      operatorId: session.operator.id,
      action: "ADMIN_REAUTHENTICATED",
      targetType: "admin_session",
      targetId: session.id,
      success: true,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
