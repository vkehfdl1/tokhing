import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_active"),
    isActive: z.boolean(),
    confirmOpenPositions: z.boolean().default(false),
    reason: z.string().trim().max(200).nullable().optional(),
  }),
  z.object({ action: z.literal("repair_wallet") }),
  z.object({ action: z.literal("reset_password") }),
]);

type RouteContext = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAdminSession(request, "operators:read");
    const { id } = await context.params;
    const service = createAdminServiceClient();
    const [{ data: member, error }, { data: impact, error: impactError }] =
      await Promise.all([
        service
          .from("users")
          .select(
            "id, student_number, username, phone_number, department, favorite_team_id, password_changed, is_active, session_version, deactivated_at, deactivated_reason",
          )
          .eq("id", id)
          .single(),
        service.rpc("admin_member_impact", { p_user_id: id }),
      ]);
    if (error) throw error;
    if (impactError) throw impactError;
    return NextResponse.json({ member, impact });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const session = await requireAdminSession(request, "admin:mutate");
    const { id } = await context.params;
    const input = ActionSchema.parse(await request.json());
    const service = createAdminServiceClient();

    if (input.action === "set_active") {
      const { data, error } = await service.rpc("admin_set_member_active", {
        p_actor_id: session.operator.id,
        p_user_id: id,
        p_is_active: input.isActive,
        p_confirm_open_positions: input.confirmOpenPositions,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
      return NextResponse.json({ result: data });
    }

    if (input.action === "repair_wallet") {
      const { data, error } = await service.rpc(
        "admin_repair_member_wallet",
        {
          p_actor_id: session.operator.id,
          p_user_id: id,
        },
      );
      if (error) throw error;
      return NextResponse.json({ result: data });
    }

    const { data: member, error: memberError } = await service
      .from("users")
      .select(
        "student_number, username, phone_number, department, favorite_team_id",
      )
      .eq("id", id)
      .single();
    if (memberError) throw memberError;
    const { data, error } = await service.rpc("admin_upsert_member", {
      p_actor_id: session.operator.id,
      p_member: member,
      p_reset_password: true,
    });
    if (error) throw error;
    return NextResponse.json({ result: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
