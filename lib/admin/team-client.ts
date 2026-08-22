export type ManagedTeam = Readonly<{
  id: number;
  name: string;
  short_name: string;
  team_color: string;
  is_active: boolean;
  merged_into_team_id: number | null;
}>;

export type TeamAlias = Readonly<{
  id: number;
  source: string;
  alias: string;
  team_id: number;
  is_active: boolean;
}>;

export type TeamMappingRequest = Readonly<{
  id: number;
  source: string;
  external_name: string;
  status: "PENDING" | "MAPPED" | "DISMISSED";
  occurrence_count: number;
  last_seen_at: string;
}>;

export type TeamMappingPreview = Readonly<{
  external_name: string;
  mapping_status: "MAPPED" | "PENDING";
  team_id: number | null;
  team_name: string | null;
  request_id: number | null;
}>;

export type TeamMergeImpact = Readonly<{
  source_team_id: number;
  source_team_name: string;
  target_team_id: number;
  target_team_name: string;
  affected_matches: number;
  affected_members: number;
  affected_aliases: number;
}>;

type TeamData = Readonly<{
  teams: ManagedTeam[];
  aliases: TeamAlias[];
  pending: TeamMappingRequest[];
}>;

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "팀 관리 요청에 실패했습니다.");
  }
  return body;
}

async function mutate<T>(
  action: string,
  input: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/admin/teams", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...input }),
  });
  return readJson<T>(response);
}

export async function fetchTeamManagementData(
  query = "",
): Promise<TeamData> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  const response = await fetch(`/api/admin/teams?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  return readJson<TeamData>(response);
}

export async function saveManagedTeam(input: {
  id?: number;
  name: string;
  shortName: string;
  teamColor: string;
}): Promise<ManagedTeam> {
  return (
    await mutate<{ team: ManagedTeam }>("save_team", input)
  ).team;
}

export async function saveTeamAlias(input: {
  id?: number;
  source: string;
  alias: string;
  teamId: number;
}): Promise<TeamAlias> {
  return (
    await mutate<{ alias: TeamAlias }>("save_alias", input)
  ).alias;
}

export async function resolveAdminTeamMappings(
  source: string,
  externalNames: readonly string[],
): Promise<TeamMappingPreview[]> {
  return (
    await mutate<{ mappings: TeamMappingPreview[] }>("resolve", {
      source,
      externalNames,
    })
  ).mappings;
}

export async function approveTeamMapping(input: {
  requestId: number;
  teamId?: number;
  name?: string;
  shortName?: string;
  teamColor?: string;
}): Promise<number> {
  return (
    await mutate<{ teamId: number }>("approve_mapping", input)
  ).teamId;
}

export async function previewTeamMerge(
  sourceTeamId: number,
  targetTeamId: number,
): Promise<TeamMergeImpact> {
  return (
    await mutate<{ impact: TeamMergeImpact }>("preview_merge", {
      sourceTeamId,
      targetTeamId,
    })
  ).impact;
}

export async function mergeTeams(
  sourceTeamId: number,
  targetTeamId: number,
): Promise<TeamMergeImpact> {
  return (
    await mutate<{ impact: TeamMergeImpact }>("merge", {
      sourceTeamId,
      targetTeamId,
    })
  ).impact;
}
