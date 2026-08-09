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
    const updates: Record<string, unknown> = {};
    if (input.displayName !== undefined) {
      updates.display_name = input.displayName;
    }
    if (input.role !== undefined) updates.role = input.role;
    if (input.isActive !== undefined) updates.is_active = input.isActive;
    if (input.temporaryPassword !== undefined) {
      updates.password_hash = await hashAdminPassword(input.temporaryPassword);
    }
    const requestContext = getAdminRequestContext(request);
    const { data, error } = await service.rpc("admin_update_operator", {
      p_actor_id: session.operator.id,
      p_operator_id: id,
      p_updates: updates,
      p_ip_address: requestContext.ipAddress,
      p_user_agent: requestContext.userAgent,
    });
    if (error) throw error;
    const result = data as
      | Readonly<{ success: true; operator: unknown }>
      | Readonly<{ success: false; error: string }>
      | null;
    if (!result?.success) {
      const lastOwner =
        result?.error.includes("마지막 활성 OWNER") ?? false;
      throw new AdminRequestError(
        lastOwner ? 409 : 400,
        lastOwner
          ? "LAST_OWNER_REQUIRED"
          : "ADMIN_OPERATOR_UPDATE_FAILED",
        result?.error ?? "운영자 변경에 실패했습니다.",
      );
    }

    const operator = parseAdminOperator(result.operator);
    return NextResponse.json({ operator });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
