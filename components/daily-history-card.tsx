"use client";

import { useState, useEffect } from "react";
import { getHistoryForDate } from "@/lib/api";

// --- TYPE DEFINITIONS ---
type Team = { id: number; name: string };
type Game = {
  id: number;
  home_team: Team | Team[];
  away_team: Team | Team[];
  home_score: number | null;
  away_score: number | null;
  gameResult?: string;
  prediction: {
    predicted_team_name: string | undefined;
    is_correct: boolean;
    points_earned: number;
    is_settled: boolean;
  } | null;
};

interface DailyHistoryCardProps {
  userId: string;
  date: string;
}

// --- COMPONENT ---
export default function DailyHistoryCard({
  userId,
  date,
}: DailyHistoryCardProps) {
  const [dailyData, setDailyData] = useState<{
    games: Game[];
    totalPoints: number;
    message?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !date) return;

    const fetchDailyHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getHistoryForDate(userId, date);
        setDailyData(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "An error occurred");
      }
      setIsLoading(false);
    };

    fetchDailyHistory();
  }, [userId, date]);

  if (isLoading) {
    return (
      <p className="text-center text-gray-500">Loading daily results...</p>
    );
  }

  if (error) {
    return <p className="text-center text-red-500">{error}</p>;
  }

  if (!dailyData || dailyData.games.length === 0) {
    return (
      <p className="text-center text-gray-500 py-8">
        {dailyData?.message || "이 날짜에는 완료된 경기가 없습니다."}
      </p>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-md">
      <h3 className="text-lg font-bold text-gray-800 mb-4">
        총 획득한 점수: {dailyData.totalPoints}
      </h3>
      <div className="space-y-4">
        {dailyData.games.map((game) => {
          // Handle both array and single object formats for teams
          const homeTeam = Array.isArray(game.home_team)
            ? game.home_team[0]
            : game.home_team;
          const awayTeam = Array.isArray(game.away_team)
            ? game.away_team[0]
            : game.away_team;

          return (
            <div
              key={game.id}
              className={`p-4 rounded-lg border-l-4 ${
                !game.prediction
                  ? "border-gray-300"
                  : game.prediction.is_correct
                  ? "border-green-500"
                  : "border-red-500"
              }`}
            >
              <div className="flex justify-between items-center">
                <div className="font-mono text-lg text-gray-800">
                  <span>{homeTeam.name}</span>
                  <span className="mx-2 font-bold">
                    {game.home_score} - {game.away_score}
                  </span>
                  <span>{awayTeam.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-gray-700">
                    당신의 예측 : {" "}
                    <span className="font-bold">
                      {game.prediction?.predicted_team_name ?? "N/A"}
                    </span>
                  </p>
                  <div className="flex flex-col">
                    <p
                      className={`text-sm font-semibold ${
                        game.prediction?.is_correct
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {game.prediction
                        ? game.prediction.is_correct
                          ? "✓ 적중"
                          : "✗ 예측 실패"
                        : "No prediction"}
                    </p>
                    <p className="text-sm text-gray-600">
                      점수: {game.prediction?.points_earned ?? 0}
                      {game.prediction &&
                        !game.prediction.is_settled &&
                        " (pending)"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
