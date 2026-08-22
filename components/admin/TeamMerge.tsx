"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  mergeTeams,
  previewTeamMerge,
  type ManagedTeam,
  type TeamMergeImpact,
} from "@/lib/admin/team-client";

type Props = Readonly<{
  teams: ManagedTeam[];
  onReauthenticate: () => Promise<boolean>;
  onSaved: () => Promise<void>;
}>;

export default function TeamMerge({
  teams,
  onReauthenticate,
  onSaved,
}: Props) {
  const activeTeams = teams.filter((team) => team.is_active);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [impact, setImpact] = useState<TeamMergeImpact | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function preview() {
    setLoading(true);
    setMessage("");
    try {
      setImpact(await previewTeamMerge(Number(sourceId), Number(targetId)));
    } catch (error) {
      setImpact(null);
      setMessage(
        error instanceof Error ? error.message : "병합 영향 조회에 실패했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function execute() {
    if (!impact || !(await onReauthenticate())) return;
    const confirmed = window.confirm(
      `${impact.source_team_name}을(를) ${impact.target_team_name}(으)로 병합합니다. 영향 경기 ${impact.affected_matches}건을 이동하고 원본 팀을 비활성화할까요?`,
    );
    if (!confirmed) return;
    setLoading(true);
    try {
      await mergeTeams(impact.source_team_id, impact.target_team_id);
      setMessage("팀 병합을 완료했습니다.");
      setImpact(null);
      setSourceId("");
      setTargetId("");
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "팀 병합에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="rounded-2xl p-4">
      <h3 className="mb-2 text-lg font-bold text-black">중복 팀 병합</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        경기와 회원 참조를 유지한 채 원본 팀을 비활성화합니다.
      </p>
      <div className="space-y-3">
        <select
          aria-label="병합 원본 팀"
          value={sourceId}
          onChange={(event) => {
            setSourceId(event.target.value);
            setImpact(null);
          }}
          className="h-12 w-full rounded-lg border bg-white px-3 text-sm"
        >
          <option value="">원본 팀 선택</option>
          {activeTeams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name} ({team.short_name})
            </option>
          ))}
        </select>
        <select
          aria-label="병합 유지 팀"
          value={targetId}
          onChange={(event) => {
            setTargetId(event.target.value);
            setImpact(null);
          }}
          className="h-12 w-full rounded-lg border bg-white px-3 text-sm"
        >
          <option value="">유지할 팀 선택</option>
          {activeTeams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name} ({team.short_name})
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          className="h-12 w-full"
          onClick={() => void preview()}
          disabled={!sourceId || !targetId || sourceId === targetId || loading}
        >
          영향 확인
        </Button>
      </div>
      {impact ? (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">
            {impact.source_team_name} → {impact.target_team_name}
          </p>
          <p>영향 경기 {impact.affected_matches}건</p>
          <p>영향 회원 {impact.affected_members}명</p>
          <p>이동 별칭 {impact.affected_aliases}개</p>
          <Button
            className="mt-3 h-12 w-full bg-red-500 hover:bg-red-600"
            onClick={() => void execute()}
            disabled={loading}
          >
            확인 후 병합 실행
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="mt-4 rounded-lg bg-slate-100 p-3 text-sm">
          {message}
        </p>
      ) : null}
    </Card>
  );
}
