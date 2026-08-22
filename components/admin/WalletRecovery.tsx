"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LedgerEntry = Readonly<{
  id: number;
  season_id: number;
  type: string;
  amount: number;
  balance_after: number;
  reason: string | null;
  reverses_transaction_id: number | null;
  created_at: string;
}>;

type WalletRow = Readonly<{ season_id: number; balance: number }>;

type WalletUser = Readonly<{
  id: string;
  student_number: number;
  username: string;
  wallets: readonly WalletRow[];
  transactions: readonly LedgerEntry[];
}>;

type Notice = Readonly<{ tone: "ok" | "error"; text: string }>;

const PRESETS = [100, 500, 1000] as const;

const TYPE_LABEL: Readonly<Record<string, string>> = {
  BUY: "매수",
  SELL: "매도",
  SETTLEMENT: "정산",
  SETTLEMENT_REVERSAL: "정산 취소",
  SETTLEMENT_CORRECTION: "정산 재처리",
  WEEKLY_GRANT: "주간 지급",
  ADMIN_GRANT: "관리자 지급",
  ADMIN_DEDUCTION: "관리자 차감",
  ADMIN_REVERSAL: "지급 취소",
  SEASON_GRANT: "시즌 지급",
};

const coins = (value: number): string =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);

const when = (value: string): string =>
  new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function WalletRecovery() {
  const [users, setUsers] = useState<WalletUser[]>([]);
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [direction, setDirection] = useState<"GRANT" | "DEDUCT">("GRANT");
  const [amount, setAmount] = useState("100");
  const [reason, setReason] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/wallet-recovery", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = (await response.json()) as {
        users?: WalletUser[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "조회에 실패했습니다.");
      setUsers(body.users ?? []);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "조회에 실패했습니다.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const matched = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter(
      (user) =>
        user.username.toLowerCase().includes(keyword) ||
        String(user.student_number).includes(keyword),
    );
  }, [query, users]);

  const selected = users.find((user) => user.id === userId) ?? null;
  const seasons = useMemo(
    () =>
      [...(selected?.wallets ?? [])]
        .map((wallet) => wallet.season_id)
        .sort((a, b) => b - a),
    [selected],
  );
  const activeSeasonId = seasonId ?? seasons[0] ?? null;
  const balance = Number(
    selected?.wallets.find((wallet) => wallet.season_id === activeSeasonId)
      ?.balance ?? 0,
  );
  const delta = Number(amount || 0) * (direction === "GRANT" ? 1 : -1);
  const expected = balance + delta;
  const ledger = useMemo(
    () =>
      [...(selected?.transactions ?? [])]
        .filter((entry) => entry.season_id === activeSeasonId)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
    [selected, activeSeasonId],
  );
  const reversedIds = useMemo(
    () =>
      new Set(
        ledger
          .map((entry) => entry.reverses_transaction_id)
          .filter((value): value is number => value !== null),
      ),
    [ledger],
  );

  function selectUser(user: WalletUser) {
    setUserId(user.id);
    setSeasonId(null);
    setNotice(null);
  }

  async function submit(body: Record<string, unknown>, successText: string) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/wallet-recovery", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "처리에 실패했습니다.");
      setNotice({ tone: "ok", text: successText });
      setReason("");
      setMemo("");
      await load();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "처리에 실패했습니다.",
      });
    } finally {
      setBusy(false);
    }
  }

  const amountValue = Number(amount);
  const canSubmit =
    selected !== null &&
    activeSeasonId !== null &&
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    reason.trim().length > 0 &&
    memo.trim().length > 0 &&
    expected >= 0 &&
    !busy;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-black">지갑 조정</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          회원의 시즌 잔액을 직접 더하거나 빼고, 잘못 지급한 관리자 코인을
          되돌립니다. 모든 조정은 사유와 함께 원장에 남습니다.
        </p>
      </div>

      {notice ? (
        <p
          role="status"
          className={`rounded-lg p-3 text-sm font-semibold ${
            notice.tone === "ok"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <Card className="space-y-3 rounded-2xl p-4 shadow">
        <h3 className="font-semibold text-black">1. 회원 선택</h3>
        <Input
          aria-label="회원 검색"
          placeholder="학번 또는 이름으로 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {matched.slice(0, 30).map((user) => {
              const isSelected = user.id === userId;
              const topWallet = [...user.wallets].sort(
                (a, b) => b.season_id - a.season_id,
              )[0];
              return (
                <button
                  key={user.id}
                  type="button"
                  aria-label={`회원 ${user.student_number}`}
                  onClick={() => selectUser(user)}
                  className={`w-full rounded-lg border p-3 text-left ${
                    isSelected
                      ? "border-tokhin-green bg-tokhin-green/5"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <p className="font-semibold text-black">
                    {user.username} · {user.student_number}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    최근 시즌 잔액{" "}
                    {topWallet ? `${coins(Number(topWallet.balance))}코인` : "지갑 없음"}
                  </p>
                </button>
              );
            })}
            {matched.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                검색 결과가 없습니다.
              </p>
            ) : null}
          </div>
        )}
      </Card>

      {selected ? (
        <>
          <Card className="space-y-3 rounded-2xl p-4 shadow">
            <h3 className="font-semibold text-black">2. 조정 내용</h3>
            <div>
              <Label htmlFor="wallet-season" className="mb-1 block text-sm">
                시즌
              </Label>
              <select
                id="wallet-season"
                aria-label="시즌"
                className="h-11 w-full rounded-lg border bg-white px-3"
                value={activeSeasonId ?? ""}
                onChange={(event) => setSeasonId(Number(event.target.value))}
              >
                {seasons.map((season) => (
                  <option key={season} value={season}>
                    시즌 {season}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={direction === "GRANT" ? "default" : "outline"}
                onClick={() => setDirection("GRANT")}
              >
                지급 (+)
              </Button>
              <Button
                type="button"
                variant={direction === "DEDUCT" ? "default" : "outline"}
                onClick={() => setDirection("DEDUCT")}
              >
                차감 (−)
              </Button>
            </div>

            <div>
              <Label htmlFor="wallet-amount" className="mb-1 block text-sm">
                조정 금액
              </Label>
              <Input
                id="wallet-amount"
                aria-label="조정 금액"
                type="number"
                min="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <div className="mt-2 grid grid-cols-3 gap-2">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    onClick={() => setAmount(String(preset))}
                  >
                    {coins(preset)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <p className="text-muted-foreground">
                현재 잔액 <b className="text-black">{coins(balance)}</b>코인
              </p>
              <p
                className={
                  expected < 0 ? "font-semibold text-red-600" : "text-black"
                }
              >
                조정 후 예상 잔액 <b>{coins(expected)}</b>코인
              </p>
              {expected < 0 ? (
                <p className="mt-1 text-xs text-red-600">
                  잔액이 음수가 되어 실행할 수 없습니다.
                </p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="wallet-reason" className="mb-1 block text-sm">
                조정 사유 (회원 원장에 기록)
              </Label>
              <Input
                id="wallet-reason"
                aria-label="조정 사유"
                placeholder="예: 정산 오류 보상"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="wallet-memo" className="mb-1 block text-sm">
                내부 메모 (운영진 확인용)
              </Label>
              <Input
                id="wallet-memo"
                aria-label="내부 메모"
                placeholder="예: 8/21 문의 접수 건"
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
              />
            </div>

            <Button
              className="h-12 w-full rounded-lg"
              disabled={!canSubmit}
              onClick={() =>
                void submit(
                  {
                    action: "adjust",
                    userId: selected.id,
                    seasonId: activeSeasonId,
                    amount: delta,
                    reason: reason.trim(),
                    memo: memo.trim(),
                  },
                  `${selected.username} 잔액을 ${coins(
                    Math.abs(delta),
                  )}코인 ${direction === "GRANT" ? "지급" : "차감"}했습니다.`,
                )
              }
            >
              {busy ? "처리 중..." : "지갑 조정 실행"}
            </Button>
            {reason.trim() === "" || memo.trim() === "" ? (
              <p className="text-xs text-muted-foreground">
                조정 사유와 내부 메모는 필수입니다.
              </p>
            ) : null}
          </Card>

          <Card className="space-y-3 rounded-2xl p-4 shadow">
            <div>
              <h3 className="font-semibold text-black">3. 최근 코인 원장</h3>
              <p className="text-xs text-muted-foreground">
                관리자 지급 항목은 목록에서 바로 되돌릴 수 있습니다.
              </p>
            </div>
            <div className="space-y-2">
              {ledger.slice(0, 12).map((entry) => {
                const cancelable =
                  entry.type === "ADMIN_GRANT" && !reversedIds.has(entry.id);
                return (
                  <div
                    key={entry.id}
                    className="rounded-lg border bg-white p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-black">
                        {TYPE_LABEL[entry.type] ?? entry.type}
                      </span>
                      <span
                        className={
                          Number(entry.amount) >= 0
                            ? "font-bold text-green-600"
                            : "font-bold text-red-600"
                        }
                      >
                        {Number(entry.amount) >= 0 ? "+" : ""}
                        {coins(Number(entry.amount))}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {when(entry.created_at)} · 잔액{" "}
                      {coins(Number(entry.balance_after))}코인
                      {entry.reason ? ` · ${entry.reason}` : ""}
                    </p>
                    {cancelable ? (
                      <Button
                        variant="outline"
                        className="mt-2 h-10 w-full rounded-lg"
                        disabled={
                          busy ||
                          reason.trim() === "" ||
                          memo.trim() === ""
                        }
                        onClick={() =>
                          void submit(
                            {
                              action: "cancel",
                              transactionId: entry.id,
                              reason: reason.trim(),
                              memo: memo.trim(),
                            },
                            "관리자 지급을 취소했습니다.",
                          )
                        }
                      >
                        이 지급 취소하기
                      </Button>
                    ) : null}
                  </div>
                );
              })}
              {ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  이 시즌의 거래 내역이 없습니다.
                </p>
              ) : null}
            </div>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          회원을 선택하면 잔액과 원장이 표시됩니다.
        </p>
      )}
    </div>
  );
}
