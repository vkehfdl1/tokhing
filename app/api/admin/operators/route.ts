import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordAdminAudit } from "@/lib/admin/audit";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/errors";
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
    const service = createAdminServiceClient();
    const { data, error } = await service
      .from("admin_operators")
      .insert({
        username: input.username,
        display_name: input.displayName,
        role: input.role,
        password_hash: passwordHash,
        created_by: session.operator.id,
      })
      .select(
        "id, username, display_name, role, is_active, must_change_password, last_login_at, created_at, updated_at",
      )
      .single();

    if (error) throw error;
    const operator = parseAdminOperator(data);
    try {
      await recordAdminAudit(request, {
        operatorId: session.operator.id,
        action: "ADMIN_OPERATOR_CREATED",
        targetType: "admin_operator",
        targetId: operator.id,
        afterState: operator,
        success: true,
      });
    } catch (auditError) {
      await service.from("admin_operators").delete().eq("id", operator.id);
      throw auditError;
    }

    return NextResponse.json({ operator }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
