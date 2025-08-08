"use client";

import { useState, useEffect } from "react";
import { getPredictionRatiosForActiveGames } from "@/lib/api";
import { PieChart } from "react-minimal-pie-chart";
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
    <div
      className={`bg-white rounded-xl shadow-md mb-8 ${
        isMobile ? "p-4" : "p-6"
      }`}
    >
      <h3
        className={`font-bold text-gray-800 mb-4 ${
          isMobile ? "text-lg" : "text-xl"
        }`}
      >
        {date} 승부 예측 비율
      </h3>
      <div className="space-y-4">
        {ratios.map((gameRatio, index) => (
          <div key={index} className="border-b pb-4 last:border-b-0 last:pb-0">
            <p
              className={`font-semibold text-gray-700 mb-3 ${
                isMobile ? "text-center text-sm" : "text-base"
              }`}
            >
              {gameRatio.home_team_name} vs {gameRatio.away_team_name}
            </p>
            <div
              className={`flex items-center my-2 ${
                isMobile ? "flex-col space-y-3" : "justify-center"
              }`}
            >
              <div className={isMobile ? "w-20 h-20" : "w-24 h-24"}>
                <PieChart
                  data={[
                    {
                      title: gameRatio.home_team_name,
                      value: gameRatio.home_team_ratio,
                      color: "#34D399",
                    }, // Green
                    {
                      title: gameRatio.away_team_name,
                      value: gameRatio.away_team_ratio,
                      color: "#EF4444",
                    }, // Red
                  ]}
                  lineWidth={60}
                  paddingAngle={5}
                  rounded
                  label={({ dataEntry }) =>
                    `${Math.round(dataEntry.percentage)}%`
                  }
                  labelStyle={{
                    fontSize: isMobile ? "8px" : "10px",
                    fontFamily: "sans-serif",
                    fill: "#fff",
                  }}
                  labelPosition={75}
                />
              </div>
              <div
                className={`text-gray-700 ${
                  isMobile ? "text-center space-y-1" : "ml-4"
                }`}
              >
                <p className={isMobile ? "text-sm" : "text-base"}>
                  <span className="inline-block w-3 h-3 rounded-full bg-red-400 mr-2"></span>
                  {gameRatio.away_team_name}:{" "}
                  {gameRatio.away_team_ratio.toFixed(2)}%
                </p>
                <p className={isMobile ? "text-sm" : "text-base"}>
                  <span className="inline-block w-3 h-3 rounded-full bg-green-400 mr-2"></span>
                  {gameRatio.home_team_name}:{" "}
                  {gameRatio.home_team_ratio.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
