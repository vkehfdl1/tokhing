export type ManagedSeasonStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type DraftDeleteImpact = Readonly<{
  season_id: number;
  season_name: string;
  linked_matches: number;
  linked_markets: number;
}>;

export type ActivationPreview = Readonly<{
  season_id: number;
  season_name: string;
  initial_grant_amount: number;
  eligible_members: number;
  total_planned_grant: number;
}>;

export type ManagedSeason = Readonly<{
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: ManagedSeasonStatus;
  initial_grant_amount: number;
  created_at: string;
  delete_impact: DraftDeleteImpact | null;
  activation_preview: ActivationPreview | null;
}>;

type SeasonInput = Readonly<{
  id?: number;
  name: string;
  startDate: string;
  endDate: string;
  initialGrantAmount: number;
}>;

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "시즌 관리 요청에 실패했습니다.");
  }
  return body;
}

async function mutate<T>(
  action: string,
  input: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/admin/seasons", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...input }),
  });
  return readJson<T>(response);
}

export async function fetchManagedSeasons(): Promise<ManagedSeason[]> {
  const response = await fetch("/api/admin/seasons", {
    credentials: "same-origin",
    cache: "no-store",
  });
  return (await readJson<{ seasons: ManagedSeason[] }>(response)).seasons;
}

export async function saveDraftSeason(
  input: SeasonInput,
): Promise<ManagedSeason> {
  return (
    await mutate<{ season: ManagedSeason }>(
      input.id ? "update" : "create",
      input,
    )
  ).season;
}

export async function deleteDraftSeason(seasonId: number): Promise<void> {
  await mutate("delete", { seasonId });
}

export async function activateDraftSeason(seasonId: number): Promise<void> {
  await mutate("activate", { seasonId });
}

export async function endActiveSeason(seasonId: number): Promise<void> {
  await mutate("end", { seasonId });
}
