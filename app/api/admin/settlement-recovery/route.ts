import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/admin/authorization";
import { AdminRequestError, adminErrorResponse } from "@/lib/admin/errors";
import { createAdminServiceClient } from "@/lib/admin/service";

const RecoverSchema = z.object({
  marketId: z.number().int().positive(),
  correctResult: z.enum(["HOME", "AWAY", "DRAW"]),
  reason: z.string().trim().min(1).max(200),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession(request, "admin:mutate");
    const { data, error } = await createAdminServiceClient().rpc(
      "preview_settlement_recovery",
      { p_market_id: Number(request.nextUrl.searchParams.get("id")) },
    );
    if (error) throw error;
    return NextResponse.json({ preview: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = RecoverSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AdminRequestError(
        400,
        "SETTLEMENT_RECOVERY_FAILED",
        "정정 결과와 사유를 확인해주세요.",
      );
    }

    const session = await requireAdminSession(request, "admin:mutate");
    const { data, error } = await createAdminServiceClient().rpc(
      "admin_recover_settlement",
      {
        p_operator_id: session.operator.id,
        p_market_id: parsed.data.marketId,
        p_correct_result: parsed.data.correctResult,
        p_reason: parsed.data.reason,
      },
    );
    if (error) {
      throw new AdminRequestError(
        400,
        "SETTLEMENT_RECOVERY_FAILED",
        error.message,
      );
    }

    return NextResponse.json({ result: data });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
