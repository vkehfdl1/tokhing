import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordAdminAudit } from "@/lib/admin/audit";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse, AdminRequestError } from "@/lib/admin/errors";
import {
  hashAdminPassword,
  verifyAdminPassword,
} from "@/lib/admin/password";
import { createAdminServiceClient } from "@/lib/admin/service";
import { revokeOperatorSessions } from "@/lib/admin/session";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAdminSession(request);
    const input = ChangePasswordSchema.parse(await request.json());
    const service = createAdminServiceClient();
    const { data, error } = await service
      .from("admin_operators")
      .select("password_hash")
      .eq("id", session.operator.id)
      .single();

    if (
      error ||
      !data ||
      !(await verifyAdminPassword(input.currentPassword, data.password_hash))
    ) {
      throw new AdminRequestError(
        401,
        "ADMIN_PASSWORD_MISMATCH",
        "현재 비밀번호가 일치하지 않습니다.",
      );
    }

    const passwordHash = await hashAdminPassword(input.newPassword);
    const { error: updateError } = await service
      .from("admin_operators")
      .update({
        password_hash: passwordHash,
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
      })
      .eq("id", session.operator.id);
    if (updateError) throw updateError;

    await revokeOperatorSessions(session.operator.id, session.id);
    await recordAdminAudit(request, {
      operatorId: session.operator.id,
      action: "ADMIN_PASSWORD_CHANGED",
      targetType: "admin_operator",
      targetId: session.operator.id,
      success: true,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
