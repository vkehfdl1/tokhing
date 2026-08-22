export type WeeklyGrantRun = Readonly<{
  id: number;
  round_key: string;
  source: "AUTO" | "MANUAL";
  status: "RUNNING" | "SUCCESS" | "FAILURE" | "SKIPPED";
  recipient_count: number;
  total_payout: number;
  failure_count: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}>;

export type WeeklyGrantStatus = Readonly<{
  season_id: number;
  season_name: string;
  amount: number;
  weekday: number;
  grant_time: string;
  automatic_enabled: boolean;
  is_paused: boolean;
  cron_expression: string;
  cron_active: boolean;
  next_run: string | null;
  expected_recipient_count: number;
  estimated_total_payout: number;
  recent_runs: WeeklyGrantRun[];
}>;

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "주간 지급 요청에 실패했습니다.");
  return body;
}

export async function fetchWeeklyGrantStatus(): Promise<WeeklyGrantStatus> {
  const response = await fetch("/api/admin/weekly-grants", {
    credentials: "same-origin",
    cache: "no-store",
  });
  return (await readJson<{ status: WeeklyGrantStatus }>(response)).status;
}

async function mutate<T>(action: string, input: Record<string, unknown>) {
  const response = await fetch("/api/admin/weekly-grants", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...input }),
  });
  return readJson<T>(response);
}

export async function saveWeeklyGrantPolicy(input: {
  amount: number;
  weekday: number;
  grantTime: string;
  automaticEnabled: boolean;
}) {
  return (
    await mutate<{ status: WeeklyGrantStatus }>("save", input)
  ).status;
}

export async function setWeeklyGrantPaused(paused: boolean) {
  return (
    await mutate<{ status: WeeklyGrantStatus }>(
      paused ? "pause" : "resume",
      {},
    )
  ).status;
}

export async function runWeeklyGrant(roundKey: string) {
  return (
    await mutate<{ result: { status: string; message?: string } }>("run", {
      roundKey,
    })
  ).result;
}
