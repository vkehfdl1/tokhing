"use client";

import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/lib/hooks/useResponsive";
import {
  getActiveSeason,
  listSeasons,
  createSeason,
  activateSeason,
  endSeason,
  type Season,
  type SeasonStatus,
} from "@/lib/api";

type Message = { type: "success" | "error"; text: string };

const formatPeriod = (start: string | null, end: string | null) => {
  if (!start && !end) return "기간 미정";
  return `${start ?? "?"} ~ ${end ?? "?"}`;
};

const statusBadgeClass = (status: SeasonStatus): string => {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800";
    case "DRAFT":
      return "bg-gray-100 text-gray-700";
    case "ARCHIVED":
      return "bg-zinc-200 text-zinc-600";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const statusLabel = (status: SeasonStatus): string => {
  switch (status) {
    case "ACTIVE":
      return "진행중";
    case "DRAFT":
      return "준비중";
    case "ARCHIVED":
      return "종료됨";
    default:
      return status;
  }
};

interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant: "default" | "destructive";
  onConfirm: () => Promise<void> | void;
}

const EMPTY_CONFIRM: ConfirmDialogState = {
  open: false,
  title: "",
  description: "",
  confirmLabel: "확인",
  variant: "default",
  onConfirm: () => {},
};

export function SeasonManagement() {
  const isMobile = useIsMobile();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [confirm, setConfirm] = useState<ConfirmDialogState>(EMPTY_CONFIRM);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [list, active] = await Promise.all([
        listSeasons(),
        getActiveSeason(),
      ]);
      const sorted = [...list].sort((a, b) => b.id - a.id);
      setSeasons(sorted);
      setActiveSeason(active);
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "시즌 정보를 불러오지 못했습니다.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const openCreate = () => {
    setFormName("");
    setFormStartDate("");
    setFormEndDate("");
    setFormError(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (creating) return;
    setCreateOpen(false);
    setFormError(null);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError("시즌 이름을 입력해 주세요.");
      return;
    }
    if (!formStartDate || !formEndDate) {
      setFormError("시작일과 종료일을 모두 입력해 주세요.");
      return;
    }
    if (formStartDate >= formEndDate) {
      setFormError("시작일은 종료일보다 빨라야 합니다.");
      return;
    }

    setCreating(true);
    try {
      await createSeason({
        name: trimmedName,
        startDate: formStartDate,
        endDate: formEndDate,
      });
      setCreateOpen(false);
      setMessage({
        type: "success",
        text: `'${trimmedName}' 시즌이 DRAFT 상태로 생성되었습니다.`,
      });
      await fetchAll();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "시즌 생성 중 오류가 발생했습니다."
      );
    } finally {
      setCreating(false);
    }
  };

  const handleActivate = (season: Season) => {
    setMessage(null);
    setConfirm({
      open: true,
      title: "시즌 시작",
      description: `'${season.name}' 시즌을 시작하시겠습니까?\n시작과 동시에 전체 유저에게 시즌 초기 코인이 지급되며,\n이전 시즌에 정산되지 않은 마켓이 있으면 활성화가 거부됩니다.`,
      confirmLabel: "시즌 시작",
      variant: "default",
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const result = await activateSeason(season.id);
          setMessage({
            type: "success",
            text: `'${season.name}' 시즌이 활성화되었습니다. ${result.usersGranted}명에게 초기 코인을 지급했습니다.`,
          });
          setConfirm(EMPTY_CONFIRM);
          await fetchAll();
        } catch (error) {
          setMessage({
            type: "error",
            text:
              error instanceof Error
                ? error.message
                : "시즌 활성화 중 오류가 발생했습니다.",
          });
          setConfirm(EMPTY_CONFIRM);
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleEnd = (season: Season) => {
    setMessage(null);
    setConfirm({
      open: true,
      title: "시즌 종료",
      description: `'${season.name}' 시즌을 종료(ARCHIVED) 처리하시겠습니까?\n종료 후에는 다시 활성화할 수 없습니다.`,
      confirmLabel: "시즌 종료",
      variant: "destructive",
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await endSeason(season.id);
          setMessage({
            type: "success",
            text: `'${season.name}' 시즌이 종료되었습니다.`,
          });
          setConfirm(EMPTY_CONFIRM);
          await fetchAll();
        } catch (error) {
          setMessage({
            type: "error",
            text:
              error instanceof Error
                ? error.message
                : "시즌 종료 중 오류가 발생했습니다.",
          });
          setConfirm(EMPTY_CONFIRM);
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const closeConfirm = () => {
    if (actionLoading) return;
    setConfirm(EMPTY_CONFIRM);
  };

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h2
          className={`font-bold text-black ${
            isMobile ? "text-xl" : "text-2xl"
          }`}
        >
          시즌 관리
        </h2>
        <p className="text-muted-foreground mt-2">
          시즌을 생성하고 활성화/종료합니다. 활성 시즌이 바뀌면 전체 유저에게
          초기 코인이 지급됩니다.
        </p>
      </div>

      {message ? (
        <div
          className={`rounded-lg p-3 text-sm whitespace-pre-line ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <Card
        className={`rounded-2xl border-tokhin-green/30 bg-tokhin-green/10 ${
          isMobile ? "p-4" : "p-6"
        }`}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">
            현재 활성 시즌을 불러오는 중...
          </p>
        ) : activeSeason ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tokhin-green opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-tokhin-green" />
              </span>
              <div>
                <div className="text-xs font-light text-tokhin-green">
                  현재 진행중인 시즌
                </div>
                <div className="text-lg font-bold text-black">
                  {activeSeason.name}
                </div>
                <div className="text-sm font-normal text-muted-foreground">
                  {formatPeriod(activeSeason.startDate, activeSeason.endDate)}
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-lg border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => handleEnd(activeSeason)}
            >
              시즌 종료
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="inline-flex h-3 w-3 rounded-full bg-gray-300" />
            <div className="text-sm font-normal text-muted-foreground">
              현재 활성화된 시즌이 없습니다. 아래에서 새 시즌을 생성하거나
              DRAFT 시즌을 시작해 주세요.
            </div>
          </div>
        )}
      </Card>

      <div className={isMobile ? "" : "flex justify-end"}>
        <Button
          type="button"
          onClick={openCreate}
          className={`h-12 rounded-lg bg-tokhin-green text-white hover:bg-tokhin-green/90 ${
            isMobile ? "w-full" : ""
          }`}
        >
          + 새 시즌 생성
        </Button>
      </div>

      {loading ? (
        <Card className={`rounded-2xl ${isMobile ? "p-4" : "p-6"}`}>
          <p className="text-sm text-muted-foreground">
            시즌 목록을 불러오는 중...
          </p>
        </Card>
      ) : seasons.length === 0 ? (
        <Card className={`rounded-2xl ${isMobile ? "p-4" : "p-6"}`}>
          <p className="text-sm text-muted-foreground">
            등록된 시즌이 없습니다.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {seasons.map((season) => {
            const isActive = season.status === "ACTIVE";
            const isDraft = season.status === "DRAFT";
            const isArchived = season.status === "ARCHIVED";
            return (
              <Card
                key={season.id}
                className={`rounded-2xl ${isMobile ? "p-4" : "p-5"} ${
                  isArchived ? "opacity-60" : ""
                }`}
              >
                <div
                  className={`${
                    isMobile
                      ? "space-y-3"
                      : "flex items-center justify-between gap-3"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-base font-bold ${
                          isArchived ? "text-gray-500" : "text-black"
                        }`}
                      >
                        {season.name}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(
                          season.status
                        )}`}
                      >
                        {statusLabel(season.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-normal text-muted-foreground">
                      {formatPeriod(season.startDate, season.endDate)}
                    </p>
                  </div>

                  <div
                    className={`${
                      isMobile ? "flex justify-end gap-2" : "flex gap-2"
                    }`}
                  >
                    {isDraft ? (
                      <Button
                        type="button"
                        onClick={() => handleActivate(season)}
                        className="h-12 rounded-lg bg-tokhin-green text-white hover:bg-tokhin-green/90"
                      >
                        시즌 시작
                      </Button>
                    ) : null}
                    {isActive ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleEnd(season)}
                        className="h-12 rounded-lg border-red-300 text-red-600 hover:bg-red-50"
                      >
                        시즌 종료
                      </Button>
                    ) : null}
                    {isArchived ? (
                      <span className="text-xs font-light text-muted-foreground self-center">
                        종료된 시즌
                      </span>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeCreate}
        >
          <Card
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-black">새 시즌 생성</h3>
            <p className="mt-1 text-sm font-light text-muted-foreground">
              DRAFT 상태로 생성됩니다. 생성 후 &quot;시즌 시작&quot; 버튼을
              눌러 활성화할 수 있습니다.
            </p>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <Label htmlFor="season-name" className="mb-2 block">
                  시즌 이름
                </Label>
                <Input
                  id="season-name"
                  placeholder="예: Season 3"
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  disabled={creating}
                  className="text-black"
                />
              </div>
              <div>
                <Label htmlFor="season-start" className="mb-2 block">
                  시작일
                </Label>
                <Input
                  id="season-start"
                  type="date"
                  value={formStartDate}
                  onChange={(event) => setFormStartDate(event.target.value)}
                  disabled={creating}
                  className="text-black"
                />
              </div>
              <div>
                <Label htmlFor="season-end" className="mb-2 block">
                  종료일
                </Label>
                <Input
                  id="season-end"
                  type="date"
                  value={formEndDate}
                  onChange={(event) => setFormEndDate(event.target.value)}
                  disabled={creating}
                  className="text-black"
                />
              </div>

              {formError ? (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {formError}
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCreate}
                  disabled={creating}
                  className="h-12 rounded-lg"
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={creating}
                  className="h-12 rounded-lg bg-tokhin-green text-white hover:bg-tokhin-green/90"
                >
                  {creating ? "생성 중..." : "생성"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      {confirm.open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeConfirm}
        >
          <Card
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-black">{confirm.title}</h3>
            <p className="mt-3 text-sm font-normal whitespace-pre-line text-muted-foreground">
              {confirm.description}
            </p>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeConfirm}
                disabled={actionLoading}
                className="h-12 rounded-lg"
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={() => void confirm.onConfirm()}
                disabled={actionLoading}
                className={`h-12 rounded-lg text-white ${
                  confirm.variant === "destructive"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-tokhin-green hover:bg-tokhin-green/90"
                }`}
              >
                {actionLoading ? "처리 중..." : confirm.confirmLabel}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
