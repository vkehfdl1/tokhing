import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminRequestContext } from "@/lib/admin/audit";
import { requireAdminSession } from "@/lib/admin/authorization";
import {
  adminErrorResponse,
  AdminRequestError,
} from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";

const TeamInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  short_name: z.string().trim().min(1).max(30),
  team_color: z.string().regex(/^#[0-9A-F]{6}$/i),
});

const GameInputSchema = z.object({
  id: z.number().int().positive().optional(),
  game_date: z.iso.date(),
  game_time: z.string().nullable().optional(),
  home_team_id: z.number().int().positive(),
  away_team_id: z.number().int().positive(),
  home_pitcher: z.string().nullable().optional(),
  away_pitcher: z.string().nullable().optional(),
  home_score: z.number().int().nonnegative().nullable().optional(),
  away_score: z.number().int().nonnegative().nullable().optional(),
  game_status: z.enum(["SCHEDULED", "IN_PROGRESS", "FINISHED", "CANCELED"]),
});

const GameDataRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_teams"),
    teams: z.array(TeamInputSchema).min(1).max(50),
  }),
  z.object({
    action: z.literal("save_games"),
    targetDate: z.iso.date(),
    games: z.array(GameInputSchema).max(100),
  }),
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAdminSession(request, "admin:mutate");
    const input = GameDataRequestSchema.parse(await request.json());
    const context = getAdminRequestContext(request);
    const service = createAdminServiceClient();
    const { data, error } = await service.rpc("admin_apply_game_data", {
      p_operator_id: session.operator.id,
      p_payload: input,
      p_ip_address: context.ipAddress,
      p_user_agent: context.userAgent,
    });
    if (error) throw error;

    const result = data as
      | Readonly<{
          success: true;
          teams?: unknown;
          insertedIds?: unknown;
          deletedIds?: unknown;
        }>
      | Readonly<{ success: false; error: string }>
      | null;
    if (!result?.success) {
      throw new AdminRequestError(
        400,
        "ADMIN_GAME_DATA_FAILED",
        result?.error ?? "경기 데이터 저장에 실패했습니다.",
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
