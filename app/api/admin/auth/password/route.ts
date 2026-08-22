import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse, AdminRequestError } from "@/lib/admin/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminSession(request);
    throw new AdminRequestError(
      400,
      "ADMIN_PASSWORD_CHANGE_UNSUPPORTED",
      "운영진 비밀번호는 NEXT_PUBLIC_ADMIN_PASSWORD_HASH로 관리합니다.",
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
