"use client";

import React, { useState, useEffect } from "react";
import { Game as CrawledGame } from "kbo-game";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/lib/hooks/useResponsive";
import { DefaultInput } from "@/components/ui/default_input";
import {
  adminGrantCoins,
  cancelMarket,
  closeMarket,
  distributeWeeklyCoins,
  ensureMarketsForGames,
  getGameData,
  getLiquidityB,
  getMarketListForDate,
  getWeeklyCoinCronStatus,
  getUsersForAdmin,
  settleMarket,
  updateLiquidityB,
  type AdminUser,
  type MarketListItem,
  type MarketOutcome,
} from "@/lib/api";

// Interface definitions
interface Team {
  id: number;
  name: string;
  short_name: string;
}

interface Game {
  id?: number;
  game_date: string;
  game_time: string;
  home_team_id: number;
  away_team_id: number;
  home_pitcher: string;
  away_pitcher: string;
  home_score: number | null;
  away_score: number | null;
  game_status: "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELED";
}

// Utility function to get KST date
const getKSTDate = (offsetDays = 0): string => {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000); // KST is UTC+9
  kst.setDate(kst.getDate() + offsetDays);
  return kst.toISOString().split("T")[0];
};

interface InitialPricesFormState {
  HOME: string;
  AWAY: string;
  DRAW: string;
}

const DEFAULT_INITIAL_PRICES: InitialPricesFormState = {
  HOME: "47.5",
  AWAY: "47.5",
  DRAW: "5.0",
};

const formatNumber = (value: number) => value.toLocaleString("ko-KR");

const formatDateLabel = (date: string) => {
  const parsed = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
};

const formatDateTimeLabel = (date: string, time: string | null) => {
  const safeTime = time ?? "";
  return `${formatDateLabel(date)} ${safeTime}`.trim();
};

