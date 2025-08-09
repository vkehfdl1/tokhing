"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getUserByStudentId,
  getTodaysGamesWithPredictions,
  getGamesWithPredictionsForDate,
  submitMultiplePredictions,
  getISODate,
} from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/lib/hooks/useResponsive";

// --- TYPE DEFINITIONS ---
type Team = { id: number; name: string };
type Game = {
  id: number;
  home_team: Team;
  away_team: Team;
  home_pitcher: string | null;
  away_pitcher: string | null;
  game_status: "SCHEDULED" | "IN_PROGRESS" | "CANCELED" | "FINISHED";
  home_score: number | null;
  away_score: number | null;
  // prediction is what's already saved in the DB
  prediction: { predicted_winner_team_id: number } | null;
};
type User = { id: string; student_number: string; name: string };
// selectedPick is for UI interaction before submission
type SelectedPick = {
  gameId: number;
  predictedTeamId: number;
  teamName: string;
};

function translateGameStatus(status: string): string {
  switch (status) {
    case "SCHEDULED":
      return "경기 전";
    case "IN_PROGRESS":
      return "예측 마감";
    case "CANCELED":
      return "경기 취소";
    case "FINISHED":
      return "경기 종료";
    default:
      return status;
  }
}

// --- COMPONENT ---
export default function HomePage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [studentId, setStudentId] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [todaysGames, setTodaysGames] = useState<Game[]>([]);
  const [selectedPicks, setSelectedPicks] = useState<Map<number, SelectedPick>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // --- DATA FETCHING & LOGIN ---
  const fetchAndSetGames = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);

    // First, get today's games
    const todayGamesData = await getTodaysGamesWithPredictions(user.id);

    // Check if all today's games are finished
    const allTodayGamesFinished =
      todayGamesData.length > 0 &&
      todayGamesData.every((game) => game.game_status === "FINISHED" || game.game_status === "CANCELED");

    if (allTodayGamesFinished || todayGamesData.length === 0) {
      // Get tomorrow's date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDateString = getISODate(tomorrow);

      // Fetch tomorrow's games
      const tomorrowGamesData = await getGamesWithPredictionsForDate(
        user.id,
        tomorrowDateString
      );

      // If tomorrow has games, use tomorrow's data; otherwise use today's data
      if (tomorrowGamesData.length > 0) {
        // @ts-expect-error - Ignoring type mismatch for gamesData
        setTodaysGames(tomorrowGamesData);
      } else {
        // @ts-expect-error - Ignoring type mismatch for gamesData
        setTodaysGames(todayGamesData);
      }
    } else {
      // Not all games finished, use today's data
      // @ts-expect-error - Ignoring type mismatch for gamesData
      setTodaysGames(todayGamesData);
    }

    setIsLoading(false);
  }, [user]);

  const handleLogin = async () => {
    if (!studentId) {
      setError("Please enter your student ID.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const userData = await getUserByStudentId(studentId);
      setUser(userData);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.message);
      setUser(null);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (user) {
      const fetchGames = async () => {
        await fetchAndSetGames();
        // Clear old picks when a new user logs in
        setSelectedPicks(new Map());
      };
      fetchGames();
    }
  }, [user, fetchAndSetGames]);

  // --- UI HANDLERS ---
  const handleSelectPick = (
    gameId: number,
    predictedTeamId: number,
    teamName: string
  ) => {
    const newPicks = new Map(selectedPicks);
    newPicks.set(gameId, { gameId, predictedTeamId, teamName });
    setSelectedPicks(newPicks);
  };

  const handleConfirmSubmission = async () => {
    if (!user || selectedPicks.size === 0) return;

    const predictionsToSubmit = Array.from(selectedPicks.values()).map((p) => ({
      game_id: p.gameId,
      predicted_winner_team_id: p.predictedTeamId,
    }));

    setShowConfirmation(false);

    try {
      await submitMultiplePredictions(user.id, predictionsToSubmit);

      // Refresh data from server to show the submitted picks
      await fetchAndSetGames();

      setSelectedPicks(new Map()); // Clear selections
    } catch (err) {
      setError("Failed to save predictions. Please try again." + err);
      setIsLoading(false);
    }
  };

  // --- RENDER ---
  return (
    <div className={`w-full mx-auto ${isMobile ? "p-4" : "p-8"}`}>
      <h1
        className={`font-bold text-center text-black mb-8 ${
          isMobile ? "text-xl" : "text-4xl"
        }`}
      >
        오늘의 토킹 승부 예측
      </h1>

      {/* --- LOGIN FORM -- */}
      {!user ? (
        <div>
          <div
            className={`flex gap-4 mb-8 ${isMobile ? "flex-col" : "flex-row"}`}
          >
            <Input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="학번을 입력해 주세요"
              className="flex-grow text-black"
            />
            <Button
              onClick={handleLogin}
              disabled={isLoading}
              className={`px-6 text-base ${isMobile ? "w-full" : ""}`}
            >
              {isLoading ? "로딩 중..." : "로그인"}
            </Button>
          </div>

          {/* Tutorial Button */}
          <div className="text-center mb-8">
            <Button
              variant="ghost"
              onClick={() => router.push("/tutorial")}
              className="text-zinc-500 text-xs underline p-0 h-auto bg-transparent hover:bg-transparent"
            >
              토킹이 처음이라면?
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-center mb-8">
          <h2
            className={`font-semibold text-gray-800 ${
              isMobile ? "text-xl" : "text-2xl"
            }`}
          >
            {user.name}님 환영합니다.
          </h2>
        </div>
      )}

      {error && <p className="text-red-500 text-center mb-4">{error}</p>}
      {user && isLoading && (
        <p className="text-center text-gray-800">Loading games...</p>
      )}

      {/* --- GAMES LIST -- */}
      {user && !isLoading && (
        <div className="space-y-6">
          {todaysGames.map((game) => {
            const hasSubmitted = !!game.prediction;
            const currentPick = selectedPicks.get(game.id);
            const submittedPick = game.prediction?.predicted_winner_team_id;

            return (
              <div
                key={game.id}
                className={`${isMobile ? "p-4" : "p-6"} rounded-xl shadow-md ${
                  game.game_status === "CANCELED"
                    ? "bg-red-50 border-2 border-red-200"
                    : "bg-white"
                }`}
              >
                {isMobile ? (
                  // Mobile Layout
                  <div className="flex flex-col space-y-4 text-gray-800">
                    {/* Game Status at top center */}
                    <div className="text-center">
                      <span className="text-sm text-gray-500">
                        {translateGameStatus(game.game_status)}
                      </span>
                      {game.game_status === "CANCELED" && (
                        <div className="font-bold text-red-500 text-lg mt-1">
                          경기 취소
                        </div>
                      )}
                    </div>

                    {/* Away Team Row */}
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="font-bold text-lg">
                          {game.away_team.name}
                        </span>
                        <span className="text-sm text-gray-500">
                          {game.away_pitcher}
                        </span>
                      </div>
                      <div className="text-right">
                        {(game.game_status === "IN_PROGRESS" ||
                          game.game_status === "FINISHED") && (
                          <span className="font-extrabold text-xl">
                            {game.away_score}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Home Team Row */}
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="font-bold text-lg">
                          {game.home_team.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">
                            {game.home_pitcher}
                          </span>
                          <span className="text-xs bg-gray-100 text-black px-1 py-1 rounded">
                            홈
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        {(game.game_status === "IN_PROGRESS" ||
                          game.game_status === "FINISHED") && (
                          <span className="font-extrabold text-xl">
                            {game.home_score}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Desktop Layout (unchanged)
                  <div className="grid grid-cols-3 items-center text-center text-gray-800">
                    {/* Home Team */}
                    <div className="flex flex-col">
                      <span className="font-bold text-2xl">
                        {game.home_team.name}
                      </span>
                      <span className="text-sm text-gray-500">
                        {game.home_pitcher}
                      </span>
                    </div>

                    {/* Score/VS */}
                    <div className="flex flex-col items-center">
                      <span className="text-sm text-gray-500">
                        {translateGameStatus(game.game_status)}
                      </span>
                      {game.game_status === "IN_PROGRESS" ||
                      game.game_status === "FINISHED" ? (
                        <span className="font-extrabold text-3xl">
                          {game.home_score} - {game.away_score}
                        </span>
                      ) : game.game_status === "CANCELED" ? (
                        <span className="font-bold text-red-500 text-xl">
                          경기 취소
                        </span>
                      ) : (
                        <span className="font-extrabold text-3xl">VS</span>
                      )}
                    </div>

                    {/* Away Team */}
                    <div className="flex flex-col">
                      <span className="font-bold text-2xl">
                        {game.away_team.name}
                      </span>
                      <span className="text-sm text-gray-500">
                        {game.away_pitcher}
                      </span>
                    </div>
                  </div>
                )}

                {game.game_status === "CANCELED" ? (
                  <div className="mt-6 text-center">
                    <p
                      className={`text-gray-800 ${
                        isMobile ? "text-base" : "text-lg"
                      }`}
                    >
                      해당 경기는 취소되었습니다.
                    </p>
                  </div>
                ) : hasSubmitted ? (
                  <div className="mt-6 text-center">
                    <p
                      className={`text-gray-800 ${
                        isMobile ? "text-base" : "text-lg"
                      }`}
                    >
                      부원님의 예측 :{" "}
                      <span className="font-bold">
                        {submittedPick === game.home_team.id
                          ? game.home_team.name
                          : game.away_team.name}
                      </span>
                    </p>
                  </div>
                ) : game.game_status === "SCHEDULED" ? (
                  <div className="mt-6">
                    {isMobile ? (
                      // Mobile: Vertical buttons
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={() =>
                            handleSelectPick(
                              game.id,
                              game.home_team.id,
                              game.home_team.name
                            )
                          }
                          className={`w-full py-3 font-bold rounded-lg transition ${
                            currentPick?.predictedTeamId === game.home_team.id
                              ? "bg-green-600 text-white"
                              : "bg-green-200 text-green-800"
                          } text-sm`}
                        >
                          {game.home_team.name}가 승리한다
                        </button>
                        <button
                          onClick={() =>
                            handleSelectPick(
                              game.id,
                              game.away_team.id,
                              game.away_team.name
                            )
                          }
                          className={`w-full py-3 font-bold rounded-lg transition ${
                            currentPick?.predictedTeamId === game.away_team.id
                              ? "bg-red-600 text-white"
                              : "bg-red-200 text-red-800"
                          } text-sm`}
                        >
                          {game.away_team.name}가 승리한다
                        </button>
                      </div>
                    ) : (
                      // Desktop: Horizontal buttons
                      <div className="flex justify-center gap-4">
                        <button
                          onClick={() =>
                            handleSelectPick(
                              game.id,
                              game.home_team.id,
                              game.home_team.name
                            )
                          }
                          className={`w-full py-3 font-bold rounded-lg transition ${
                            currentPick?.predictedTeamId === game.home_team.id
                              ? "bg-green-600 text-white"
                              : "bg-green-200 text-green-800"
                          } text-base`}
                        >
                          {game.home_team.name}가 승리한다
                        </button>
                        <button
                          onClick={() =>
                            handleSelectPick(
                              game.id,
                              game.away_team.id,
                              game.away_team.name
                            )
                          }
                          className={`w-full py-3 font-bold rounded-lg transition ${
                            currentPick?.predictedTeamId === game.away_team.id
                              ? "bg-red-600 text-white"
                              : "bg-red-200 text-red-800"
                          } text-base`}
                        >
                          {game.away_team.name}가 승리한다
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-6 text-center">
                    <p
                      className={`text-gray-800 ${
                        isMobile ? "text-base" : "text-lg"
                      }`}
                    >
                      이 경기에 대한 예측은 마감되었습니다.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {/* --- SUBMIT BUTTON -- */}
          {selectedPicks.size > 0 && (
            <div className="mt-8 text-center">
              <button
                onClick={() => setShowConfirmation(true)}
                className={`px-8 py-4 bg-blue-600 text-white font-bold rounded-lg shadow-lg ${
                  isMobile ? "w-full text-base" : "text-lg"
                }`}
              >
                Submit {selectedPicks.size} Prediction(s)
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- CONFIRMATION MODAL -- */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
          <div
            className={`bg-white rounded-lg shadow-2xl max-w-md w-full ${
              isMobile ? "p-6" : "p-8"
            }`}
          >
            <h3
              className={`font-bold mb-4 text-gray-900 ${
                isMobile ? "text-lg" : "text-xl"
              }`}
            >
              예측을 제출하시겠습니까?
            </h3>
            <ul
              className={`list-disc list-inside mb-6 text-gray-700 ${
                isMobile ? "text-sm" : "text-base"
              }`}
            >
              {Array.from(selectedPicks.values()).map((pick) => (
                <li key={pick.gameId}>
                  {" "}
                  <span className="font-bold">{pick.teamName}</span>
                </li>
              ))}
            </ul>
            <div
              className={`flex ${
                isMobile ? "flex-col gap-3" : "justify-center gap-4"
              }`}
            >
              <button
                onClick={() => setShowConfirmation(false)}
                className={`px-6 py-2 bg-gray-300 text-gray-800 rounded-lg ${
                  isMobile ? "w-full" : ""
                }`}
              >
                취소
              </button>
              <button
                onClick={handleConfirmSubmission}
                className={`px-6 py-2 bg-blue-600 text-white rounded-lg ${
                  isMobile ? "w-full" : ""
                }`}
              >
                제출
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
