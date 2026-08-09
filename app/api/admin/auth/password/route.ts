import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRequestContext } from "@/lib/admin/audit";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse, AdminRequestError } from "@/lib/admin/errors";
import {
  hashAdminPassword,
  verifyAdminPassword,
} from "@/lib/admin/password";
import { createAdminServiceClient } from "@/lib/admin/service";

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAdminSession(request, "password:change");
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
    const context = getAdminRequestContext(request);
    const { data: resultData, error: changeError } = await service.rpc(
      "admin_change_operator_password",
      {
        p_operator_id: session.operator.id,
        p_session_id: session.id,
        p_expected_password_hash: data.password_hash,
        p_password_hash: passwordHash,
        p_ip_address: context.ipAddress,
        p_user_agent: context.userAgent,
      },
    );
    if (changeError) throw changeError;
    const result = resultData as
      | Readonly<{ success: true }>
      | Readonly<{ success: false; error: string }>
      | null;
    if (!result?.success) {
      throw new AdminRequestError(
        400,
        "ADMIN_PASSWORD_CHANGE_FAILED",
        result?.error ?? "비밀번호 변경에 실패했습니다.",
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
