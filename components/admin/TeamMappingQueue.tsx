"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  approveTeamMapping,
  type ManagedTeam,
  type TeamMappingRequest,
} from "@/lib/admin/team-client";

type Props = Readonly<{
  pending: TeamMappingRequest[];
  teams: ManagedTeam[];
  onSaved: () => Promise<void>;
}>;

export default function TeamMappingQueue({ pending, teams, onSaved }: Props) {
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [drafts, setDrafts] = useState<
    Record<number, { shortName: string; teamColor: string }>
  >({});
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  async function approve(request: TeamMappingRequest) {
    const teamId = Number(selected[request.id] ?? 0);
    const draft = drafts[request.id] ?? {
      shortName: "",
      teamColor: "#32C600",
    };
    setSavingId(request.id);
    setMessage("");
    try {
      await approveTeamMapping(
        teamId
          ? { requestId: request.id, teamId }
          : {
              requestId: request.id,
              name: request.external_name,
              shortName: draft.shortName,
              teamColor: draft.teamColor.toUpperCase(),
            },
      );
      setMessage(`${request.external_name} 매핑을 승인했습니다.`);
      await onSaved();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "매핑 승인에 실패했습니다.",
      );
    } finally {
      setSavingId(null);
    }
  }

  if (!pending.length) {
    return (
      <div className="space-y-3">
        <Card className="rounded-2xl p-5 text-center text-sm text-muted-foreground">
          승인 대기 중인 팀 매핑이 없습니다.
        </Card>
        {message ? (
          <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pending.map((request) => {
        const current = selected[request.id] ?? "";
        const draft = drafts[request.id] ?? {
          shortName: "",
          teamColor: "#32C600",
        };
        return (
          <Card key={request.id} className="rounded-2xl p-4">
            <p className="font-bold text-black">{request.external_name}</p>
            <p className="mb-3 text-xs text-muted-foreground">
              {request.source} · 감지 {request.occurrence_count}회
            </p>
            <Label htmlFor={`mapping-${request.id}`}>기존 팀에 매핑</Label>
            <select
              id={`mapping-${request.id}`}
              value={current}
              onChange={(event) =>
                setSelected((previous) => ({
                  ...previous,
                  [request.id]: event.target.value,
                }))
              }
              className="mt-1 h-12 w-full rounded-lg border bg-white px-3 text-sm"
            >
              <option value="">새 팀으로 생성</option>
              {teams
                .filter((team) => team.is_active)
                .map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.short_name})
                  </option>
                ))}
            </select>
            {!current ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={`mapping-short-${request.id}`}>새 약칭</Label>
                  <Input
                    id={`mapping-short-${request.id}`}
                    value={draft.shortName}
                    onChange={(event) =>
                      setDrafts((previous) => ({
                        ...previous,
                        [request.id]: {
                          ...draft,
                          shortName: event.target.value,
                        },
                      }))
                    }
                    maxLength={10}
                  />
                </div>
                <div>
                  <Label htmlFor={`mapping-color-${request.id}`}>새 색상</Label>
                  <Input
                    id={`mapping-color-${request.id}`}
                    value={draft.teamColor}
                    onChange={(event) =>
                      setDrafts((previous) => ({
                        ...previous,
                        [request.id]: {
                          ...draft,
                          teamColor: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            ) : null}
            <Button
              className="mt-4 h-12 w-full"
              onClick={() => void approve(request)}
              disabled={
                savingId === request.id || (!current && !draft.shortName.trim())
              }
            >
              {savingId === request.id ? "승인 중..." : "매핑 승인"}
            </Button>
          </Card>
        );
      })}
      {message ? (
        <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
