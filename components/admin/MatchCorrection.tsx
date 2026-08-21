"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { getISODate } from "@/lib/api";

type GameRow = Readonly<{
  id: number;
  game_date: string;
  game_time: string | null;
  game_status: string;
  home_team_id: number;
  away_team_id: number;
}>;

type TeamRow = Readonly<{ id: number; name: string; short_name: string }>;

type Impact = Readonly<{
  game: Readonly<{ id: number; game_status: string }> | null;
  market: Readonly<{ id: number; status: string }> | null;
  order_count: number;
  position_count: number;
  deletable: boolean;
}>;

const STATUS_LABEL: Readonly<Record<string, string>> = {
  SCHEDULED: "경기 예정",
  IN_PROGRESS: "경기 중",
  FINISHED: "경기 종료",
  CANCELED: "경기 취소",
};

export default function MatchCorrection() {
  const supabase = createClient();
  const [date, setDate] = useState(getISODate(new Date()));
  const [games, setGames] = useState<GameRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const loadGames = useCallback(async () => {
    setLoading(true);
    setError("");
    setImpact(null);
    setSelectedId(null);
    const [gameResult, teamResult] = await Promise.all([
      supabase
        .from("games")
        .select(
          "id, game_date, game_time, game_status, home_team_id, away_team_id",
        )
        .eq("game_date", date)
        .order("game_time")
        .order("id"),
      supabase.from("teams").select("id, name, short_name").order("id"),
    ]);
    if (gameResult.error || teamResult.error) {
      setError("경기 목록을 불러오지 못했습니다.");
    } else {
      setGames(gameResult.data ?? []);
      setTeams(teamResult.data ?? []);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    void loadGames();
  }, [loadGames]);

  const teamName = (id: number) =>
    teams.find((team) => team.id === id)?.short_name ?? `팀 ${id}`;

  async function inspect(game: GameRow) {
    setSelectedId(game.id);
    setChecking(true);
    setError("");
    setImpact(null);
    try {
      const response = await fetch(
        `/api/admin/match-correction?id=${game.id}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const body = (await response.json()) as {
        impact?: Impact;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "점검에 실패했습니다.");
      setImpact(body.impact ?? null);
    } catch (checkError) {
      setError(
        checkError instanceof Error
          ? checkError.message
          : "점검에 실패했습니다.",
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-black">경기 삭제 점검</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          경기를 지우거나 크게 바꾸기 전에, 그 경기에 이미 걸린 거래가 있는지
          확인합니다. 거래가 있으면 삭제하면 안 됩니다.
        </p>
      </div>

      <Card className="space-y-3 rounded-2xl p-4 shadow">
        <div>
          <Label htmlFor="correction-date" className="mb-1 block text-sm">
            경기 날짜
          </Label>
          <Input
            id="correction-date"
            aria-label="경기 날짜"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          className="h-12 w-full rounded-lg"
          onClick={() => void loadGames()}
          disabled={loading}
        >
          {loading ? "불러오는 중..." : "경기 목록 새로고침"}
        </Button>
      </Card>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        ) : null}
        {games.map((game) => (
          <Card
            key={game.id}
            aria-label={`경기 ${game.id}`}
            className={`rounded-2xl p-4 shadow ${
              selectedId === game.id ? "border-tokhin-green" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-black">
                  {teamName(game.away_team_id)} vs {teamName(game.home_team_id)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {game.game_time ?? "시간 미정"} ·{" "}
                  {STATUS_LABEL[game.game_status] ?? game.game_status} · ID{" "}
                  {game.id}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => void inspect(game)}
                disabled={checking}
              >
                점검
              </Button>
            </div>

            {selectedId === game.id && impact ? (
              <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white p-2">
                    <p className="text-xs text-muted-foreground">연결 마켓</p>
                    <p className="font-bold text-black">
                      {impact.market?.id ?? "없음"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white p-2">
                    <p className="text-xs text-muted-foreground">주문</p>
                    <p className="font-bold text-black">{impact.order_count}건</p>
                  </div>
                  <div className="rounded-lg bg-white p-2">
                    <p className="text-xs text-muted-foreground">보유 포지션</p>
                    <p className="font-bold text-black">
                      {impact.position_count}건
                    </p>
                  </div>
                </div>
                {impact.deletable ? (
                  <p className="font-semibold text-green-700">
                    거래 기록이 없어 이 경기는 안전하게 삭제하거나 다시 만들 수
                    있습니다.
                  </p>
                ) : (
                  <p className="font-semibold text-red-600">
                    이미 참가자 거래가 있어 삭제할 수 없습니다. 경기 관리에서
                    정보를 고치거나, 마켓 정산/상태 관리에서 취소(원가 환급)를
                    사용하세요.
                  </p>
                )}
              </div>
            ) : null}
          </Card>
        ))}
        {!loading && games.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            이 날짜에 등록된 경기가 없습니다.
          </p>
        ) : null}
      </div>
    </div>
  );
}
