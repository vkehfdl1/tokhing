import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin/authorization";
import { AdminRequestError, adminErrorResponse } from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";

const ProcessSchema = z.object({
  action: z.literal("process"),
  seasonId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        marketId: z.number().int().positive(),
        action: z.enum(["CLOSE", "SETTLE", "CANCEL"]),
        result: z.enum(["HOME", "AWAY", "DRAW"]).optional(),
      }),
    )
    .min(1)
    .max(1000),
});

const MutationSchema = z.discriminatedUnion("action", [
  ProcessSchema,
  z.object({
    action: z.literal("close"),
    seasonId: z.number().int().positive(),
  }),
]);

function databaseError(error: { message: string }): never {
  throw new AdminRequestError(400, "SEASON_CLOSE_FAILED", error.message);
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request);
    const seasonId = Number(request.nextUrl.searchParams.get("seasonId"));
    const page = Number(request.nextUrl.searchParams.get("page") ?? 1);
    const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? 2);
    if (!Number.isInteger(seasonId) || seasonId <= 0) {
      throw new AdminRequestError(
        400,
        "INVALID_SEASON_ID",
        "유효한 시즌을 선택해주세요.",
      );
    }
    const { data, error } = await createAdminServiceClient().rpc(
      "get_season_close_readiness",
      {
        p_season_id: seasonId,
        p_page: page,
        p_page_size: pageSize,
      },
    );
    if (error) databaseError(error);
    return NextResponse.json({ readiness: data });
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
        "INVALID_CLOSE_INPUT",
        parsed.error.issues[0]?.message ?? "처리 입력값이 올바르지 않습니다.",
      );
    }
    const input = parsed.data;
    const session = await requireAdminSession(request, "admin:mutate", true);
    const service = createAdminServiceClient();

    if (input.action === "process") {
      const { data, error } = await service.rpc(
        "admin_process_season_markets",
        {
          p_operator_id: session.operator.id,
          p_season_id: input.seasonId,
          p_items: input.items.map((item) => ({
            market_id: item.marketId,
            action: item.action,
            result: item.result ?? null,
          })),
        },
      );
      if (error) databaseError(error);
      return NextResponse.json({
        results: data?.results ?? [],
        readiness: data?.readiness,
      });
    }

    const { data, error } = await service.rpc("admin_close_ready_season", {
      p_operator_id: session.operator.id,
      p_season_id: input.seasonId,
    });
    if (error) databaseError(error);
    return NextResponse.json({ result: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
