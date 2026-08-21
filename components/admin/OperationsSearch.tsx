"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OperationsUser = Readonly<{
  id: string;
  student_number: number | string;
  username: string;
  department: string;
  wallets: ReadonlyArray<{ season_id: number; balance: number }>;
  orders: ReadonlyArray<{ id: number }>;
  positions: ReadonlyArray<{ id: number }>;
  transactions: ReadonlyArray<{ id: number }>;
}>;

type OperationsResponse = Readonly<{
  seasonId: number;
  page: number;
  total: number | null;
  users: readonly OperationsUser[];
  diagnostics: Readonly<{ open_finished: number }>;
  generatedAt: string;
}>;

const PAGE_SIZE = 20;

const coins = (value: number): string =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);

export default function OperationsSearch() {
  const [seasonId, setSeasonId] = useState("1");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<OperationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/operations-search?seasonId=${Number(seasonId) || 1}&page=${page}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const body = (await response.json()) as OperationsResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "조회에 실패했습니다.");
      setData(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "조회에 실패했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, seasonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const users = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const list = data?.users ?? [];
    if (!keyword) return list;
    return list.filter(
      (user) =>
        user.username.toLowerCase().includes(keyword) ||
        String(user.student_number).includes(keyword),
    );
  }, [data, query]);

  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function exportCsv() {
    const rows = [
      ["학번", "이름", "학과", "잔액", "주문", "포지션", "거래"],
      ...users.map((user) => [
        String(user.student_number),
        user.username,
        user.department,
        String(user.wallets[0]?.balance ?? 0),
        String(user.orders.length),
        String(user.positions.length),
        String(user.transactions.length),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `operations-season-${data?.seasonId ?? 1}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-black">운영 현황 조회</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          시즌별 회원의 잔액과 거래 활동을 한눈에 확인합니다. 조회 전용이라
          아무것도 변경되지 않습니다.
        </p>
      </div>

      <Card className="space-y-3 rounded-2xl p-4 shadow">
        <div>
          <Label htmlFor="ops-season" className="mb-1 block text-sm">
            시즌
          </Label>
          <Input
            id="ops-season"
            aria-label="조회 시즌"
            type="number"
            min="0"
            value={seasonId}
            onChange={(event) => {
              setSeasonId(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <Label htmlFor="ops-query" className="mb-1 block text-sm">
            회원 검색 (현재 페이지 안에서 찾기)
          </Label>
          <Input
            id="ops-query"
            aria-label="회원 또는 학번 검색"
            placeholder="학번 또는 이름"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          className="h-12 w-full rounded-lg"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </Button>
      </Card>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {data ? (
        <Card className="rounded-2xl p-4 shadow">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-muted-foreground">시즌 회원 수</p>
              <p className="text-lg font-bold text-black">{total}명</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-muted-foreground">
                종료 경기인데 열린 마켓
              </p>
              <p
                className={`text-lg font-bold ${
                  data.diagnostics.open_finished > 0
                    ? "text-red-600"
                    : "text-black"
                }`}
              >
                {data.diagnostics.open_finished}건
              </p>
            </div>
          </div>
          {data.diagnostics.open_finished > 0 ? (
            <p className="mt-2 text-xs text-red-600">
              경기가 끝났는데 아직 정산되지 않은 마켓이 있습니다. 마켓
              정산/상태 관리에서 처리하세요.
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : null}
        {users.map((user) => (
          <Card key={user.id} className="rounded-2xl p-4 shadow">
            <p className="font-bold text-black">
              {user.username} · {user.student_number}
            </p>
            <p className="text-xs text-muted-foreground">{user.department}</p>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="text-muted-foreground">잔액</p>
                <p className="font-bold text-black">
                  {coins(Number(user.wallets[0]?.balance ?? 0))}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="text-muted-foreground">주문</p>
                <p className="font-bold text-black">{user.orders.length}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="text-muted-foreground">포지션</p>
                <p className="font-bold text-black">{user.positions.length}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="text-muted-foreground">거래</p>
                <p className="font-bold text-black">
                  {user.transactions.length}
                </p>
              </div>
            </div>
          </Card>
        ))}
        {!loading && users.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            조회된 회원이 없습니다.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          disabled={page <= 1 || loading}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          이전
        </Button>
        <div className="flex items-center justify-center text-sm text-muted-foreground">
          {page} / {lastPage}
        </div>
        <Button
          variant="outline"
          disabled={page >= lastPage || loading}
          onClick={() => setPage((current) => current + 1)}
        >
          다음
        </Button>
      </div>

      <Button
        variant="outline"
        className="h-12 w-full rounded-lg"
        onClick={exportCsv}
        disabled={users.length === 0}
      >
        현재 목록 CSV 다운로드
      </Button>
    </div>
  );
}
