import { NextRequest, NextResponse } from "next/server";
import { recordAdminAudit } from "@/lib/admin/audit";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/errors";
import {
  AdminRpcRequestSchema,
  isCriticalAdminAction,
} from "@/lib/admin/rpc-actions";
import { createAdminServiceClient } from "@/lib/admin/service";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let operatorId: string | null = null;
  let action = "UNKNOWN_ADMIN_RPC";

  try {
    const input = AdminRpcRequestSchema.parse(await request.json());
    action = input.action;
    const session = await requireAdminSession(
      request,
      "admin:mutate",
      isCriticalAdminAction(input.action),
    );
    operatorId = session.operator.id;
    const { data, error } = await createAdminServiceClient().rpc(
      input.action,
      input.args,
    );
    if (error) throw error;

    await recordAdminAudit(request, {
      operatorId,
      action: `ADMIN_RPC_${input.action.toUpperCase()}`,
      targetType: "rpc",
      targetId: input.action,
      beforeState: { args: input.args },
      afterState: { result: data },
      success: true,
    });
    return NextResponse.json({ data });
  } catch (error) {
    try {
      await recordAdminAudit(request, {
        operatorId,
        action: `ADMIN_RPC_${action.toUpperCase()}`,
        targetType: "rpc",
        targetId: action,
        success: false,
        errorMessage: error instanceof Error ? error.message : "RPC 실패",
      });
    } catch (auditError) {
      console.error("관리자 RPC 실패 감사 로그 저장 오류", auditError);
    }
    return adminErrorResponse(error);
  }
}
