"use client";

import { Card } from "@/components/ui/card";
import type {
  CloseAction,
  CloseReadinessItem,
  SettlementResult,
} from "@/lib/admin/season-close-client";

export type BlockerSelection = Readonly<{
  selected: boolean;
  action: CloseAction;
  result?: SettlementResult;
}>;

type Props = Readonly<{
  item: CloseReadinessItem;
  selection: BlockerSelection;
  onChange: (next: BlockerSelection) => void;
}>;

const classificationLabel = {
  AUTO_DECIDABLE: "자동 판정",
  MANUAL_REVIEW: "수동 검토",
  CANCELLATION_RECOMMENDED: "취소 권장",
} as const;

export function defaultBlockerSelection(
  item: CloseReadinessItem,
): BlockerSelection {
  const action: CloseAction =
    item.classification === "CANCELLATION_RECOMMENDED"
      ? "CANCEL"
      : item.classification === "AUTO_DECIDABLE"
        ? "SETTLE"
        : item.market_status === "OPEN"
          ? "CLOSE"
          : "CANCEL";
  return {
    selected: false,
    action,
    result: item.proposed_result ?? undefined,
  };
}

export default function SeasonBlockerCard({
  item,
  selection,
  onChange,
}: Props) {
  const score =
    item.home_score === null || item.away_score === null
      ? "-"
      : `${item.home_score} : ${item.away_score}`;

  return (
    <Card className="rounded-2xl p-4" aria-label={`마켓 ${item.market_id}`}>
      <div className="flex items-start gap-3">
        <input
          aria-label={`마켓 ${item.market_id} 선택`}
          type="checkbox"
          checked={selection.selected}
          onChange={(event) =>
            onChange({ ...selection, selected: event.target.checked })
          }
          className="mt-1 h-5 w-5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-black">마켓 #{item.market_id}</p>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
              {classificationLabel[item.classification]}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.game_date} · 경기 {item.game_status} · 마켓 {item.market_status}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-muted-foreground">스코어</p>
              <p className="mt-1 font-semibold">{score}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-muted-foreground">보유자</p>
              <p className="mt-1 font-semibold">{item.position_holder_count}명</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-muted-foreground">제안</p>
              <p className="mt-1 font-semibold">{item.proposed_result ?? "-"}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            예상 지급 {Number(item.estimated_payout).toLocaleString()} · 예상 환급{" "}
            {Number(item.estimated_refund).toLocaleString()} 코인
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select
              aria-label={`마켓 ${item.market_id} 작업`}
              value={selection.action}
              onChange={(event) =>
                onChange({
                  ...selection,
                  action: event.target.value as CloseAction,
                })
              }
              className="h-11 rounded-lg border bg-white px-2 text-sm"
            >
              {item.eligible_actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
            <select
              aria-label={`마켓 ${item.market_id} 정산 결과`}
              value={selection.result ?? ""}
              onChange={(event) =>
                onChange({
                  ...selection,
                  result: (event.target.value || undefined) as
                    | SettlementResult
                    | undefined,
                })
              }
              disabled={selection.action !== "SETTLE"}
              className="h-11 rounded-lg border bg-white px-2 text-sm disabled:bg-slate-100"
            >
              <option value="">결과 선택</option>
              <option value="HOME">HOME</option>
              <option value="AWAY">AWAY</option>
              <option value="DRAW">DRAW</option>
            </select>
          </div>
        </div>
      </div>
    </Card>
  );
}
