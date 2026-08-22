import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";

const PAGE_SIZE = 20;

type OverviewUser = Readonly<{
  id: string;
  student_number: number;
  username: string;
  balance: number;
  order_count: number;
  position_count: number;
  transaction_count: number;
}>;

type Overview = Readonly<{
  season_id: number;
  page: number;
  page_size: number;
  total: number;
  users: readonly OverviewUser[];
  open_finished: number;
}>;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminSession(request);
    const service = createAdminServiceClient();
    const seasonId = Number(request.nextUrl.searchParams.get("seasonId") || 1);
    const page = Math.max(
      1,
      Number(request.nextUrl.searchParams.get("page") || 1),
    );

    // public.users is RLS-locked and not granted to anon, so this goes through a
    // SECURITY DEFINER RPC instead of selecting the table directly.
    const { data, error } = await service.rpc("get_operations_overview", {
      p_season_id: seasonId,
      p_page: page,
      p_page_size: PAGE_SIZE,
    });
    if (error) throw error;

    const overview = data as Overview;
    const masked = auth.operator.role === "VIEWER";
    const users = (overview?.users ?? []).map((user) => ({
      id: user.id,
      student_number: masked
        ? `${String(user.student_number).slice(0, 4)}******`
        : user.student_number,
      username: user.username,
      department: "",
      wallets: [{ season_id: seasonId, balance: Number(user.balance) }],
      order_count: Number(user.order_count),
      position_count: Number(user.position_count),
      transaction_count: Number(user.transaction_count),
    }));

    return NextResponse.json({
      seasonId,
      page,
      total: overview?.total ?? 0,
      users,
      diagnostics: {
        missing_wallets: 0,
        wallet_mismatch: 0,
        open_finished: overview?.open_finished ?? 0,
        orphans: 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
