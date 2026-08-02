export type CloseAction = "CLOSE" | "SETTLE" | "CANCEL";
export type SettlementResult = "HOME" | "AWAY" | "DRAW";

export type CloseReadinessItem = Readonly<{
  market_id: number;
  market_status: "OPEN" | "CLOSED";
  game_id: number;
  game_date: string;
  game_status: string;
  home_score: number | null;
  away_score: number | null;
  position_holder_count: number;
  classification:
    | "AUTO_DECIDABLE"
    | "MANUAL_REVIEW"
    | "CANCELLATION_RECOMMENDED";
  proposed_result: SettlementResult | null;
  estimated_payout: number;
  estimated_refund: number;
  eligible_actions: CloseAction[];
}>;

export type SeasonCloseReadiness = Readonly<{
  season_id: number;
  season_name: string;
  season_status: string;
  status_counts: Record<"OPEN" | "CLOSED" | "CANCELED" | "SETTLED", number>;
  unsettled_count: number;
  closure_available: boolean;
  next_activation_available: boolean;
  page: number;
  page_size: number;
  total_pages: number;
  items: CloseReadinessItem[];
}>;

export type CloseProcessItem = Readonly<{
  marketId: number;
  action: CloseAction;
  result?: SettlementResult;
}>;

export type CloseProcessResult = Readonly<{
  market_id: number;
  action: CloseAction;
  result: SettlementResult | null;
  status: "SUCCESS" | "FAILURE" | "SKIPPED";
  message: string;
}>;

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "시즌 종료 준비 요청에 실패했습니다.");
  }
  return body;
}

export async function fetchSeasonCloseReadiness(
  seasonId: number,
  page: number,
  pageSize = 2,
): Promise<SeasonCloseReadiness> {
  const params = new URLSearchParams({
    seasonId: String(seasonId),
    page: String(page),
    pageSize: String(pageSize),
  });
  const response = await fetch(`/api/admin/season-close?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  return (await readJson<{ readiness: SeasonCloseReadiness }>(response))
    .readiness;
}

async function mutate<T>(
  action: "process" | "close",
  input: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/admin/season-close", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...input }),
  });
  return readJson<T>(response);
}

export async function processSeasonMarkets(
  seasonId: number,
  items: readonly CloseProcessItem[],
): Promise<CloseProcessResult[]> {
  return (
    await mutate<{ results: CloseProcessResult[] }>("process", {
      seasonId,
      items,
    })
  ).results;
}

export async function closeReadySeason(seasonId: number): Promise<void> {
  await mutate("close", { seasonId });
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function downloadSeasonCloseCsv(seasonId: number) {
  const readiness = await fetchSeasonCloseReadiness(seasonId, 1, 1000);
  const rows = [
    [
      "market_id",
      "game_date",
      "game_status",
      "market_status",
      "classification",
      "proposed_result",
      "position_holders",
      "estimated_payout",
      "estimated_refund",
    ],
    ...readiness.items.map((item) => [
      item.market_id,
      item.game_date,
      item.game_status,
      item.market_status,
      item.classification,
      item.proposed_result ?? "",
      item.position_holder_count,
      item.estimated_payout,
      item.estimated_refund,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `season-${seasonId}-close-readiness.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
