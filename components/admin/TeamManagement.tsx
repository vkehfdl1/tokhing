"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fetchTeamManagementData,
  type ManagedTeam,
  type TeamAlias,
  type TeamMappingRequest,
} from "@/lib/admin/team-client";
import TeamEditor from "./TeamEditor";
import TeamMappingQueue from "./TeamMappingQueue";
import TeamMappingPreview from "./TeamMappingPreview";
import TeamMerge from "./TeamMerge";

type Props = Readonly<{
  onReauthenticate: () => Promise<boolean>;
}>;

export default function TeamManagement({ onReauthenticate }: Props) {
  const [teams, setTeams] = useState<ManagedTeam[]>([]);
  const [aliases, setAliases] = useState<TeamAlias[]>([]);
  const [pending, setPending] = useState<TeamMappingRequest[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"teams" | "pending" | "merge">("teams");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchTeamManagementData();
      setTeams(data.teams);
      setAliases(data.aliases);
      setPending(data.pending);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "팀 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return teams;
    return teams.filter(
      (team) =>
        team.name.toLowerCase().includes(normalized) ||
        team.short_name.toLowerCase().includes(normalized),
    );
  }, [query, teams]);
  const selected =
    teams.find((team) => team.id === selectedId) ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-black">팀 관리</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          팀 원장, 소스별 별칭, 승인 대기 매핑과 중복 병합을 관리합니다.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant={tab === "teams" ? "default" : "outline"}
          onClick={() => setTab("teams")}
        >
          팀 목록
        </Button>
        <Button
          variant={tab === "pending" ? "default" : "outline"}
          onClick={() => setTab("pending")}
        >
          승인 대기 {pending.length}
        </Button>
        <Button
          variant={tab === "merge" ? "default" : "outline"}
          onClick={() => setTab("merge")}
        >
          팀 병합
        </Button>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">불러오는 중...</p> : null}

      {tab === "teams" ? (
        <div className="space-y-4">
          <Input
            aria-label="팀 검색"
            placeholder="팀 이름 또는 약칭 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            variant="outline"
            className="h-12 w-full"
            onClick={() => setSelectedId(null)}
          >
            새 팀 등록
          </Button>
          <div className="space-y-2">
            {filtered.map((team) => (
              <Card
                key={team.id}
                className={`rounded-2xl p-4 ${
                  selectedId === team.id ? "border-tokhin-green" : ""
                }`}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => setSelectedId(team.id)}
                >
                  <span
                    className="h-10 w-10 rounded-full border"
                    style={{ backgroundColor: team.team_color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-black">
                      {team.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {team.short_name} · {team.is_active ? "활성" : "병합됨"}
                    </span>
                  </span>
                </button>
              </Card>
            ))}
          </div>
          {selected && !selected.is_active ? (
            <Card className="rounded-2xl bg-slate-50 p-4 text-sm text-muted-foreground">
              병합된 팀은 읽기 전용입니다. 유지된 팀에서 별칭과 정보를
              관리해주세요.
            </Card>
          ) : (
            <TeamEditor
              team={selected}
              aliases={aliases.filter((item) => item.team_id === selected?.id)}
              onSaved={refresh}
            />
          )}
        </div>
      ) : tab === "pending" ? (
        <div className="space-y-4">
          <TeamMappingPreview onPendingCreated={refresh} />
          <TeamMappingQueue pending={pending} teams={teams} onSaved={refresh} />
        </div>
      ) : (
        <TeamMerge
          teams={teams}
          onReauthenticate={onReauthenticate}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
