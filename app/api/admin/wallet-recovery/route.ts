import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin/authorization";
import { AdminRequestError, adminErrorResponse } from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";

const FIELD_LABELS: Readonly<Record<string, string>> = {
  userId: "회원",
  seasonId: "시즌",
  amount: "조정 금액",
  reason: "조정 사유",
  memo: "내부 메모",
  transactionId: "취소할 거래",
};

const Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("adjust"),
    userId: z.uuid(),
    seasonId: z.number().int(),
    amount: z.number().refine((value) => value !== 0),
    reason: z.string().trim().min(1),
    memo: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("cancel"),
    transactionId: z.number().int().positive(),
    reason: z.string().trim().min(1),
    memo: z.string().trim().min(1),
  }),
]);

function fail(message: string): never {
  throw new AdminRequestError(400, "WALLET_RECOVERY_FAILED", message);
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request);
    const service = createAdminServiceClient();
    const { data: publicUsers, error: userError } = await service
      .from("users_public")
      .select("id,student_number,username")
      .order("student_number");
    if (userError) fail(userError.message);

    const [{ data: wallets, error: walletError }, txResult] = await Promise.all([
      service.from("wallets").select("id,user_id,season_id,balance"),
      service
        .from("transactions")
        .select(
          "id,user_id,season_id,type,amount,balance_after,reason,internal_memo,reverses_transaction_id,created_at",
        )
        .order("created_at", { ascending: false }),
    ]);
    if (walletError) fail(walletError.message);

    let transactions: Array<Record<string, unknown>> | null = txResult.data;
    if (txResult.error) {
      const fallback = await service
        .from("transactions")
        .select("id,user_id,season_id,type,amount,balance_after,created_at")
        .order("created_at", { ascending: false });
      if (fallback.error) fail(fallback.error.message);
      transactions = fallback.data;
    }

    const walletsByUser = new Map<string, unknown[]>();
    for (const wallet of wallets ?? []) {
      const list = walletsByUser.get(wallet.user_id) ?? [];
      list.push(wallet);
      walletsByUser.set(wallet.user_id, list);
    }
    const txByUser = new Map<string, unknown[]>();
    for (const tx of transactions ?? []) {
      const userId = String(tx.user_id ?? "");
      if (!userId) continue;
      const list = txByUser.get(userId) ?? [];
      list.push(tx);
      txByUser.set(userId, list);
    }

    return NextResponse.json({
      users: (publicUsers ?? []).map((user) => ({
        ...user,
        wallets: walletsByUser.get(user.id) ?? [],
        transactions: txByUser.get(user.id) ?? [],
      })),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = Schema.safeParse(await request.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path?.[0];
      const label =
        typeof field === "string" ? (FIELD_LABELS[field] ?? field) : null;
      fail(
        label
          ? `${label} 값이 올바르지 않습니다. 입력을 확인해주세요.`
          : "조정 입력값이 올바르지 않습니다.",
      );
    }

    const input = parsed.data;
    const session = await requireAdminSession(request, "admin:mutate");
    const service = createAdminServiceClient();
    const payload =
      input.action === "adjust"
        ? {
            action: "adjust",
            operator_id: session.operator.id,
            user_id: input.userId,
            season_id: input.seasonId,
            amount: input.amount,
            reason: input.reason,
            memo: input.memo,
          }
        : {
            action: "cancel",
            operator_id: session.operator.id,
            transaction_id: input.transactionId,
            reason: input.reason,
            memo: input.memo,
          };

    const { data, error } = await service.rpc("admin_wallet_recovery_json", {
      p_input: payload,
    });
    if (error) fail(error.message);
    return NextResponse.json({ result: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
