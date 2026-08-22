"use client";

import { useCallback, useEffect, useState } from "react";
import SeasonBlockerCard, {
  defaultBlockerSelection,
  type BlockerSelection,
} from "@/components/admin/SeasonBlockerCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  closeReadySeason,
  downloadSeasonCloseCsv,
  fetchSeasonCloseReadiness,
  processSeasonMarkets,
  type CloseReadinessItem,
  type CloseProcessResult,
  type SeasonCloseReadiness,
} from "@/lib/admin/season-close-client";

type Props = Readonly<{
  seasonId: number;
  onReauthenticate: () => Promise<boolean>;
  onSeasonClosed: () => Promise<void>;
}>;

export default function SeasonCloseConsole({
  seasonId,
  onReauthenticate,
  onSeasonClosed,
}: Props) {
  const [readiness, setReadiness] = useState<SeasonCloseReadiness | null>(null);
  const [selections, setSelections] = useState<Record<number, BlockerSelection>>({});
  const [results, setResults] = useState<CloseProcessResult[]>([]);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchSeasonCloseReadiness(seasonId, page);
      if (page > next.total_pages) {
        setPage(next.total_pages);
        return;
      }
      setReadiness(next);
      setSelections((previous) =>
        Object.fromEntries(
          next.items.map((item) => [
            item.market_id,
            previous[item.market_id] ?? defaultBlockerSelection(item),
          ]),
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "준비 상태 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, seasonId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function execute(items: CloseReadinessItem[]) {
    if (!items.length) return;
    if (!(await onReauthenticate())) return;
    setLoading(true);
    setMessage("");
    try {
      const processed = await processSeasonMarkets(
        seasonId,
        items.map((item) => {
          const selection = selections[item.market_id] ?? defaultBlockerSelection(item);
          return {
            marketId: item.market_id,
            action: selection.action,
            result: selection.result,
          };
        }),
      );
      setResults(processed);
      setMessage(
        `처리 완료: 성공 ${processed.filter((item) => item.status !== "FAILURE").length}건 · 실패 ${processed.filter((item) => item.status === "FAILURE").length}건`,
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "마켓 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function closeSeason() {
    if (!(await onReauthenticate())) return;
    if (!window.confirm("모든 차단 마켓이 해결되었습니다. 시즌을 종료할까요?")) return;
    setLoading(true);
    try {
      await closeReadySeason(seasonId);
      setMessage("시즌을 종료했습니다.");
      await onSeasonClosed();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "시즌 종료에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function executeAll() {
    const all = await fetchSeasonCloseReadiness(seasonId, 1, 1000);
    await execute(all.items);
  }

  if (!readiness) {
    return (
      <Card className="rounded-2xl p-5">
        <h2 className="text-xl font-bold text-black">시즌 종료 준비</h2>
        <p className="mt-2 text-sm text-muted-foreground">불러오는 중...</p>
      </Card>
    );
  }

  const selectedItems = readiness.items.filter(
    (item) => selections[item.market_id]?.selected,
  );

  return (
    <section className="space-y-4" aria-label="시즌 종료 준비">
      <div>
        <h2 className="text-xl font-bold text-black">시즌 종료 준비</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          차단 마켓 {readiness.unsettled_count}건을 모두 처리해야 종료할 수 있습니다.
        </p>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {(["OPEN", "CLOSED", "CANCELED", "SETTLED"] as const).map((status) => (
          <Card key={status} className="rounded-xl p-2">
            <p className="text-muted-foreground">{status}</p>
            <p className="mt-1 text-lg font-bold">{readiness.status_counts[status]}</p>
          </Card>
        ))}
      </div>
      <Card
        className={`rounded-2xl p-4 text-sm ${
          readiness.closure_available ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"
        }`}
      >
        {readiness.closure_available
          ? "종료 및 다음 시즌 활성화 가능"
          : `종료 차단: 미정산 마켓 ${readiness.unsettled_count}건`}
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-12"
          onClick={() => void downloadSeasonCloseCsv(seasonId)}
        >
          CSV 다운로드
        </Button>
        <Button
          className="h-12"
          disabled={!readiness.closure_available || loading}
          onClick={() => void closeSeason()}
        >
          시즌 종료 확정
        </Button>
      </div>
      {readiness.items.map((item) => (
        <SeasonBlockerCard
          key={item.market_id}
          item={item}
          selection={selections[item.market_id] ?? defaultBlockerSelection(item)}
          onChange={(selection) =>
            setSelections((previous) => ({ ...previous, [item.market_id]: selection }))
          }
        />
      ))}
      {readiness.items.length ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-12"
            disabled={!selectedItems.length || loading}
            onClick={() => void execute(selectedItems)}
          >
            선택 실행
          </Button>
          <Button
            className="h-12"
            disabled={loading}
            onClick={() => void executeAll()}
          >
            모든 차단 마켓 처리
          </Button>
        </div>
      ) : null}
      <div className="flex items-center justify-between text-sm">
        <Button
          variant="ghost"
          disabled={page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          이전
        </Button>
        <span>{page} / {readiness.total_pages}</span>
        <Button
          variant="ghost"
          disabled={page >= readiness.total_pages}
          onClick={() => setPage((value) => value + 1)}
        >
          다음
        </Button>
      </div>
      {message ? <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{message}</p> : null}
      {results.length ? (
        <div className="space-y-1 text-xs">
          {results.map((result, index) => (
            <p key={`${result.market_id}-${index}`}>
              #{result.market_id} {result.action} · {result.status} · {result.message}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
