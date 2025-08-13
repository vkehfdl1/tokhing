"use client";

import { useState, useEffect } from "react";
import { getPredictionRatiosForActiveGames } from "@/lib/api";
import { useIsMobile } from "@/lib/hooks/useResponsive";

type PredictionRatio = {
  home_team_name: string;
  away_team_name: string;
  home_team_ratio: number;
  away_team_ratio: number;
};

interface PredictionRatioChartProps {
  date: string;
}

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

export default function PredictionRatioChart({
  date,
}: PredictionRatioChartProps) {
  const isMobile = useIsMobile();
  const [ratios, setRatios] = useState<PredictionRatio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;

    const fetchRatios = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getPredictionRatiosForActiveGames(date);
        setRatios(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      }
      setIsLoading(false);
    };

    fetchRatios();
  }, [date]);

  if (isLoading) {
    return <p className="text-center text-gray-500">예측 비율 로딩 중...</p>;
  }

  if (error) {
    return (
      <p className="text-center text-red-500">Error loading ratios: {error}</p>
    );
  }

  if (ratios.length === 0) {
    return (
      <p className="text-center text-gray-500">
        해당 날짜의 승부 예측 데이터를 찾을 수 없습니다.
      </p>
    );
  }

  return (
    <div className={`bg-white rounded-xl mb-8`}>
      <h1 className="font-bold text-center text-black mb-1 text-xl">
        승부 예측 비율
      </h1>
      <h3
        className={`text-center justify-start text-zinc-500 text-xs font-normal mb-8`}
      >
        {date}
      </h3>
      <div className="space-y-4">
        {ratios.map((gameRatio, index) => (
          <div
            key={index}
            className="p-4 bg-white rounded-lg shadow-[0px_2px_16px_0px_rgba(0,0,0,0.04)]"
          >
            <div className="flex flex-col items-center">
              <div className={`w-full ${isMobile ? "max-w-xs" : "max-w-md"}`}>
                {/* Team Names and Ratios Above the Bar */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col items-start">
                    <span
                      className={`font-bold text-xl mb-2 ${
                        selectTeamColor(gameRatio.away_team_name).textColor
                      }`}
                    >
                      {gameRatio.away_team_name}
                    </span>
                    <span className={`text-zinc-500 font-normal text-xs`}>
                      {gameRatio.away_team_ratio.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span
                      className={`font-bold text-xl mb-2 ${
                        selectTeamColor(gameRatio.home_team_name).textColor
                      }`}
                    >
                      {gameRatio.home_team_name}
                    </span>
                    <span className={`text-zinc-500 font-normal text-xs`}>
                      {gameRatio.home_team_ratio.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Bar Chart Container */}
                <div className="relative bg-gray-200 rounded-sm h-3 overflow-hidden">
                  {/* Away Team Bar */}
                  <div
                    className={`absolute left-0 top-0 h-full ${
                      selectTeamColor(gameRatio.away_team_name).backgroundColor
                    } transition-all duration-300`}
                    style={{ width: `${gameRatio.away_team_ratio}%` }}
                  />
                  {/* Home Team Bar */}
                  <div
                    className={`absolute right-0 top-0 h-full ${
                      selectTeamColor(gameRatio.home_team_name).backgroundColor
                    } transition-all duration-300`}
                    style={{ width: `${gameRatio.home_team_ratio}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
