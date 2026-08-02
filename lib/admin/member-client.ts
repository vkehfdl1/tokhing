export type AdminMember = Readonly<{
  id: string;
  student_number: number;
  username: string;
  phone_number: string;
  department: string;
  favorite_team_id: number;
  password_changed: boolean;
  is_active: boolean;
  session_version: number;
  deactivated_at: string | null;
  deactivated_reason: string | null;
  has_active_wallet: boolean;
  active_wallet_balance: number | null;
  teams: Readonly<{ name: string; short_name: string }> | null;
}>;

export type AdminTeamRef = Readonly<{
  id: number;
  name: string;
  short_name: string;
}>;

export type AdminMemberInput = Readonly<{
  student_number: number;
  username: string;
  phone_number: string;
  department: string;
  favorite_team_id: number;
  reset_password?: boolean;
}>;

type MembersResponse = Readonly<{
  members: AdminMember[];
  teams: AdminTeamRef[];
  activeSeasonId: number | null;
}>;

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "회원 관리 요청에 실패했습니다.");
  return body;
}

export async function listAdminMembers(
  query = "",
  active: "all" | "active" | "inactive" = "all",
): Promise<MembersResponse> {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (active !== "all") params.set("active", String(active === "active"));
  const response = await fetch(`/api/admin/members?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  return readJson<MembersResponse>(response);
}

export async function upsertAdminMember(
  member: AdminMemberInput,
): Promise<unknown> {
  const response = await fetch("/api/admin/members", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "upsert", member }),
  });
  return (await readJson<{ result: unknown }>(response)).result;
}

export async function bulkUpsertAdminMembers(
  members: readonly AdminMemberInput[],
): Promise<unknown> {
  const response = await fetch("/api/admin/members", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "bulk_upsert", members }),
  });
  return (await readJson<{ result: unknown }>(response)).result;
}

export async function getAdminMemberImpact(
  id: string,
): Promise<
  Readonly<{
    open_position_count: number;
    active_wallet_balance: number | null;
    has_active_wallet: boolean;
  }>
> {
  const response = await fetch(`/api/admin/members/${id}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  return (
    await readJson<{
      impact: {
        open_position_count: number;
        active_wallet_balance: number | null;
        has_active_wallet: boolean;
      };
    }>(response)
  ).impact;
}

async function patchMember(id: string, body: unknown): Promise<void> {
  const response = await fetch(`/api/admin/members/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await readJson<{ result: unknown }>(response);
}

export async function setAdminMemberActive(
  id: string,
  isActive: boolean,
  confirmOpenPositions: boolean,
  reason?: string,
): Promise<void> {
  await patchMember(id, {
    action: "set_active",
    isActive,
    confirmOpenPositions,
    reason,
  });
}

export async function repairAdminMemberWallet(id: string): Promise<void> {
  await patchMember(id, { action: "repair_wallet" });
}

export async function resetAdminMemberPassword(id: string): Promise<void> {
  await patchMember(id, { action: "reset_password" });
}
