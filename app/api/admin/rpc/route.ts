import { NextRequest, NextResponse } from "next/server";
import { getAdminRequestContext } from "@/lib/admin/audit";
import { requireAdminSession } from "@/lib/admin/authorization";
import {
  adminErrorResponse,
  AdminRequestError,
} from "@/lib/admin/errors";
import {
  AdminRpcRequestSchema,
  isCriticalAdminAction,
} from "@/lib/admin/rpc-actions";
import { createAdminServiceClient } from "@/lib/admin/service";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const input = AdminRpcRequestSchema.parse(await request.json());
    const session = await requireAdminSession(
      request,
      "admin:mutate",
      isCriticalAdminAction(input.action),
    );
    const context = getAdminRequestContext(request);
    const { data, error } = await createAdminServiceClient().rpc(
      "admin_execute_rpc",
      {
        p_operator_id: session.operator.id,
        p_action: input.action,
        p_args: input.args,
        p_ip_address: context.ipAddress,
        p_user_agent: context.userAgent,
      },
    );
    if (error) throw error;

    const result = data as
      | Readonly<{ success: true; data: unknown }>
      | Readonly<{ success: false; error: string }>
      | null;
    if (!result?.success) {
      throw new AdminRequestError(
        400,
        "ADMIN_RPC_FAILED",
        result?.error ?? "관리자 작업에 실패했습니다.",
      );
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
