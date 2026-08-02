import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordAdminAudit } from "@/lib/admin/audit";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/errors";
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
    games: z.array(GameInputSchema).max(100),
  }),
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAdminSession(request, "admin:mutate");
    const input = GameDataRequestSchema.parse(await request.json());
    const service = createAdminServiceClient();

    if (input.action === "create_teams") {
      const { data, error } = await service
        .from("teams")
        .insert(input.teams)
        .select("id, name, short_name, team_color");
      if (error) throw error;

      await recordAdminAudit(request, {
        operatorId: session.operator.id,
        action: "ADMIN_TEAMS_CREATED",
        targetType: "team",
        afterState: data,
        success: true,
      });
      return NextResponse.json({ teams: data ?? [] });
    }

    const insertedIds: number[] = [];
    const beforeRows: unknown[] = [];
    for (const game of input.games) {
      const { id, ...values } = game;
      if (id) {
        const { data: before, error: beforeError } = await service
          .from("games")
          .select("*")
          .eq("id", id)
          .single();
        if (beforeError) throw beforeError;
        beforeRows.push(before);

        const { error } = await service.from("games").update(values).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await service
          .from("games")
          .insert(values)
          .select("id")
          .single();
        if (error) throw error;
        insertedIds.push(Number(data.id));
      }
    }

    await recordAdminAudit(request, {
      operatorId: session.operator.id,
      action: "ADMIN_GAMES_SAVED",
      targetType: "game",
      beforeState: beforeRows,
      afterState: { games: input.games, insertedIds },
      success: true,
    });
    return NextResponse.json({ insertedIds });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
