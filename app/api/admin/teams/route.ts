import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin/authorization";
import { AdminRequestError, adminErrorResponse } from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";

const TeamSchema = z.object({
  action: z.literal("save_team"),
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(50),
  shortName: z.string().trim().min(1).max(10),
  teamColor: z.string().regex(/^#[0-9A-F]{6}$/),
});

const AliasSchema = z.object({
  action: z.literal("save_alias"),
  id: z.number().int().positive().optional(),
  source: z.string().trim().min(1).max(30),
  alias: z.string().trim().min(1).max(100),
  teamId: z.number().int().positive(),
});

const ResolveSchema = z.object({
  action: z.literal("resolve"),
  source: z.string().trim().min(1).max(30),
  externalNames: z.array(z.string().trim().min(1).max(100)).max(100),
});

const ApproveSchema = z.object({
  action: z.literal("approve_mapping"),
  requestId: z.number().int().positive(),
  teamId: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(50).optional(),
  shortName: z.string().trim().min(1).max(10).optional(),
  teamColor: z.string().regex(/^#[0-9A-F]{6}$/).optional(),
});

const MergeSchema = z.object({
  action: z.enum(["preview_merge", "merge"]),
  sourceTeamId: z.number().int().positive(),
  targetTeamId: z.number().int().positive(),
});

const MutationSchema = z.discriminatedUnion("action", [
  TeamSchema,
  AliasSchema,
  ResolveSchema,
  ApproveSchema,
  MergeSchema,
]);

function databaseError(error: { code?: string; message: string }): never {
  if (error.code === "23505") {
    throw new AdminRequestError(
      409,
      "TEAM_CONFLICT",
      "팀 이름, 약칭 또는 같은 소스의 별칭이 이미 사용 중입니다.",
    );
  }
  throw new AdminRequestError(400, "TEAM_OPERATION_FAILED", error.message);
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request);
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const service = createAdminServiceClient();
    let teamsQuery = service
      .from("teams")
      .select(
        "id, name, short_name, team_color, is_active, merged_into_team_id",
      )
      .order("is_active", { ascending: false })
      .order("name");
    if (query) {
      teamsQuery = teamsQuery.or(
        `name.ilike.%${query}%,short_name.ilike.%${query}%`,
      );
    }

    const [teamsResult, aliasesResult, pendingResult] = await Promise.all([
      teamsQuery,
      service
        .from("team_aliases")
        .select("id, source, alias, team_id, is_active")
        .eq("is_active", true)
        .order("source")
        .order("alias"),
      service
        .from("team_mapping_requests")
        .select(
          "id, source, external_name, status, occurrence_count, last_seen_at",
        )
        .eq("status", "PENDING")
        .order("last_seen_at", { ascending: false }),
    ]);

    const error =
      teamsResult.error ?? aliasesResult.error ?? pendingResult.error;
    if (error) databaseError(error);

    return NextResponse.json({
      teams: teamsResult.data ?? [],
      aliases: aliasesResult.data ?? [],
      pending: pendingResult.data ?? [],
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = MutationSchema.parse(await request.json());
    const session = await requireAdminSession(
      request,
      "admin:mutate",
      input.action === "merge",
    );
    const service = createAdminServiceClient();

    if (input.action === "save_team") {
      const { data, error } = await service.rpc("admin_upsert_team", {
        p_operator_id: session.operator.id,
        p_team_id: input.id ?? null,
        p_name: input.name,
        p_short_name: input.shortName,
        p_team_color: input.teamColor,
      });
      if (error) databaseError(error);
      return NextResponse.json({ team: data });
    }

    if (input.action === "save_alias") {
      const { data, error } = await service.rpc("admin_upsert_team_alias", {
        p_operator_id: session.operator.id,
        p_alias_id: input.id ?? null,
        p_source: input.source,
        p_alias: input.alias,
        p_team_id: input.teamId,
      });
      if (error) databaseError(error);
      return NextResponse.json({ alias: data });
    }

    if (input.action === "resolve") {
      const { data, error } = await service.rpc("resolve_team_mappings", {
        p_source: input.source,
        p_external_names: input.externalNames,
      });
      if (error) databaseError(error);
      return NextResponse.json({ mappings: data ?? [] });
    }

    if (input.action === "approve_mapping") {
      const { data, error } = await service.rpc(
        "admin_approve_team_mapping",
        {
          p_operator_id: session.operator.id,
          p_request_id: input.requestId,
          p_team_id: input.teamId ?? null,
          p_name: input.name ?? null,
          p_short_name: input.shortName ?? null,
          p_team_color: input.teamColor ?? null,
        },
      );
      if (error) databaseError(error);
      return NextResponse.json({ teamId: data });
    }

    const procedure =
      input.action === "merge"
        ? "admin_merge_teams"
        : "get_team_merge_impact";
    const args =
      input.action === "merge"
        ? {
            p_operator_id: session.operator.id,
            p_source_team_id: input.sourceTeamId,
            p_target_team_id: input.targetTeamId,
          }
        : {
            p_source_team_id: input.sourceTeamId,
            p_target_team_id: input.targetTeamId,
          };
    const { data, error } = await service.rpc(procedure, args);
    if (error) databaseError(error);
    return NextResponse.json({ impact: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
