"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ManagedSeason } from "@/lib/admin/season-client";

type Props = Readonly<{
  season: ManagedSeason;
  onEdit: () => void;
  onDelete: () => void;
  onActivate: () => void;
  onEnd: () => void;
}>;

const statusStyle = {
  DRAFT: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-green-100 text-green-700",
  ARCHIVED: "bg-gray-100 text-gray-600",
} as const;

function period(start: string | null, end: string | null) {
  return `${start ?? "미정"} ~ ${end ?? "미정"}`;
}

export default function SeasonCard({
  season,
  onEdit,
  onDelete,
  onActivate,
  onEnd,
}: Props) {
  const preview = season.activation_preview;
  const impact = season.delete_impact;

  return (
    <Card className="rounded-2xl p-5" aria-label={`${season.name} 시즌`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-black">{season.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {period(season.start_date, season.end_date)}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle[season.status]}`}
        >
          {season.status}
        </span>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
        <p>
          초기 지급액{" "}
          <strong>{Number(season.initial_grant_amount).toLocaleString()}코인</strong>
        </p>
        {season.status === "DRAFT" ? (
          <>
            <p className="mt-1">
              활성화 예정: {preview?.eligible_members ?? 0}명 · 총{" "}
              {Number(preview?.total_planned_grant ?? 0).toLocaleString()}코인
            </p>
            <p className="mt-1">
              삭제 영향: 경기 {impact?.linked_matches ?? 0}건 · 마켓{" "}
              {impact?.linked_markets ?? 0}건
            </p>
          </>
        ) : (
          <p className="mt-2 text-muted-foreground">
            ACTIVE와 ARCHIVED 시즌의 이름, 기간, 초기 지급액은 잠겨 있습니다.
          </p>
        )}
      </div>

      {season.status === "DRAFT" ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button variant="outline" className="h-12" onClick={onEdit}>
            수정
          </Button>
          <Button
            variant="outline"
            className="h-12 border-red-200 text-red-600"
            onClick={onDelete}
          >
            삭제
          </Button>
          <Button className="h-12" onClick={onActivate}>
            시즌 시작
          </Button>
        </div>
      ) : season.status === "ACTIVE" ? (
        <Button
          variant="outline"
          className="mt-4 h-12 w-full border-red-200 text-red-600"
          onClick={onEnd}
        >
          시즌 종료
        </Button>
      ) : null}
    </Card>
  );
}
