import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";

const MemberInputSchema = z.object({
  student_number: z.number().int().positive(),
  username: z.string().trim().min(1).max(50),
  phone_number: z.string().trim().min(10).max(20),
  department: z.string().trim().min(1).max(100),
  favorite_team_id: z.number().int().positive(),
  reset_password: z.boolean().optional(),
});

const MutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upsert"),
    member: MemberInputSchema,
  }),
  z.object({
    action: z.literal("bulk_upsert"),
    members: z.array(MemberInputSchema).min(1).max(500),
  }),
]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminSession(request, "operators:read");
    const service = createAdminServiceClient();
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    // remote DB grants anon SELECT on users_public only, not users.
    let usersQuery = service
      .from("users_public")
      .select("id, student_number, username")
      .order("student_number", { ascending: true })
      .limit(2000);

    if (query) {
      const filters = [`username.ilike.%${query}%`];
      if (/^[0-9]+$/.test(query)) {
        filters.push(`student_number.eq.${query}`);
      }
      usersQuery = usersQuery.or(filters.join(","));
    }
    const [{ data: users, error }, { data: activeSeason }, { data: teams }] =
      await Promise.all([
        usersQuery,
        service.from("seasons").select("id").eq("status", "ACTIVE").maybeSingle(),
        service.from("teams").select("id, name, short_name").order("id"),
      ]);
    if (error) throw error;

    const { data: wallets, error: walletError } = activeSeason
      ? await service
          .from("wallets")
          .select("user_id, balance")
          .eq("season_id", activeSeason.id)
      : { data: [], error: null };
    if (walletError) {
      console.error("회원 지갑 조회 실패", walletError.message);
    }
    const walletByUser = new Map(
      (wallets ?? []).map((wallet) => [
        wallet.user_id,
        Number(wallet.balance),
      ]),
    );

    return NextResponse.json({
      members: (users ?? []).map((user) => ({
        id: user.id,
        student_number: user.student_number,
        username: user.username,
        phone_number: "",
        department: "",
        favorite_team_id: 0,
        password_changed: true,
        is_active: true,
        session_version: 0,
        deactivated_at: null,
        deactivated_reason: null,
        teams: null,
        has_active_wallet: walletByUser.has(user.id),
        active_wallet_balance: walletByUser.get(user.id) ?? null,
      })),
      teams: teams ?? [],
      activeSeasonId: activeSeason?.id ?? null,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAdminSession(request, "admin:mutate");
    const input = MutationSchema.parse(await request.json());
    const service = createAdminServiceClient();

    if (input.action === "upsert") {
      const { reset_password: resetPassword = false, ...member } = input.member;
      const { data, error } = await service.rpc("admin_upsert_member", {
        p_actor_id: session.operator.id,
        p_member: member,
        p_reset_password: resetPassword,
      });
      if (error) throw error;
      return NextResponse.json({ result: data });
    }

    const { data, error } = await service.rpc("admin_bulk_upsert_members", {
      p_actor_id: session.operator.id,
      p_rows: input.members,
    });
    if (error) throw error;
    return NextResponse.json({ result: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
