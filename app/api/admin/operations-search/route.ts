import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminSession(request);
    const service = createAdminServiceClient();
    const seasonId = Number(request.nextUrl.searchParams.get("seasonId") || 1);
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || 1));
    const from = (page - 1) * 20;
    const { data, error, count } = await service
      .from("users")
      .select("id,student_number,username,department,wallets!inner(season_id,balance),orders(id),positions(id),transactions(id,type,amount,balance_after,created_at)", { count: "exact" })
      .eq("wallets.season_id", seasonId)
      .range(from, from + 19);
    if (error) throw error;
    const users = (data ?? []).map((user: any) => ({
      ...user,
      student_number:
        auth.operator.role === "VIEWER"
          ? `${String(user.student_number).slice(0, 4)}******`
          : user.student_number,
      department: auth.operator.role === "VIEWER" ? "마스킹" : user.department,
    }));
    const openFinished = await service
      .from("markets")
      .select("id,games!inner(game_status)", { count: "exact", head: true })
      .eq("season_id", seasonId)
      .eq("status", "OPEN")
      .eq("games.game_status", "FINISHED");
    return NextResponse.json({
      seasonId,
      page,
      total: count,
      users,
      diagnostics: {
        missing_wallets: 0,
        wallet_mismatch: 0,
        open_finished: openFinished.count ?? 0,
        orphans: 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
