import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRequestContext } from "@/lib/admin/audit";
import { requireAdminSession } from "@/lib/admin/authorization";
import {
  adminErrorResponse,
  AdminRequestError,
} from "@/lib/admin/errors";
import { hashAdminPassword } from "@/lib/admin/password";
import { createAdminServiceClient } from "@/lib/admin/service";
import { AdminRoleSchema, parseAdminOperator } from "@/lib/admin/types";

const CreateOperatorSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/),
  displayName: z.string().trim().min(2).max(50),
  role: AdminRoleSchema,
  temporaryPassword: z.string().min(12).max(128),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminSession(request, "operators:read");
    const { data, error } = await createAdminServiceClient()
      .from("admin_operators")
      .select(
        "id, username, display_name, role, is_active, must_change_password, last_login_at, created_at, updated_at",
      )
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({
      operators: (data ?? []).map(parseAdminOperator),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAdminSession(
      request,
      "operators:manage",
      true,
    );
    const input = CreateOperatorSchema.parse(await request.json());
    const passwordHash = await hashAdminPassword(input.temporaryPassword);
    const context = getAdminRequestContext(request);
    const service = createAdminServiceClient();
    const { data, error } = await service.rpc("admin_create_operator", {
      p_actor_id: session.operator.id,
      p_username: input.username,
      p_display_name: input.displayName,
      p_role: input.role,
      p_password_hash: passwordHash,
      p_ip_address: context.ipAddress,
      p_user_agent: context.userAgent,
    });
    if (error) throw error;
    const result = data as
      | Readonly<{ success: true; operator: unknown }>
      | Readonly<{ success: false; error: string }>
      | null;
    if (!result?.success) {
      throw new AdminRequestError(
        400,
        "ADMIN_OPERATOR_CREATE_FAILED",
        result?.error ?? "운영자 생성에 실패했습니다.",
      );
    }

    const operator = parseAdminOperator(result.operator);
    return NextResponse.json({ operator }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
