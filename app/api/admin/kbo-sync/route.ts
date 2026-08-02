import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin/authorization";
import { AdminRequestError, adminErrorResponse } from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";

const Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    mode: z.enum(["DAILY_SEED", "HOURLY_REFRESH"]),
    scheduleKst: z.string().regex(/^\d{2}:\d{2}$/),
    enabled: z.boolean(),
    paused: z.boolean(),
  }),
  z.object({
    action: z.literal("run"),
    mode: z.enum(["DAILY_SEED", "HOURLY_REFRESH"]),
    targetDate: z.iso.date(),
    initialPrice: z.number().positive(),
    retryRunId: z.number().int().positive().optional(),
  }),
]);

function fail(message: string): never {
  throw new AdminRequestError(400, "KBO_SYNC_FAILED", message);
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request);
    const { data, error } =
      await createAdminServiceClient().rpc("get_kbo_sync_status");
    if (error) fail(error.message);
    return NextResponse.json({ status: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = Schema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AdminRequestError(
        400,
        "INVALID_KBO_SYNC_INPUT",
        "동기화 입력값이 올바르지 않습니다.",
      );
    }
    const input = parsed.data;
    const session = await requireAdminSession(
      request,
      "admin:mutate",
      input.action === "run",
    );
    const service = createAdminServiceClient();

    if (input.action === "update") {
      const { data, error } = await service.rpc(
        "admin_update_kbo_sync_job",
        {
          p_operator_id: session.operator.id,
          p_mode: input.mode,
          p_schedule_kst: input.scheduleKst,
          p_enabled: input.enabled,
          p_paused: input.paused,
        },
      );
      if (error) fail(error.message);
      return NextResponse.json({ status: data });
    }

    const { data, error } = await service.rpc("admin_run_kbo_sync", {
      p_operator_id: session.operator.id,
      p_mode: input.mode,
      p_target_date: input.targetDate,
      p_initial_price: input.initialPrice,
      p_retry_run_id: input.retryRunId ?? null,
    });
    if (error) fail(error.message);
    return NextResponse.json({ result: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
