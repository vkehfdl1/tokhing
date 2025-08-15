"use client";

import { useState, useEffect } from "react";
import { getHistoryForDate } from "@/lib/api";
import { useIsMobile } from "@/lib/hooks/useResponsive";

function selectTeamColor(teamName: string): {
  backgroundColor: string;
  textColor: string;
} {
  switch (teamName) {
    case "KIA 타이거즈":
      return { backgroundColor: "bg-kia", textColor: "text-kia" };
    case "NC 다이노스":
      return { backgroundColor: "bg-nc", textColor: "text-nc" };
    case "키움 히어로즈":
      return { backgroundColor: "bg-kiwoom", textColor: "text-kiwoom" };
    case "두산 베어스":
      return { backgroundColor: "bg-doosan", textColor: "text-doosan" };
    case "KT 위즈":
      return { backgroundColor: "bg-kt", textColor: "text-kt" };
    case "삼성 라이온즈":
      return { backgroundColor: "bg-samsung", textColor: "text-samsung" };
    case "SSG 랜더스":
      return { backgroundColor: "bg-ssg", textColor: "text-ssg" };
    case "롯데 자이언츠":
      return { backgroundColor: "bg-lotte", textColor: "text-lotte" };
    case "LG 트윈스":
      return { backgroundColor: "bg-lg-twins", textColor: "text-lg-twins" };
    case "한화 이글스":
      return { backgroundColor: "bg-hanhwa", textColor: "text-hanhwa" };
    default:
      return { backgroundColor: "bg-gray-500", textColor: "text-black" };
  }
}

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
  const isMobile = useIsMobile();
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
    <div className={`bg-white ${isMobile ? "p-4" : "p-6"}`}>
      <h3 className={`text-black text-base font-light text-center mb-2`}>
        총 획득한 점수
      </h3>
      <h3
        className={`font-bold text-center text-black text-xl mb-10 ${
          isMobile ? "text-base" : "text-lg"
        }`}
      >
        {dailyData.totalPoints}
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

          const getPredictionStatus = () => {
            if (!game.prediction) {
              return {
                text: "예측 없음",
                textColor: "text-stone-300",
                outlineColor: "outline-stone-300",
              };
            }
            return game.prediction.is_correct
              ? {
                  text: "예측 적중",
                  textColor: "text-tokhin-green",
                  outlineColor: "outline-lime-200/95",
                }
              : {
                  text: "예측 실패",
                  textColor: "text-stone-300",
                  outlineColor: "outline-stone-300",
                };
          };

          const predictionStatus = getPredictionStatus();

          return (
            <div
              key={game.id}
              className={`px-5 pb-5 pt-4 rounded-2xl shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)] bg-white outline outline-2 ${predictionStatus.outlineColor}`}
            >
              {isMobile ? (
                // Mobile Layout - 5 Rows
                <div className="text-gray-800">
                  {/* Row 1: Prediction Status at center */}
                  <div className="text-center mb-4">
                    <span
                      className={`text-xs font-bold ${predictionStatus.textColor}`}
                    >
                      {predictionStatus.text}
                    </span>
                  </div>

                  {/* Row 2: Team Names - Away (left) vs Home (right) */}
                  <div className="flex items-center mb-2">
                    <span
                      className={`font-bold text-xl flex-1 text-left ${
                        selectTeamColor(awayTeam.name).textColor
                      }`}
                    >
                      {awayTeam.name}
                    </span>
                    <span className="font-light text-base text-black px-3">
                      VS
                    </span>
                    <span
                      className={`font-bold text-xl flex-1 text-right ${
                        selectTeamColor(homeTeam.name).textColor
                      }`}
                    >
                      {homeTeam.name}
                    </span>
                  </div>

                  {/* Row 3: Scores */}
                  <div className="flex justify-between items-center mb-6">
                    <span className="font-medium text-neutral-700">
                      {game.away_score}
                    </span>

                    <div className="flex items-center gap-2">
                      <div className="w-6 py-1 bg-zinc-100 rounded inline-flex flex-col justify-center items-center gap-2">
                        <div className="self-stretch text-center justify-start text-neutral-700 text-xs font-medium">
                          홈
                        </div>
                      </div>
                      <span className="text-base text-neutral-700 font-medium">
                        {game.home_score}
                      </span>
                    </div>
                  </div>

                  {/* Row 4: Team selection buttons (non-clickable, showing prediction) */}
                  <div className="flex gap-3">
                    <div
                      className={`flex-1 py-3 font-light text-base rounded-lg text-white ${
                        game.prediction?.predicted_team_name === awayTeam.name
                          ? selectTeamColor(awayTeam.name).backgroundColor // Predicted team: full color
                          : `${
                              selectTeamColor(awayTeam.name).backgroundColor
                            } opacity-50` // Non-predicted: 50% opacity
                      } text-sm text-center`}
                    >
                      {awayTeam.name}
                    </div>
                    <div
                      className={`flex-1 py-3 font-light text-base rounded-lg text-white ${
                        game.prediction?.predicted_team_name === homeTeam.name
                          ? selectTeamColor(homeTeam.name).backgroundColor // Predicted team: full color
                          : `${
                              selectTeamColor(homeTeam.name).backgroundColor
                            } opacity-50` // Non-predicted: 50% opacity
                      } text-sm text-center`}
                    >
                      {homeTeam.name}
                    </div>
                  </div>
                </div>
              ) : (
                // Desktop Layout
                <div className="space-y-4">
                  <div className="grid grid-cols-3 items-center text-center text-gray-800">
                    {/* Away Team */}
                    <div className="flex flex-col">
                      <span className="font-bold text-2xl">
                        {awayTeam.name}
                      </span>
                    </div>

                    {/* Score */}
                    <div className="flex flex-col items-center">
                      <span
                        className={`text-sm font-medium ${predictionStatus.textColor}`}
                      >
                        {predictionStatus.text}
                      </span>
                      <span className="font-extrabold text-3xl">
                        {game.away_score} - {game.home_score}
                      </span>
                    </div>

                    {/* Home Team */}
                    <div className="flex flex-col">
                      <span className="font-bold text-2xl">
                        {homeTeam.name}
                      </span>
                    </div>
                  </div>

                  {/* Team buttons (non-clickable) */}
                  <div className="flex justify-center gap-4">
                    <div
                      className={`w-full py-3 font-bold rounded-lg ${
                        game.prediction?.predicted_team_name === awayTeam.name
                          ? "bg-green-600 text-white"
                          : "bg-green-200 text-green-800"
                      } text-base text-center`}
                    >
                      {awayTeam.name}
                    </div>
                    <div
                      className={`w-full py-3 font-bold rounded-lg ${
                        game.prediction?.predicted_team_name === homeTeam.name
                          ? "bg-red-600 text-white"
                          : "bg-red-200 text-red-800"
                      } text-base text-center`}
                    >
                      {homeTeam.name}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
