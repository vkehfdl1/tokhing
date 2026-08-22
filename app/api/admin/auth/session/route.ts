import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse } from "@/lib/admin/errors";
import { requireAdminSession } from "@/lib/admin/authorization";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAdminSession(request);
    return NextResponse.json({ operator: session.operator });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
