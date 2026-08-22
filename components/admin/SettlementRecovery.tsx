"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getISODate, getMarkets, type MarketListItem } from "@/lib/api";

type Payout = Readonly<{
  transaction_id: number;
  user_id: string;
  amount: number;
}>;

type Shortage = Readonly<{
  user_id: string;
  payout: number;
  balance: number;
  shortage: number;
}>;

type Preview = Readonly<{
  event: Readonly<{
    id: number;
    market_id: number;
    original_result: string;
    payout_snapshot: readonly Payout[];
    created_at: string;
  }> | null;
  shortages: readonly Shortage[];
}>;

const coins = (value: number): string =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);

export default function SettlementRecovery() {
  const [date, setDate] = useState(getISODate(new Date()));
  const [markets, setMarkets] = useState<MarketListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const loadMarkets = useCallback(async () => {
    setLoading(true);
    setError("");
    setPreview(null);
    setSelectedId(null);
    try {
      const list = await getMarkets(date);
      setMarkets(list.filter((market) => market.marketStatus === "SETTLED"));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "마켓 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  async function inspect(market: MarketListItem) {
    setSelectedId(market.id);
    setChecking(true);
    setError("");
    setPreview(null);
    try {
      const response = await fetch(
        `/api/admin/settlement-recovery?id=${market.id}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const body = (await response.json()) as {
        preview?: Preview;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "점검에 실패했습니다.");
      setPreview(body.preview ?? { event: null, shortages: [] });
    } catch (checkError) {
      setError(
        checkError instanceof Error
          ? checkError.message
          : "점검에 실패했습니다.",
      );
    } finally {
      setChecking(false);
    }
  }

  const payouts = preview?.event?.payout_snapshot ?? [];
  const payoutTotal = payouts.reduce(
    (sum, payout) => sum + Number(payout.amount),
    0,
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-black">정산 점검</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          이미 정산된 마켓이 누구에게 얼마를 지급했는지 확인합니다. 정산을
          되돌려야 할 때, 회수 가능한 상태인지 미리 점검하는 화면입니다.
        </p>
      </div>

      <Card className="space-y-3 rounded-2xl p-4 shadow">
        <div>
          <Label htmlFor="settlement-date" className="mb-1 block text-sm">
            경기 날짜
          </Label>
          <Input
            id="settlement-date"
            aria-label="정산 조회 날짜"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          className="h-12 w-full rounded-lg"
          onClick={() => void loadMarkets()}
          disabled={loading}
        >
          {loading ? "불러오는 중..." : "정산된 마켓 새로고침"}
        </Button>
      </Card>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : null}
        {markets.map((market) => (
          <Card
            key={market.id}
            aria-label={`마켓 ${market.id}`}
            className={`rounded-2xl p-4 shadow ${
              selectedId === market.id ? "border-tokhin-green" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-black">
                  {market.awayTeamName} vs {market.homeTeamName}
                </p>
                <p className="text-xs text-muted-foreground">
                  정산 결과 {market.result ?? "-"} · 마켓 ID {market.id}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => void inspect(market)}
                disabled={checking}
              >
                점검
              </Button>
            </div>

            {selectedId === market.id && preview ? (
              preview.event ? (
                <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white p-2">
                      <p className="text-xs text-muted-foreground">정산 결과</p>
                      <p className="font-bold text-black">
                        {preview.event.original_result || "-"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <p className="text-xs text-muted-foreground">지급 인원</p>
                      <p className="font-bold text-black">{payouts.length}명</p>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <p className="text-xs text-muted-foreground">지급 총액</p>
                      <p className="font-bold text-black">
                        {coins(payoutTotal)}
                      </p>
                    </div>
                  </div>
                  {preview.shortages.length === 0 ? (
                    <p className="font-semibold text-green-700">
                      지급받은 회원 모두 잔액이 충분해, 필요하면 정산을 되돌릴
                      수 있는 상태입니다.
                    </p>
                  ) : (
                    <div>
                      <p className="font-semibold text-red-600">
                        잔액이 부족한 회원 {preview.shortages.length}명이 있어
                        지금 되돌리면 실패합니다.
                      </p>
                      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                        {preview.shortages.slice(0, 5).map((shortage) => (
                          <li key={shortage.user_id}>
                            지급 {coins(Number(shortage.payout))} · 현재 잔액{" "}
                            {coins(Number(shortage.balance))} · 부족{" "}
                            {coins(Number(shortage.shortage))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-muted-foreground">
                  이 마켓에는 되돌릴 정산 기록이 없습니다.
                </p>
              )
            ) : null}
          </Card>
        ))}
        {!loading && markets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            이 날짜에 정산된 마켓이 없습니다.
          </p>
        ) : null}
      </div>
    </div>
  );
}