// Match Management Component
function MatchManagement({
  selectedDate,
}: {
  selectedDate: "today" | "tomorrow" | "yesterday";
}) {
  const [games, setGames] = useState<Game[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [initialPrices, setInitialPrices] = useState<InitialPricesFormState>(
    DEFAULT_INITIAL_PRICES
  );
  const supabase = createClient();
  const isMobile = useIsMobile();

  // Calculate target date based on selected period
  const targetDate =
    selectedDate === "yesterday"
      ? getKSTDate(-1)
      : selectedDate === "tomorrow"
      ? getKSTDate(1)
      : getKSTDate(0);

  const fetchTeams = async () => {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching teams:", error);
    } else {
      setTeams(data || []);
    }
  };

  const fetchGames = async () => {
    setLoading(true);
    setSaveMessage(null);
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("game_date", targetDate)
      .order("game_time");

    if (error) {
      console.error("Error fetching games:", error);
    } else {
      setGames(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTeams();
    fetchGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDate]);

  const addNewGame = () => {
    const newGame: Game = {
      game_date: targetDate,
      game_time: "19:00",
      home_team_id: teams[0]?.id || 0,
      away_team_id: teams[1]?.id || 0,
      home_pitcher: "",
      away_pitcher: "",
      home_score: null,
      away_score: null,
      game_status: "SCHEDULED",
    };
    setGames([...games, newGame]);
  };

  const updateGame = (
    index: number,
    field: keyof Game,
    value: string | number | null
  ) => {
    const updatedGames = [...games];
    updatedGames[index] = { ...updatedGames[index], [field]: value };
    setGames(updatedGames);
  };

  const removeGame = (index: number) => {
    const updatedGames = games.filter((_, i) => i !== index);
    setGames(updatedGames);
  };

  const updateInitialPrice = (
    outcome: keyof InitialPricesFormState,
    value: string
  ) => {
    setInitialPrices((prev) => ({
      ...prev,
      [outcome]: value,
    }));
  };

  const parseInitialPrices = () => {
    const home = Number(initialPrices.HOME);
    const away = Number(initialPrices.AWAY);
    const draw = Number(initialPrices.DRAW);

    if (
      !Number.isFinite(home) ||
      !Number.isFinite(away) ||
      !Number.isFinite(draw)
    ) {
      throw new Error("초기 가격은 숫자로 입력해주세요.");
    }

    if (home <= 0 || away <= 0 || draw <= 0) {
      throw new Error("초기 가격은 모두 0보다 커야 합니다.");
    }

    const total = home + away + draw;
    if (Math.abs(total - 100) > 0.000001) {
      throw new Error("HOME + AWAY + DRAW 합계는 100이어야 합니다.");
    }

    return {
      HOME: home,
      AWAY: away,
      DRAW: draw,
    };
  };

  const autoFillMatches = async () => {
    try {
      setLoading(true);

      console.log(new Date(targetDate));
      // Call the API function to get game data
      const crawledData: CrawledGame[] | null = await getGameData(
        new Date(targetDate)
      );

      if (!crawledData) {
        console.error("Error calling getGameData function");
        alert("Error fetching match data. Please try again.");
        return;
      }

      // First, get team name to ID mappings
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("id, name, short_name");

      if (teamsError) {
        console.error("Error fetching teams:", teamsError);
        alert("Error fetching team data.");
        return;
      }

      const teamNameToId = new Map<string, number>();
      teamsData.forEach((team) => {
        teamNameToId.set(team.name, team.id);
        teamNameToId.set(team.short_name, team.id);
      });

      // Convert crawled data to Game objects
      const crawledGames: Game[] = [];
      const unmatchedTeams: string[] = [];

      crawledData.forEach((match: CrawledGame) => {
        const homeTeamId = teamNameToId.get(match.homeTeam);
        const awayTeamId = teamNameToId.get(match.awayTeam);

        if (!homeTeamId) {
          unmatchedTeams.push(match.homeTeam);
        }
        if (!awayTeamId) {
          unmatchedTeams.push(match.awayTeam);
        }

        crawledGames.push({
          game_date: targetDate,
          game_time: match.startTime,
          home_team_id: homeTeamId || 0,
          away_team_id: awayTeamId || 0,
          home_pitcher: match.homePitcher || "",
          away_pitcher: match.awayPitcher || "",
          home_score: match.score ? match.score.home || 0 : 0,
          away_score: match.score ? match.score.away || 0 : 0,
          game_status: match.status,
        });
      });

      // Merge with existing games
      const updatedGames = [...games];

      crawledGames.forEach((crawledGame) => {
        // Find if there's an existing game with same home and away teams
        const existingIndex = updatedGames.findIndex(
          (game) =>
            game.home_team_id === crawledGame.home_team_id &&
            game.away_team_id === crawledGame.away_team_id
        );

        if (existingIndex >= 0) {
          // Update existing game (keep the ID)
          updatedGames[existingIndex] = {
            ...updatedGames[existingIndex],
            game_time: crawledGame.game_time,
            home_pitcher: crawledGame.home_pitcher,
            away_pitcher: crawledGame.away_pitcher,
            home_score: crawledGame.home_score,
            away_score: crawledGame.away_score,
            game_status: crawledGame.game_status,
          };
        } else {
          // Add new game
          updatedGames.push(crawledGame);
        }
      });

      setGames(updatedGames);

      const newMatchesCount = crawledGames.length;
      const updatedMatchesCount = crawledGames.filter((crawledGame) =>
        games.some(
          (game) =>
            game.home_team_id === crawledGame.home_team_id &&
            game.away_team_id === crawledGame.away_team_id
        )
      ).length;

      let message = `자동 채우기 완료! ${
        newMatchesCount - updatedMatchesCount
      }개의 새로운 경기가 추가되었고, ${updatedMatchesCount}개의 기존 경기가 업데이트되었습니다.`;

      if (unmatchedTeams.length > 0) {
        const uniqueUnmatchedTeams = [...new Set(unmatchedTeams)];
        message += `\n\n경고: 일부 팀이 데이터베이스에서 찾을 수 없었고 ID 0으로 설정되었습니다: ${uniqueUnmatchedTeams.join(
          ", "
        )}`;
      }

      message += "\n\n변경 사항을 검토하고 저장해 주세요.";
      alert(message);
    } catch (error) {
      console.error("Error auto-filling matches:", error);
      alert("Error auto-filling matches. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const saveGames = async () => {
    try {
      setLoading(true);
      setSaveMessage(null);

      const parsedInitialPrices = parseInitialPrices();

      // Separate games with and without IDs
      const existingGames = games.filter((game) => game.id);
      const newGames = games.filter((game) => !game.id);
      const existingGameIds = existingGames
        .map((game) => Number(game.id))
        .filter((gameId) => Number.isFinite(gameId) && gameId > 0);
      const insertedGameIds: number[] = [];

      // Update existing games
      for (const game of existingGames) {
        const { id, ...gameData } = game;
        const { error } = await supabase
          .from("games")
          .update(gameData)
          .eq("id", id);

        if (error) {
          console.error("Error updating game:", error);
          throw error;
        }
      }

      // Insert new games
      if (newGames.length > 0) {
        const { data, error } = await supabase
          .from("games")
          .insert(newGames)
          .select("id");

        if (error) {
          console.error("Error inserting games:", error);
          throw error;
        }

        (data ?? []).forEach((row) => {
          const parsed = Number((row as { id: number | string }).id);
          if (Number.isFinite(parsed) && parsed > 0) {
            insertedGameIds.push(parsed);
          }
        });
      }

      const gameIdsForMarketSync = [...existingGameIds, ...insertedGameIds];
      const marketSyncResult = await ensureMarketsForGames(
        gameIdsForMarketSync,
        parsedInitialPrices
      );

      // Refresh the games list
      await fetchGames();
      setSaveMessage({
        type: "success",
        text: `경기 저장 완료. ${marketSyncResult.createdCount}개 마켓이 자동 생성되었고 ${marketSyncResult.skippedCount}개는 기존 마켓을 유지했습니다.`,
      });
    } catch (error) {
      console.error("Save error:", error);
      setSaveMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "경기 저장 중 오류가 발생했습니다.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center">Loading...</div>;
  }

  const matchLabel =
    selectedDate === "today"
      ? "Today's"
      : selectedDate === "tomorrow"
      ? "Tomorrow's"
      : "Yesterday's";

  return (
    <div className="space-y-6">
      <div
        className={`${
          isMobile ? "space-y-4" : "flex justify-between items-center"
        }`}
      >
        <h2 className={`font-bold ${isMobile ? "text-xl" : "text-2xl"}`}>
          {matchLabel} Matches ({targetDate})
        </h2>
        <div
          className={`${
            isMobile ? "flex flex-col space-y-2" : "flex space-x-2"
          }`}
        >
          <Button
            onClick={autoFillMatches}
            variant="secondary"
            disabled={loading}
            className={isMobile ? "w-full" : ""}
          >
            {loading ? "Auto-filling..." : "자동 채우기"}
          </Button>
          <Button
            onClick={addNewGame}
            variant="outline"
            className={isMobile ? "w-full" : ""}
          >
            새 경기 추가
          </Button>
          <Button
            onClick={saveGames}
            disabled={loading}
            className={isMobile ? "w-full" : ""}
          >
            {loading ? "Saving..." : "변경 사항 저장하기"}
          </Button>
        </div>
      </div>

      {saveMessage ? (
        <div
          className={`rounded-lg p-3 text-sm ${
            saveMessage.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {saveMessage.text}
        </div>
      ) : null}

      <Card className={isMobile ? "p-4" : "p-6"}>
        <h3 className="font-semibold text-black mb-2">마켓 초기 가격 설정</h3>
        <p className="text-sm text-muted-foreground mb-4">
          경기 저장 시 마켓 자동 생성에 사용할 초기 가격입니다. 합계는 100이어야
          합니다.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="initial-home" className="block mb-2">
              HOME
            </Label>
            <Input
              id="initial-home"
              type="number"
              step="0.1"
              min="0.1"
              value={initialPrices.HOME}
              onChange={(event) => updateInitialPrice("HOME", event.target.value)}
              className="text-black"
            />
          </div>
          <div>
            <Label htmlFor="initial-away" className="block mb-2">
              AWAY
            </Label>
            <Input
              id="initial-away"
              type="number"
              step="0.1"
              min="0.1"
              value={initialPrices.AWAY}
              onChange={(event) => updateInitialPrice("AWAY", event.target.value)}
              className="text-black"
            />
          </div>
          <div>
            <Label htmlFor="initial-draw" className="block mb-2">
              DRAW
            </Label>
            <Input
              id="initial-draw"
              type="number"
              step="0.1"
              min="0.1"
              value={initialPrices.DRAW}
              onChange={(event) => updateInitialPrice("DRAW", event.target.value)}
              className="text-black"
            />
          </div>
        </div>
      </Card>

      {games.length === 0 ? (
        <Card className={`text-center ${isMobile ? "p-4" : "p-6"}`}>
          <p
            className={`text-muted-foreground mb-4 ${
              isMobile ? "text-sm" : ""
            }`}
          >
            해당 날짜의 경기가 없습니다. 새 경기를 추가하거나 자동 채우기를
            시도해 주세요.
          </p>
          <div
            className={`${isMobile ? "flex flex-col space-y-2" : "space-x-2"}`}
          >
            <Button
              onClick={autoFillMatches}
              disabled={loading}
              className={isMobile ? "w-full" : ""}
            >
              {loading ? "Auto-filling..." : "자동 채우기"}
            </Button>
            <Button
              onClick={addNewGame}
              variant="outline"
              className={isMobile ? "w-full" : ""}
            >
              수동으로 추가하기
            </Button>
          </div>
          <p
            className={`text-xs text-muted-foreground mt-4 ${
              isMobile ? "text-xs" : ""
            }`}
          >
            💡 자동 채우기를 여러 번 클릭하지 마시고, 결과가 나올 때까지
            기다려주세요.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {games.map((game, index) => (
            <Card key={index} className={isMobile ? "p-4" : "p-6"}>
              {isMobile ? (
                // Mobile layout: Stack all fields vertically with logical grouping
                <div className="space-y-4">
                  {/* Game Time and Status */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label
                        htmlFor={`time-${index}`}
                        className="text-sm font-medium"
                      >
                        경기 시간
                      </Label>
                      <DefaultInput
                        id={`time-${index}`}
                        type="time"
                        value={game.game_time}
                        onChange={(e) =>
                          updateGame(index, "game_time", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor={`status-${index}`}
                        className="text-sm font-medium"
                      >
                        경기 상태
                      </Label>
                      <Select
                        id={`status-${index}`}
                        value={game.game_status}
                        onChange={(e) =>
                          updateGame(
                            index,
                            "game_status",
                            e.target.value as
                              | "SCHEDULED"
                              | "IN_PROGRESS"
                              | "FINISHED"
                              | "CANCELED"
                          )
                        }
                      >
                        <option value="SCHEDULED">시작 전</option>
                        <option value="IN_PROGRESS">경기 중</option>
                        <option value="FINISHED">경기 종료</option>
                        <option value="CANCELED">취소</option>
                      </Select>
                    </div>
                  </div>

                  {/* Teams */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label
                        htmlFor={`away-team-${index}`}
                        className="text-sm font-medium"
                      >
                        원정 팀
                      </Label>
                      <Select
                        id={`away-team-${index}`}
                        value={game.away_team_id}
                        onChange={(e) =>
                          updateGame(
                            index,
                            "away_team_id",
                            parseInt(e.target.value)
                          )
                        }
                      >
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor={`home-team-${index}`}
                        className="text-sm font-medium"
                      >
                        홈 팀
                      </Label>
                      <Select
                        id={`home-team-${index}`}
                        value={game.home_team_id}
                        onChange={(e) =>
                          updateGame(
                            index,
                            "home_team_id",
                            parseInt(e.target.value)
                          )
                        }
                      >
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  {/* Pitchers */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label
                        htmlFor={`away-pitcher-${index}`}
                        className="text-sm font-medium"
                      >
                        원정 팀 선발 투수
                      </Label>
                      <DefaultInput
                        id={`away-pitcher-${index}`}
                        value={game.away_pitcher}
                        onChange={(e) =>
                          updateGame(index, "away_pitcher", e.target.value)
                        }
                        placeholder="투수 이름"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor={`home-pitcher-${index}`}
                        className="text-sm font-medium"
                      >
                        홈 팀 선발 투수
                      </Label>
                      <DefaultInput
                        id={`home-pitcher-${index}`}
                        value={game.home_pitcher}
                        onChange={(e) =>
                          updateGame(index, "home_pitcher", e.target.value)
                        }
                        placeholder="투수 이름"
                      />
                    </div>
                  </div>

                  {/* Scores */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label
                        htmlFor={`away-score-${index}`}
                        className="text-sm font-medium"
                      >
                        원정 팀 점수
                      </Label>
                      <DefaultInput
                        id={`away-score-${index}`}
                        type="number"
                        min="0"
                        value={game.away_score || ""}
                        onChange={(e) =>
                          updateGame(
                            index,
                            "away_score",
                            e.target.value ? parseInt(e.target.value) : null
                          )
                        }
                        placeholder="점수"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor={`home-score-${index}`}
                        className="text-sm font-medium"
                      >
                        홈 팀 점수
                      </Label>
                      <DefaultInput
                        id={`home-score-${index}`}
                        type="number"
                        min="0"
                        value={game.home_score || ""}
                        onChange={(e) =>
                          updateGame(
                            index,
                            "home_score",
                            e.target.value ? parseInt(e.target.value) : null
                          )
                        }
                        placeholder="점수"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                // Desktop layout: Original grid layout
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`time-${index}`}>경기 시작 시간</Label>
                    <DefaultInput
                      id={`time-${index}`}
                      type="time"
                      value={game.game_time}
                      onChange={(e) =>
                        updateGame(index, "game_time", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`away-team-${index}`}>원정 팀</Label>
                    <Select
                      id={`away-team-${index}`}
                      value={game.away_team_id}
                      onChange={(e) =>
                        updateGame(
                          index,
                          "away_team_id",
                          parseInt(e.target.value)
                        )
                      }
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`away-pitcher-${index}`}>
                      원정 팀 선발 투수
                    </Label>
                    <DefaultInput
                      id={`away-pitcher-${index}`}
                      value={game.away_pitcher}
                      onChange={(e) =>
                        updateGame(index, "away_pitcher", e.target.value)
                      }
                      placeholder="Away pitcher name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`away-score-${index}`}>원정 팀 점수</Label>
                    <DefaultInput
                      id={`away-score-${index}`}
                      type="number"
                      min="0"
                      value={game.away_score || ""}
                      onChange={(e) =>
                        updateGame(
                          index,
                          "away_score",
                          e.target.value ? parseInt(e.target.value) : null
                        )
                      }
                      placeholder="Score"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`status-${index}`}>경기 상태</Label>
                    <Select
                      id={`status-${index}`}
                      value={game.game_status}
                      onChange={(e) =>
                        updateGame(
                          index,
                          "game_status",
                          e.target.value as
                            | "SCHEDULED"
                            | "IN_PROGRESS"
                            | "FINISHED"
                            | "CANCELED"
                        )
                      }
                    >
                      <option value="SCHEDULED">시작 전</option>
                      <option value="IN_PROGRESS">경기 중</option>
                      <option value="FINISHED">경기 종료</option>
                      <option value="CANCELED">취소</option>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`home-team-${index}`}>홈 팀</Label>
                    <Select
                      id={`home-team-${index}`}
                      value={game.home_team_id}
                      onChange={(e) =>
                        updateGame(
                          index,
                          "home_team_id",
                          parseInt(e.target.value)
                        )
                      }
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`home-pitcher-${index}`}>
                      홈 팀 선발 투수
                    </Label>
                    <DefaultInput
                      id={`home-pitcher-${index}`}
                      value={game.home_pitcher}
                      onChange={(e) =>
                        updateGame(index, "home_pitcher", e.target.value)
                      }
                      placeholder="Home pitcher name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`home-score-${index}`}>홈 팀 점수</Label>
                    <DefaultInput
                      id={`home-score-${index}`}
                      type="number"
                      min="0"
                      value={game.home_score || ""}
                      onChange={(e) =>
                        updateGame(
                          index,
                          "home_score",
                          e.target.value ? parseInt(e.target.value) : null
                        )
                      }
                      placeholder="Score"
                    />
                  </div>
                </div>
              )}

              <div
                className={`${
                  isMobile ? "flex justify-center" : "flex justify-end"
                } mt-4`}
              >
                <Button
                  variant="destructive"
                  onClick={() => removeGame(index)}
                  size="sm"
                  className={isMobile ? "w-full" : ""}
                >
                  경기 삭제하기
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Simple Modal Component
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-black">{title}</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </Button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// Forced Calculation Component
function ForcedCalculation() {
  const [selectedDate, setSelectedDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const supabase = createClient();
  const isMobile = useIsMobile();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) return;

    setIsLoading(true);
    try {
      const { error } = await supabase.rpc("calculate_daily_matches", {
        calc_date: selectedDate,
      });

      if (error) {
        console.error("Error calling calculate_daily_matches:", error);
        setModalMessage(`오류가 발생했습니다: ${error.message}`);
      } else {
        setModalMessage("완료되었습니다!");
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setModalMessage("예상치 못한 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
      setIsModalOpen(true);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalMessage("");
  };

  return (
    <div>
      <div className="mb-6">
        <h2
          className={`font-bold text-black ${
            isMobile ? "text-xl" : "text-2xl"
          }`}
        >
          특정 날짜 매치 강제 계산
        </h2>
        <p className="text-muted-foreground mt-2">
          특정 날짜의 매치를 강제로 계산합니다.
        </p>
      </div>

      <Card className={isMobile ? "p-4" : "p-6"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="date-picker" className="block mb-2">
              날짜 선택
            </Label>
            <Input
              id="date-picker"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
              className="w-full text-black"
              disabled={isLoading}
            />
          </div>

          <Button
            type="submit"
            disabled={!selectedDate || isLoading}
            className={`${isMobile ? "w-full" : ""}`}
          >
            {isLoading ? "계산 중..." : "매치 계산 실행"}
          </Button>
        </form>
      </Card>

      <Modal isOpen={isModalOpen} onClose={closeModal} title="계산 결과">
        <div className="text-center">
          <p className="text-gray-700 mb-4">{modalMessage}</p>
          <Button onClick={closeModal} className="w-full">
            확인
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function LiquiditySettingsManagement() {
  const isMobile = useIsMobile();
  const [currentB, setCurrentB] = useState<number | null>(null);
  const [nextB, setNextB] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchLiquidityB = async () => {
    try {
      setLoading(true);
      const currentValue = await getLiquidityB();
      setCurrentB(currentValue);
      setNextB(String(currentValue));
    } catch (error) {
      console.error("Failed to fetch liquidity b setting:", error);
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "현재 b값을 불러오지 못했습니다.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLiquidityB();
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const parsed = Number(nextB);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMessage({
        type: "error",
        text: "b값은 0보다 큰 숫자여야 합니다.",
      });
      return;
    }

    setSaving(true);
    try {
      const result = await updateLiquidityB(parsed);
      setCurrentB(result.currentB);
      setNextB(String(result.currentB));
      setMessage({
        type: "success",
        text: `유동성 b값이 ${result.previousB} → ${result.currentB} 로 변경되었습니다. 이후 생성되는 마켓부터 적용됩니다.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "b값 저장 중 오류가 발생했습니다.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h2
          className={`font-bold text-black ${
            isMobile ? "text-xl" : "text-2xl"
          }`}
        >
          유동성(b값) 설정
        </h2>
        <p className="text-muted-foreground mt-2">
          전역 b값을 변경하면 이후 생성되는 마켓부터 적용됩니다.
        </p>
      </div>

      {message ? (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <Card className={isMobile ? "p-4" : "p-6"}>
        {loading ? (
          <p className="text-sm text-muted-foreground">현재 b값을 불러오는 중...</p>
        ) : (
          <form
            onSubmit={handleSave}
            className={`${isMobile ? "space-y-3" : "flex items-end gap-3"}`}
          >
            <div className="flex-1">
              <Label htmlFor="liquidity-current" className="block mb-2">
                현재 b값
              </Label>
              <Input
                id="liquidity-current"
                value={currentB ?? "-"}
                disabled
                className="text-black"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="liquidity-next" className="block mb-2">
                변경할 b값
              </Label>
              <Input
                id="liquidity-next"
                type="number"
                step="0.1"
                min="0.1"
                value={nextB}
                onChange={(event) => setNextB(event.target.value)}
                disabled={saving}
                className="text-black"
              />
            </div>
            <Button type="submit" disabled={saving} className="h-12 rounded-lg">
              {saving ? "저장 중..." : "b값 저장"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

function MarketSettlementManagement() {
  const isMobile = useIsMobile();
  const [selectedDate, setSelectedDate] = useState(getKSTDate(0));
  const [markets, setMarkets] = useState<MarketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMarketId, setActiveMarketId] = useState<number | null>(null);
  const [selectedResults, setSelectedResults] = useState<
    Record<number, MarketOutcome>
  >({});
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const getDefaultOutcome = (market: MarketListItem): MarketOutcome => {
    const result = market.result?.toUpperCase();
    if (result === "HOME" || result === "AWAY" || result === "DRAW") {
      return result;
    }

    return "HOME";
  };

  const fetchMarkets = async () => {
    try {
      setLoading(true);
      const marketList = await getMarketListForDate(selectedDate);
      setMarkets(marketList);
      setSelectedResults((prev) => {
        const next = { ...prev };
        marketList.forEach((market) => {
          if (!next[market.id]) {
            next[market.id] = getDefaultOutcome(market);
          }
        });
        return next;
      });
    } catch (error) {
      console.error("Failed to fetch market list for admin:", error);
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "마켓 목록 조회 중 오류가 발생했습니다.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMarkets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const updateSelectedResult = (marketId: number, value: string) => {
    if (value !== "HOME" && value !== "AWAY" && value !== "DRAW") {
      return;
    }

    setSelectedResults((prev) => ({
      ...prev,
      [marketId]: value,
    }));
  };

  const runSettle = async (market: MarketListItem) => {
    setMessage(null);
    setActiveMarketId(market.id);
    try {
      const targetResult = selectedResults[market.id] ?? "HOME";
      const result = await settleMarket(market.id, targetResult);
      setMessage({
        type: "success",
        text: `정산 완료: ${market.homeTeamName} vs ${market.awayTeamName} (${targetResult}) / ${formatNumber(result.totalUsersSettled)}명, 총 ${formatNumber(result.totalCoinsDistributed)} 코인 배분`,
      });
      await fetchMarkets();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "마켓 정산 중 오류가 발생했습니다.",
      });
    } finally {
      setActiveMarketId(null);
    }
  };

  const runClose = async (market: MarketListItem) => {
    setMessage(null);
    setActiveMarketId(market.id);
    try {
      await closeMarket(market.id);
      setMessage({
        type: "success",
        text: `${market.homeTeamName} vs ${market.awayTeamName} 마켓을 CLOSED로 변경했습니다.`,
      });
      await fetchMarkets();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "마켓 종료 중 오류가 발생했습니다.",
      });
    } finally {
      setActiveMarketId(null);
    }
  };

  const runCancel = async (market: MarketListItem) => {
    const confirmed = window.confirm(
      "마켓을 취소하면 모든 유저의 보유 포지션이 원가로 환급됩니다. 계속할까요?"
    );
    if (!confirmed) {
      return;
    }

    setMessage(null);
    setActiveMarketId(market.id);
    try {
      const result = await cancelMarket(market.id);
      setMessage({
        type: "success",
        text: `${market.homeTeamName} vs ${market.awayTeamName} 취소 완료: ${formatNumber(result.totalUsersRefunded ?? 0)}명에게 총 ${formatNumber(result.totalRefunded ?? 0)} 코인 환급`,
      });
      await fetchMarkets();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "마켓 취소 중 오류가 발생했습니다.",
      });
    } finally {
      setActiveMarketId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h2
          className={`font-bold text-black ${
            isMobile ? "text-xl" : "text-2xl"
          }`}
        >
          마켓 정산/상태 관리
        </h2>
        <p className="text-muted-foreground mt-2">
          결과 정산(settle_market)과 마켓 강제 종료(CLOSE), 취소(CANCEL)를
          관리합니다.
        </p>
      </div>

      {message ? (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <Card className={isMobile ? "p-4" : "p-6"}>
        <div className={`${isMobile ? "space-y-3" : "flex items-end gap-3"}`}>
          <div className="flex-1">
            <Label htmlFor="market-date" className="block mb-2">
              조회 날짜
            </Label>
            <Input
              id="market-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="text-black"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void fetchMarkets()}
            className="h-12 rounded-lg"
            disabled={loading}
          >
            {loading ? "조회 중..." : "마켓 새로고침"}
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className={isMobile ? "p-4" : "p-6"}>
          <p className="text-sm text-muted-foreground">마켓 목록을 불러오는 중...</p>
        </Card>
      ) : markets.length === 0 ? (
        <Card className={isMobile ? "p-4" : "p-6"}>
          <p className="text-sm text-muted-foreground">
            선택한 날짜에 등록된 마켓이 없습니다.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {markets.map((market) => {
            const isSettled = market.marketStatus === "SETTLED";
            const isCanceled = market.marketStatus === "CANCELED";
            const isClosed = market.marketStatus === "CLOSED";
            const isOpen = market.marketStatus === "OPEN";
            const isActionLoading = activeMarketId === market.id;

            return (
              <Card key={market.id} className={isMobile ? "p-4" : "p-6"}>
                <div className="space-y-4">
                  <div>
                    <div className="font-semibold text-black">
                      {market.homeTeamName} vs {market.awayTeamName}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateTimeLabel(market.gameDate, market.gameTime)} | 상태:{" "}
                      {market.marketStatus}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      현재가 HOME {market.prices.HOME.toFixed(1)} / AWAY{" "}
                      {market.prices.AWAY.toFixed(1)} / DRAW{" "}
                      {market.prices.DRAW.toFixed(1)}
                    </p>
                  </div>

                  <div
                    className={`${
                      isMobile ? "space-y-2" : "grid grid-cols-4 gap-2 items-end"
                    }`}
                  >
                    <div className={`${isMobile ? "" : "col-span-2"}`}>
                      <Label htmlFor={`settle-result-${market.id}`} className="mb-2 block">
                        정산 결과
                      </Label>
                      <Select
                        id={`settle-result-${market.id}`}
                        value={selectedResults[market.id] ?? "HOME"}
                        onChange={(event) =>
                          updateSelectedResult(market.id, event.target.value)
                        }
                        disabled={isSettled || isCanceled || isActionLoading}
                      >
                        <option value="HOME">HOME</option>
                        <option value="AWAY">AWAY</option>
                        <option value="DRAW">DRAW</option>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      onClick={() => void runSettle(market)}
                      disabled={isSettled || isCanceled || isActionLoading}
                      className="h-12 rounded-lg"
                    >
                      {isActionLoading ? "처리 중..." : "정산 실행"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void runClose(market)}
                      disabled={!isOpen || isActionLoading}
                      className="h-12 rounded-lg"
                    >
                      CLOSE
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void runCancel(market)}
                    disabled={isSettled || isCanceled || isActionLoading}
                    className="h-12 w-full rounded-lg"
                  >
                    {isActionLoading ? "처리 중..." : "CANCEL (원가 환급)"}
                  </Button>

                  {isClosed ? (
                    <p className="text-xs text-amber-600">
                      CLOSED 상태입니다. 결과를 선택해 정산하거나 필요 시 취소할 수
                      있습니다.
                    </p>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CoinGrantManagement() {
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [studentNumberInput, setStudentNumberInput] = useState("");
  const [allAmount, setAllAmount] = useState("1000");
  const [singleAmount, setSingleAmount] = useState("1000");
  const [allLoading, setAllLoading] = useState(false);
  const [singleLoading, setSingleLoading] = useState(false);
  const [cronLoading, setCronLoading] = useState(true);
  const [cronStatus, setCronStatus] = useState<{
    cronEnabled: boolean;
    jobName: string | null;
    lastRunAt: string | null;
    lastStatus: string | null;
    message: string | null;
  } | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const refreshCronStatus = async () => {
    try {
      setCronLoading(true);
      const status = await getWeeklyCoinCronStatus();
      setCronStatus(status);
    } catch (error) {
      console.error("Failed to fetch cron status:", error);
      setCronStatus({
        cronEnabled: false,
        jobName: null,
        lastRunAt: null,
        lastStatus: null,
        message:
          error instanceof Error
            ? error.message
            : "pg_cron 상태를 불러오지 못했습니다.",
      });
    } finally {
      setCronLoading(false);
    }
  };

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setUsersLoading(true);
        const userList = await getUsersForAdmin();
        setUsers(userList);
      } catch (error) {
        console.error("Failed to fetch users for coin grant:", error);
        setMessage({
          type: "error",
          text: "유저 목록 조회에 실패했습니다.",
        });
      } finally {
        setUsersLoading(false);
      }
    };

    void refreshCronStatus();
    void fetchUsers();
  }, []);

  const parseAmount = (raw: string) => {
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }
    return amount;
  };

  const handleGrantAll = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const amount = parseAmount(allAmount);
    if (amount === null) {
      setMessage({
        type: "error",
        text: "전체 지급 금액은 0보다 큰 숫자여야 합니다.",
      });
      return;
    }

    setAllLoading(true);
    try {
      const result = await distributeWeeklyCoins(amount);
      setMessage({
        type: "success",
        text: `전체 지급 완료: ${result.users_count.toLocaleString()}명에게 총 ${result.total_distributed.toLocaleString()} 코인 지급`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "전체 코인 지급 중 오류가 발생했습니다.",
      });
    } finally {
      setAllLoading(false);
    }
  };

  const handleGrantSingleUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const normalizedStudentNumber = studentNumberInput.trim();
    if (!normalizedStudentNumber) {
      setMessage({
        type: "error",
        text: "학번을 입력해주세요.",
      });
      return;
    }

    const amount = parseAmount(singleAmount);
    if (amount === null) {
      setMessage({
        type: "error",
        text: "개별 지급 금액은 0보다 큰 숫자여야 합니다.",
      });
      return;
    }

    const selectedUser = users.find(
      (user) => String(user.student_number) === normalizedStudentNumber
    );
    if (!selectedUser) {
      setMessage({
        type: "error",
        text: "입력한 학번의 유저를 찾을 수 없습니다.",
      });
      return;
    }

    setSingleLoading(true);
    try {
      const result = await adminGrantCoins(selectedUser.id, amount);
      setMessage({
        type: "success",
        text: `${selectedUser.username}(${selectedUser.student_number})에게 ${result.granted_amount.toLocaleString()} 코인 지급 완료 (현재 잔고 ${result.new_balance.toLocaleString()})`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "개별 코인 지급 중 오류가 발생했습니다.",
      });
    } finally {
      setSingleLoading(false);
    }
  };

  const formatCronDateTime = (value: string | null) => {
    if (!value) {
      return "기록 없음";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h2
          className={`font-bold text-black ${
            isMobile ? "text-xl" : "text-2xl"
          }`}
        >
          코인 지급 관리
        </h2>
        <p className="text-muted-foreground mt-2">
          자동 지급(매주 월요일 00:00 KST, cron 설정 시)과 수동 지급을 관리합니다.
        </p>
      </div>

      {message ? (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <Card className={isMobile ? "p-4" : "p-6"}>
        <div className={`${isMobile ? "space-y-3" : "flex items-center justify-between"}`}>
          <div>
            <h3 className="font-semibold text-black mb-2">pg_cron 자동 지급 상태</h3>
            {cronLoading ? (
              <p className="text-sm text-muted-foreground">상태 조회 중...</p>
            ) : (
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  활성화: {cronStatus?.cronEnabled ? "ON" : "OFF"} / 작업명:{" "}
                  {cronStatus?.jobName ?? "weekly_coin_distribution"}
                </p>
                <p>
                  마지막 자동 지급 시각:{" "}
                  {formatCronDateTime(cronStatus?.lastRunAt ?? null)}
                </p>
                <p>마지막 실행 상태: {cronStatus?.lastStatus ?? "기록 없음"}</p>
                {cronStatus?.message ? <p>{cronStatus.message}</p> : null}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshCronStatus()}
            className="h-12 rounded-lg"
            disabled={cronLoading}
          >
            {cronLoading ? "조회 중..." : "상태 새로고침"}
          </Button>
        </div>
      </Card>

      <Card className={isMobile ? "p-4" : "p-6"}>
        <h3 className="font-semibold text-black mb-2">전체 유저 코인 지급</h3>
        <p className="text-sm text-muted-foreground mb-4">
          distribute_weekly_coins(p_amount) RPC를 즉시 실행합니다.
        </p>
        <form
          onSubmit={handleGrantAll}
          className={`${isMobile ? "space-y-3" : "flex items-end gap-3"}`}
        >
          <div className="flex-1">
            <Label htmlFor="all-amount" className="block mb-2">
              지급 금액
            </Label>
            <Input
              id="all-amount"
              type="number"
              min="1"
              value={allAmount}
              onChange={(event) => setAllAmount(event.target.value)}
              disabled={allLoading}
              className="text-black"
            />
          </div>
          <Button type="submit" disabled={allLoading} className="h-12 rounded-lg">
            {allLoading ? "지급 중..." : "전체 지급 실행"}
          </Button>
        </form>
      </Card>

      <Card className={isMobile ? "p-4" : "p-6"}>
        <h3 className="font-semibold text-black mb-2">특정 유저 코인 지급</h3>
        <p className="text-sm text-muted-foreground mb-4">
          학번 + 금액으로 admin_grant_coins(p_user_id, p_amount) RPC를 실행합니다.
        </p>

        <form
          onSubmit={handleGrantSingleUser}
          className={`${isMobile ? "space-y-3" : "grid grid-cols-3 gap-3"}`}
        >
          <div>
            <Label htmlFor="grant-student-number" className="block mb-2">
              학번
            </Label>
            <Input
              id="grant-student-number"
              type="number"
              value={studentNumberInput}
              onChange={(event) => setStudentNumberInput(event.target.value)}
              disabled={usersLoading || singleLoading}
              className="text-black"
              placeholder="예: 2023123456"
            />
          </div>

          <div>
            <Label htmlFor="single-amount" className="block mb-2">
              지급 금액
            </Label>
            <Input
              id="single-amount"
              type="number"
              min="1"
              value={singleAmount}
              onChange={(event) => setSingleAmount(event.target.value)}
              disabled={singleLoading}
              className="text-black"
            />
          </div>

          <div className={`${isMobile ? "" : "self-end"}`}>
            <Button
              type="submit"
              disabled={singleLoading || usersLoading || users.length === 0}
              className="h-12 w-full rounded-lg"
            >
              {singleLoading ? "지급 중..." : "개별 지급 실행"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// Admin Dashboard Component
function AdminDashboard() {
  const isMobile = useIsMobile();
  const [currentView, setCurrentView] = useState<
    | "dashboard"
    | "today"
    | "tomorrow"
    | "yesterday"
    | "calculate"
    | "coins"
    | "markets"
    | "liquidity"
  >("dashboard");

  const getCurrentKSTTime = () => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const kst = new Date(utc + 9 * 3600000);
    return kst.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  };

  if (currentView !== "dashboard") {
    return (
      <div className={`container mx-auto ${isMobile ? "p-4" : "p-6"}`}>
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => setCurrentView("dashboard")}
            className={`mb-4 ${isMobile ? "w-full" : ""}`}
          >
            ← 메뉴로 돌아가기
          </Button>
          <div className="text-sm text-muted-foreground mb-2">
            현재 시각: {getCurrentKSTTime()}
          </div>
        </div>

        {currentView === "calculate" ? (
          <ForcedCalculation />
        ) : currentView === "coins" ? (
          <CoinGrantManagement />
        ) : currentView === "markets" ? (
          <MarketSettlementManagement />
        ) : currentView === "liquidity" ? (
          <LiquiditySettingsManagement />
        ) : (
          <MatchManagement
            selectedDate={currentView as "today" | "tomorrow" | "yesterday"}
          />
        )}

        <div
          className={`mt-8 ${
            isMobile ? "flex justify-center" : "flex justify-end"
          }`}
        >
          <Button
            variant="outline"
            onClick={() => {
              sessionStorage.removeItem("admin_authenticated");
              window.location.reload();
            }}
            className={isMobile ? "w-full max-w-xs" : ""}
          >
            Logout
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`container mx-auto ${isMobile ? "p-4" : "p-6"}`}>
      <div className="mb-8">
        <h1
          className={`font-bold mb-2 text-black ${
            isMobile ? "text-2xl" : "text-3xl"
          }`}
        >
          ToKHin&apos; 관리자 대시보드
        </h1>
        <p className="text-muted-foreground">
          ToKHin&apos; 관리 대시보드에 오신 것을 환영합니다.
        </p>
        <div className="text-sm text-muted-foreground mt-2">
          현재 시각: {getCurrentKSTTime()}
        </div>
      </div>

      <div
        className={`grid gap-6 ${
          isMobile
            ? "grid-cols-1"
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4"
        }`}
      >
        <Card className={isMobile ? "p-4" : "p-6"}>
          <h3
            className={`font-semibold mb-3 ${isMobile ? "text-lg" : "text-xl"}`}
          >
            어제의 경기
          </h3>
          <p className="text-muted-foreground mb-4">
            어제 경기 정보를 관리합니다.
          </p>
          <Button
            onClick={() => setCurrentView("yesterday")}
            className={isMobile ? "w-full" : ""}
          >
            접속
          </Button>
        </Card>

        <Card className={isMobile ? "p-4" : "p-6"}>
          <h3
            className={`font-semibold mb-3 ${isMobile ? "text-lg" : "text-xl"}`}
          >
            오늘의 경기
          </h3>
          <p className="text-muted-foreground mb-4">
            오늘 경기 정보를 관리합니다.
          </p>
          <Button
            onClick={() => setCurrentView("today")}
            className={isMobile ? "w-full" : ""}
          >
            접속
          </Button>
        </Card>

        <Card className={isMobile ? "p-4" : "p-6"}>
          <h3
            className={`font-semibold mb-3 ${isMobile ? "text-lg" : "text-xl"}`}
          >
            내일의 경기
          </h3>
          <p className="text-muted-foreground mb-4">
            내일 경기 정보를 관리합니다.
          </p>
          <Button
            onClick={() => setCurrentView("tomorrow")}
            className={isMobile ? "w-full" : ""}
          >
            접속
          </Button>
        </Card>

        <Card className={isMobile ? "p-4" : "p-6"}>
          <h3
            className={`font-semibold mb-3 ${isMobile ? "text-lg" : "text-xl"}`}
          >
            특정 날짜 매치 강제 계산
          </h3>
          <p className="text-muted-foreground mb-4">
            특정 날짜의 매치를 강제로 계산합니다.
          </p>
          <Button
            onClick={() => setCurrentView("calculate")}
            className={isMobile ? "w-full" : ""}
          >
            접속
          </Button>
        </Card>

        <Card className={isMobile ? "p-4" : "p-6"}>
          <h3
            className={`font-semibold mb-3 ${isMobile ? "text-lg" : "text-xl"}`}
          >
            마켓 정산/상태 관리
          </h3>
          <p className="text-muted-foreground mb-4">
            정산 실행, CLOSE, CANCEL(원가 환급)을 관리합니다.
          </p>
          <Button
            onClick={() => setCurrentView("markets")}
            className={isMobile ? "w-full" : ""}
          >
            접속
          </Button>
        </Card>

        <Card className={isMobile ? "p-4" : "p-6"}>
          <h3
            className={`font-semibold mb-3 ${isMobile ? "text-lg" : "text-xl"}`}
          >
            유동성(b값) 설정
          </h3>
          <p className="text-muted-foreground mb-4">
            전역 b값을 조회/변경합니다.
          </p>
          <Button
            onClick={() => setCurrentView("liquidity")}
            className={isMobile ? "w-full" : ""}
          >
            접속
          </Button>
        </Card>

        <Card className={isMobile ? "p-4" : "p-6"}>
          <h3
            className={`font-semibold mb-3 ${isMobile ? "text-lg" : "text-xl"}`}
          >
            코인 지급 관리
          </h3>
          <p className="text-muted-foreground mb-4">
            전체 지급 + 학번 기반 개별 지급을 실행합니다.
          </p>
          <Button
            onClick={() => setCurrentView("coins")}
            className={isMobile ? "w-full" : ""}
          >
            접속
          </Button>
        </Card>
      </div>

      <div
        className={`mt-8 ${
          isMobile ? "flex justify-center" : "flex justify-end"
        }`}
      >
        <Button
          variant="outline"
          onClick={() => {
            sessionStorage.removeItem("admin_authenticated");
            window.location.reload();
          }}
          className={isMobile ? "w-full max-w-xs" : ""}
        >
          로그아웃
        </Button>
      </div>
    </div>
  );
}

// Login Form Component
function LoginForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Hash function using Web Crypto API
  async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Hash the input password
      const hashedInput = await hashPassword(password);

      // Get the stored hash from environment variable
      // In production, you'll set NEXT_PUBLIC_ADMIN_PASSWORD_HASH in your environment
      const storedHash = process.env.NEXT_PUBLIC_ADMIN_PASSWORD_HASH;

      if (!storedHash) {
        setError("Admin authentication not configured");
        setIsLoading(false);
        return;
      }

      // Compare hashes
      if (hashedInput === storedHash) {
        // Store authentication state in session storage
        sessionStorage.setItem("admin_authenticated", "true");
        onAuthenticated();
      } else {
        setError("Invalid password");
      }
    } catch (err) {
      console.error("Authentication error:", err);
      setError("Authentication failed");
    }

    setIsLoading(false);
    setPassword(""); // Clear password field for security
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">ToKHin&apos; 관리</h1>
          <p className="text-muted-foreground">
            프런트 인증을 위해 비밀번호를 입력하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              type="password"
              placeholder="운영진 비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              autoFocus
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !password}
          >
            {isLoading ? "인증 중..." : "프런트 인증하기"}
          </Button>
        </form>

        <div className="mt-6 text-xs text-muted-foreground">
          <p>⚠️ 이 메뉴는 루킹 프런트만 접근할 수 있습니다.</p>
        </div>
      </Card>
    </div>
  );
}

// Main Admin Page Component
export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const authenticated =
      sessionStorage.getItem("admin_authenticated") === "true";
    setIsAuthenticated(authenticated);
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return <AdminDashboard />;
}
