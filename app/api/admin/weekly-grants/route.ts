import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin/authorization";
import { AdminRequestError, adminErrorResponse } from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";

const MutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    amount: z.number().positive(),
    weekday: z.number().int().min(1).max(7),
    grantTime: z.string().regex(/^\d{2}:\d{2}$/),
    automaticEnabled: z.boolean(),
  }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({
    action: z.literal("run"),
    roundKey: z.string().trim().min(1).max(40),
  }),
]);

function databaseError(error: { message: string }): never {
  throw new AdminRequestError(400, "WEEKLY_GRANT_FAILED", error.message);
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request);
    const { data, error } = await createAdminServiceClient().rpc(
      "get_weekly_grant_status",
    );
    if (error) databaseError(error);
    return NextResponse.json({ status: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = MutationSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AdminRequestError(
        400,
        "INVALID_WEEKLY_GRANT_INPUT",
        "주간 지급 입력값이 올바르지 않습니다.",
      );
    }
    const input = parsed.data;
    const session = await requireAdminSession(
      request,
      "admin:mutate",
      input.action === "run",
    );
    const service = createAdminServiceClient();

    if (input.action === "save") {
      const { data, error } = await service.rpc(
        "admin_update_weekly_grant_policy",
        {
          p_operator_id: session.operator.id,
          p_amount: input.amount,
          p_weekday: input.weekday,
          p_grant_time: input.grantTime,
          p_automatic_enabled: input.automaticEnabled,
        },
      );
      if (error) databaseError(error);
      return NextResponse.json({ status: data });
    }
    if (input.action === "pause" || input.action === "resume") {
      const { data, error } = await service.rpc(
        "admin_set_weekly_grant_pause",
        {
          p_operator_id: session.operator.id,
          p_paused: input.action === "pause",
        },
      );
      if (error) databaseError(error);
      return NextResponse.json({ status: data });
    }

    const { data, error } = await service.rpc("run_weekly_grant_round", {
      p_operator_id: session.operator.id,
      p_round_key: input.roundKey,
      p_source: "MANUAL",
      p_scheduled_for: new Date().toISOString(),
    });
    if (error) databaseError(error);
    return NextResponse.json({ result: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
