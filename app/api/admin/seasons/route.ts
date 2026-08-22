import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordAdminAudit } from "@/lib/admin/audit";
import { requireAdminSession } from "@/lib/admin/authorization";
import { AdminRequestError, adminErrorResponse } from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";

const SeasonInputSchema = z.object({
  name: z.string().trim().min(1, "시즌 이름을 입력해주세요.").max(100),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  initialGrantAmount: z
    .number()
    .positive("초기 지급액은 0보다 커야 합니다."),
});

const MutationSchema = z.discriminatedUnion("action", [
  SeasonInputSchema.extend({ action: z.literal("create") }),
  SeasonInputSchema.extend({
    action: z.literal("update"),
    id: z.number().int().positive(),
  }),
  z.object({
    action: z.enum(["delete", "activate", "end"]),
    seasonId: z.number().int().positive(),
  }),
]);

function databaseError(error: { message: string }): never {
  throw new AdminRequestError(400, "SEASON_OPERATION_FAILED", error.message);
}

function assertRpcSuccess(data: unknown): void {
  if (
    typeof data === "object" &&
    data !== null &&
    "success" in data &&
    data.success === false
  ) {
    const message =
      "error" in data && typeof data.error === "string"
        ? data.error
        : "시즌 작업에 실패했습니다.";
    throw new AdminRequestError(400, "SEASON_OPERATION_FAILED", message);
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request);
    const service = createAdminServiceClient();
    let { data, error } = await service
      .from("seasons")
      .select(
        "id, name, start_date, end_date, status, initial_grant_amount, created_at",
      )
      .order("id", { ascending: false });
    if (error) {
      const fallback = await service
        .from("seasons")
        .select("id, name, start_date, end_date, status, created_at")
        .order("id", { ascending: false });
      if (fallback.error) databaseError(fallback.error);
      data = (fallback.data ?? []).map((season) => ({
        ...season,
        initial_grant_amount: null,
      }));
      error = null;
    }

    const seasons = (data ?? []).map((season) => ({
      ...season,
      delete_impact: null,
      activation_preview: null,
    }));
    return NextResponse.json({ seasons });
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
        "INVALID_SEASON_INPUT",
        parsed.error.issues[0]?.message ?? "시즌 입력값이 올바르지 않습니다.",
      );
    }
    const input = parsed.data;
    if (
      "startDate" in input &&
      input.startDate >= input.endDate
    ) {
      throw new AdminRequestError(
        400,
        "INVALID_SEASON_PERIOD",
        "시작일은 종료일보다 빨라야 합니다.",
      );
    }
    const highRisk = ["delete", "activate", "end"].includes(input.action);
    const session = await requireAdminSession(
      request,
      "admin:mutate",
      highRisk,
    );
    const service = createAdminServiceClient();

    if (input.action === "create" || input.action === "update") {
      const procedure =
        input.action === "create"
          ? "admin_create_draft_season"
          : "admin_update_draft_season";
      const args = {
        p_operator_id: session.operator.id,
        ...(input.action === "update" ? { p_season_id: input.id } : {}),
        p_name: input.name,
        p_start_date: input.startDate,
        p_end_date: input.endDate,
        p_initial_grant_amount: input.initialGrantAmount,
      };
      const { data, error } = await service.rpc(procedure, args);
      if (error) databaseError(error);
      return NextResponse.json({ season: data });
    }

    if (input.action === "delete") {
      const { data, error } = await service.rpc(
        "admin_delete_draft_season",
        {
          p_operator_id: session.operator.id,
          p_season_id: input.seasonId,
        },
      );
      if (error) databaseError(error);
      return NextResponse.json({ result: data });
    }

    if (input.action === "activate") {
      const { data, error } = await service.rpc("admin_activate_season", {
        p_operator_id: session.operator.id,
        p_season_id: input.seasonId,
      });
      if (error) databaseError(error);
      return NextResponse.json({ result: data });
    }

    const { data: before } = await service
      .from("seasons")
      .select("*")
      .eq("id", input.seasonId)
      .single();
    const { data, error } = await service.rpc("end_season", {
      p_season_id: input.seasonId,
    });
    if (error) databaseError(error);
    assertRpcSuccess(data);
    await recordAdminAudit(request, {
      operatorId: session.operator.id,
      action: "SEASON_END",
      targetType: "season",
      targetId: String(input.seasonId),
      beforeState: before,
      afterState: data,
      success: true,
    });
    return NextResponse.json({ result: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
