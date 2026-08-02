import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminSession(request, "audit:read");
    const input = QuerySchema.parse({
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });
    const from = (input.page - 1) * input.limit;
    const to = from + input.limit - 1;
    const { data, count, error } = await createAdminServiceClient()
      .from("admin_audit_logs")
      .select(
        "id, request_id, operator_id, action, target_type, target_id, before_state, after_state, success, error_message, created_at, admin_operators(username, display_name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    return NextResponse.json({
      logs: data ?? [],
      page: input.page,
      total: count ?? 0,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
