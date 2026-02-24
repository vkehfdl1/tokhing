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
  distributeWeeklyCoins,
  getGameData,
  getUsersForAdmin,
  type AdminUser,
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

// Match Management Component
function MatchManagement({
  selectedDate,
}: {
  selectedDate: "today" | "tomorrow" | "yesterday";
}) {
  const [games, setGames] = useState<Game[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
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

      // Separate games with and without IDs
      const existingGames = games.filter((game) => game.id);
      const newGames = games.filter((game) => !game.id);

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
        const { error } = await supabase.from("games").insert(newGames);

        if (error) {
          console.error("Error inserting games:", error);
          throw error;
        }
      }

      // Refresh the games list
      await fetchGames();
      alert("성공적으로 저장되었습니다.");
    } catch (error) {
      alert("Error saving games. Please try again.");
      console.error("Save error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div
        className={`${
          isMobile ? "space-y-4" : "flex justify-between items-center"
        }`}
      >
        <h2 className={`font-bold ${isMobile ? "text-xl" : "text-2xl"}`}>
          {selectedDate === "today" ? "Today's" : "Tomorrow's"} Matches (
          {targetDate})
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

function CoinGrantManagement() {
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [allAmount, setAllAmount] = useState("1000");
  const [singleAmount, setSingleAmount] = useState("1000");
  const [allLoading, setAllLoading] = useState(false);
  const [singleLoading, setSingleLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setUsersLoading(true);
        const userList = await getUsersForAdmin();
        setUsers(userList);
        if (userList.length > 0) {
          setSelectedUserId((prev) => prev || userList[0].id);
        }
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

    if (!selectedUserId) {
      setMessage({
        type: "error",
        text: "지급할 유저를 선택해주세요.",
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

    setSingleLoading(true);
    try {
      const result = await adminGrantCoins(selectedUserId, amount);
      const selectedUser = users.find((user) => user.id === selectedUserId);
      setMessage({
        type: "success",
        text: `${selectedUser?.username || "선택한 유저"}에게 ${result.granted_amount.toLocaleString()} 코인 지급 완료 (현재 잔고 ${result.new_balance.toLocaleString()})`,
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
          admin_grant_coins(p_user_id, p_amount) RPC를 실행합니다.
        </p>

        <form
          onSubmit={handleGrantSingleUser}
          className={`${isMobile ? "space-y-3" : "grid grid-cols-3 gap-3"}`}
        >
          <div>
            <Label htmlFor="grant-user" className="block mb-2">
              대상 유저
            </Label>
            <Select
              id="grant-user"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              disabled={usersLoading || singleLoading || users.length === 0}
            >
              {users.length === 0 ? (
                <option value="">
                  {usersLoading ? "유저 목록 로딩 중..." : "유저 없음"}
                </option>
              ) : (
                users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {String(user.student_number)} - {user.username}
                  </option>
                ))
              )}
            </Select>
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
    "dashboard" | "today" | "tomorrow" | "yesterday" | "calculate" | "coins"
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
            코인 지급 관리
          </h3>
          <p className="text-muted-foreground mb-4">
            전체/개별 유저 코인 수동 지급을 실행합니다.
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
