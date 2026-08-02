import type { AdminOperator, AdminRole } from "@/lib/admin/types";

type ApiErrorBody = Readonly<{
  error?: string;
  code?: string;
}>;

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(body.error ?? "관리자 요청에 실패했습니다.");
  }
  return body;
}

export async function fetchAdminSession(): Promise<AdminOperator | null> {
  const response = await fetch("/api/admin/auth/session", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401) return null;
  const body = await readJson<{ operator: AdminOperator }>(response);
  return body.operator;
}

export async function loginAdmin(
  username: string,
  password: string,
): Promise<AdminOperator> {
  const response = await fetch("/api/admin/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return (await readJson<{ operator: AdminOperator }>(response)).operator;
}

export async function logoutAdmin(): Promise<void> {
  const response = await fetch("/api/admin/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  });
  await readJson<{ success: true }>(response);
}

export async function reauthenticateAdmin(password: string): Promise<void> {
  const response = await fetch("/api/admin/auth/reauthenticate", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  await readJson<{ success: true }>(response);
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const response = await fetch("/api/admin/auth/password", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  await readJson<{ success: true }>(response);
}

export async function listAdminOperators(): Promise<AdminOperator[]> {
  const response = await fetch("/api/admin/operators", {
    credentials: "same-origin",
    cache: "no-store",
  });
  return (await readJson<{ operators: AdminOperator[] }>(response)).operators;
}

export async function createAdminOperator(input: {
  username: string;
  displayName: string;
  role: AdminRole;
  temporaryPassword: string;
}): Promise<AdminOperator> {
  const response = await fetch("/api/admin/operators", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await readJson<{ operator: AdminOperator }>(response)).operator;
}

export async function updateAdminOperator(
  id: string,
  input: {
    displayName?: string;
    role?: AdminRole;
    isActive?: boolean;
    temporaryPassword?: string;
  },
): Promise<AdminOperator> {
  const response = await fetch(`/api/admin/operators/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await readJson<{ operator: AdminOperator }>(response)).operator;
}

export async function callAdminRpc<T>(
  action: string,
  args: Readonly<Record<string, unknown>>,
): Promise<T> {
  const response = await fetch("/api/admin/rpc", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
  return (await readJson<{ data: T }>(response)).data;
}

export type AdminTeamInput = Readonly<{
  name: string;
  short_name: string;
  team_color: string;
}>;

export type AdminGameInput = Readonly<{
  id?: number;
  game_date: string;
  game_time?: string | null;
  home_team_id: number;
  away_team_id: number;
  home_pitcher?: string | null;
  away_pitcher?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  game_status: "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELED";
}>;

export async function createAdminTeams(
  teams: readonly AdminTeamInput[],
): Promise<Array<AdminTeamInput & { id: number }>> {
  const response = await fetch("/api/admin/game-data", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create_teams", teams }),
  });
  return (
    await readJson<{ teams: Array<AdminTeamInput & { id: number }> }>(response)
  ).teams;
}

export async function saveAdminGames(
  games: readonly AdminGameInput[],
): Promise<number[]> {
  const response = await fetch("/api/admin/game-data", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save_games", games }),
  });
  return (await readJson<{ insertedIds: number[] }>(response)).insertedIds;
}
