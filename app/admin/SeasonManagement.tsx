"use client";

import { useCallback, useEffect, useState } from "react";
import SeasonCard from "@/components/admin/SeasonCard";
import SeasonIncidentRecovery from "@/components/admin/SeasonIncidentRecovery";
import SeasonConfirm, {
  type SeasonConfirmation,
} from "@/components/admin/SeasonConfirm";
import SeasonEditor from "@/components/admin/SeasonEditor";
import { Button } from "@/components/ui/button";
import {
  activateDraftSeason,
  deleteDraftSeason,
  endActiveSeason,
  fetchManagedSeasons,
  type ManagedSeason,
} from "@/lib/admin/season-client";

type Props = Readonly<{
  onReauthenticate: () => Promise<boolean>;
}>;

type Message = Readonly<{
  type: "success" | "error";
  text: string;
}>;

export function SeasonManagement({ onReauthenticate }: Props) {
  const [seasons, setSeasons] = useState<ManagedSeason[]>([]);
  const [editing, setEditing] = useState<ManagedSeason | null | undefined>();
  const [confirmation, setConfirmation] =
    useState<SeasonConfirmation | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSeasons(await fetchManagedSeasons());
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "시즌 목록을 불러오지 못했습니다.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runHighRisk(
    operation: () => Promise<void>,
    successText: string,
  ) {
    if (!(await onReauthenticate())) return;
    setActionLoading(true);
    try {
      await operation();
      setConfirmation(null);
      setMessage({ type: "success", text: successText });
      await refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "시즌 작업에 실패했습니다.",
      });
    } finally {
      setActionLoading(false);
    }
  }

  function requestDelete(season: ManagedSeason) {
    const impact = season.delete_impact;
    setConfirmation({
      title: "DRAFT 시즌 삭제",
      description: `${season.name}을(를) 삭제합니다.\n연결 경기 ${impact?.linked_matches ?? 0}건 · 연결 마켓 ${impact?.linked_markets ?? 0}건`,
      confirmLabel: "삭제",
      variant: "destructive",
      onConfirm: () =>
        runHighRisk(
          () => deleteDraftSeason(season.id),
          "DRAFT 시즌을 삭제했습니다.",
        ),
    });
  }

  function requestActivate(season: ManagedSeason) {
    const preview = season.activation_preview;
    setConfirmation({
      title: "시즌 활성화",
      description: `${season.name}을(를) 활성화합니다.\n대상 회원 ${preview?.eligible_members ?? 0}명 · 1인당 ${Number(preview?.initial_grant_amount ?? 0).toLocaleString()}코인 · 총 ${Number(preview?.total_planned_grant ?? 0).toLocaleString()}코인`,
      confirmLabel: "활성화",
      variant: "default",
      onConfirm: () =>
        runHighRisk(
          () => activateDraftSeason(season.id),
          "새 시즌을 활성화하고 초기 코인을 지급했습니다.",
        ),
    });
  }

  function requestEnd(season: ManagedSeason) {
    setConfirmation({
      title: "시즌 종료",
      description: `${season.name}을(를) ARCHIVED 상태로 전환합니다.`,
      confirmLabel: "종료",
      variant: "destructive",
      onConfirm: () =>
        runHighRisk(
          () => endActiveSeason(season.id),
          "시즌을 종료했습니다.",
        ),
    });
  }

  const hasDraft = seasons.some((season) => season.status === "DRAFT");

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-black">시즌 관리</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            DRAFT 기간과 초기 지급 정책을 확정한 뒤 활성화합니다.
          </p>
        </div>
        <Button
          className="h-12 shrink-0"
          onClick={() => setEditing(null)}
          disabled={hasDraft}
        >
          새 시즌
        </Button>
      </div>

      {message ? (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={`rounded-lg p-3 text-sm ${
            message.type === "error"
              ? "bg-red-50 text-red-600"
              : "bg-green-50 text-green-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : (
        <div className="space-y-4">
          {seasons.map((season) => (
            <SeasonCard
              key={season.id}
              season={season}
              onEdit={() => setEditing(season)}
              onDelete={() => requestDelete(season)}
              onActivate={() => requestActivate(season)}
              onEnd={() => requestEnd(season)}
            />
          ))}
        </div>
      )}

      {editing !== undefined ? (
        <SeasonEditor
          season={editing}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            setMessage({
              type: "success",
              text: editing ? "DRAFT 시즌을 수정했습니다." : "DRAFT 시즌을 생성했습니다.",
            });
            await refresh();
          }}
        />
      ) : null}
      {confirmation ? (
        <SeasonConfirm
          confirmation={confirmation}
          loading={actionLoading}
          onClose={() => setConfirmation(null)}
        />
      ) : null}
      <SeasonIncidentRecovery />
    </div>
  );
}
