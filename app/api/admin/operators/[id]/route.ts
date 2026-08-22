import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse, AdminRequestError } from "@/lib/admin/errors";

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminSession(request, "operators:manage");
    throw new AdminRequestError(
      400,
      "ADMIN_OPERATORS_DISABLED",
      "운영자 계정 기능은 사용하지 않습니다.",
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
