import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordAdminAudit } from "@/lib/admin/audit";
import { requireAdminSession } from "@/lib/admin/authorization";
import {
  adminErrorResponse,
  AdminRequestError,
} from "@/lib/admin/errors";
import { hashAdminPassword } from "@/lib/admin/password";
import { createAdminServiceClient } from "@/lib/admin/service";
import { revokeOperatorSessions } from "@/lib/admin/session";
import { AdminRoleSchema, parseAdminOperator } from "@/lib/admin/types";

const UpdateOperatorSchema = z
  .object({
    displayName: z.string().trim().min(2).max(50).optional(),
    role: AdminRoleSchema.optional(),
    isActive: z.boolean().optional(),
    temporaryPassword: z.string().min(12).max(128).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

type RouteContext = Readonly<{ params: Promise<{ id: string }> }>;

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await requireAdminSession(
      request,
      "operators:manage",
      true,
    );
    const { id } = await context.params;
    const input = UpdateOperatorSchema.parse(await request.json());
    const service = createAdminServiceClient();
    const { data: beforeData, error: beforeError } = await service
      .from("admin_operators")
      .select(
        "id, username, display_name, role, is_active, must_change_password, last_login_at, created_at, updated_at",
      )
      .eq("id", id)
      .single();
    if (beforeError) throw beforeError;

    const before = parseAdminOperator(beforeData);
    const removesOwner =
      before.role === "OWNER" &&
      (input.role !== undefined && input.role !== "OWNER" ||
        input.isActive === false);
    if (removesOwner) {
      const { count, error } = await service
        .from("admin_operators")
        .select("*", { count: "exact", head: true })
        .eq("role", "OWNER")
        .eq("is_active", true);
      if (error) throw error;
      if ((count ?? 0) <= 1) {
        throw new AdminRequestError(
          409,
          "LAST_OWNER_REQUIRED",
          "마지막 활성 OWNER는 변경하거나 비활성화할 수 없습니다.",
        );
      }
    }

    const updates: Record<string, unknown> = {};
    if (input.displayName !== undefined) {
      updates.display_name = input.displayName;
    }
    if (input.role !== undefined) updates.role = input.role;
    if (input.isActive !== undefined) updates.is_active = input.isActive;
    if (input.temporaryPassword !== undefined) {
      updates.password_hash = await hashAdminPassword(input.temporaryPassword);
      updates.must_change_password = true;
      updates.password_changed_at = new Date().toISOString();
    }

    const { data, error } = await service
      .from("admin_operators")
      .update(updates)
      .eq("id", id)
      .select(
        "id, username, display_name, role, is_active, must_change_password, last_login_at, created_at, updated_at",
      )
      .single();
    if (error) throw error;

    const operator = parseAdminOperator(data);
    if (input.isActive === false || input.temporaryPassword !== undefined) {
      await revokeOperatorSessions(id);
    }
    try {
      await recordAdminAudit(request, {
        operatorId: session.operator.id,
        action: "ADMIN_OPERATOR_UPDATED",
        targetType: "admin_operator",
        targetId: id,
        beforeState: before,
        afterState: operator,
        success: true,
      });
    } catch (auditError) {
      await service
        .from("admin_operators")
        .update({
          display_name: before.displayName,
          role: before.role,
          is_active: before.isActive,
        })
        .eq("id", id);
      throw auditError;
    }

    return NextResponse.json({ operator });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
