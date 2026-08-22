import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse, AdminRequestError } from "@/lib/admin/errors";
import { SHARED_ADMIN_OPERATOR } from "@/lib/admin/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminSession(request, "operators:read");
    return NextResponse.json({ operators: [SHARED_ADMIN_OPERATOR] });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminSession(request, "operators:manage");
    throw new AdminRequestError(
      400,
      "ADMIN_OPERATORS_DISABLED",
      "운영자 계정 기능은 사용하지 않습니다. 운영진 비밀번호는 NEXT_PUBLIC_ADMIN_PASSWORD_HASH입니다.",
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
