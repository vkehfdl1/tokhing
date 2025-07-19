"use client";

import { useState, useEffect } from "react";
import { getPredictionRatiosForActiveGames } from "@/lib/api";
import { PieChart } from "react-minimal-pie-chart";

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
    return (
      <p className="text-center text-gray-500">Loading prediction ratios...</p>
    );
  }

  if (error) {
    return (
      <p className="text-center text-red-500">Error loading ratios: {error}</p>
    );
  }

  if (ratios.length === 0) {
    return (
      <p className="text-center text-gray-500">
        No prediction data for active games on this date.
      </p>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-md mb-8">
      <h3 className="text-xl font-bold text-gray-800 mb-4">
        {date} 승부 예측 비율
      </h3>
      <div className="space-y-4">
        {ratios.map((gameRatio, index) => (
          <div key={index} className="border-b pb-4 last:border-b-0 last:pb-0">
            <p className="font-semibold text-gray-700">
              {gameRatio.home_team_name} vs {gameRatio.away_team_name}
            </p>
            <div className="flex justify-center items-center my-2">
              <div className="w-24 h-24">
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
                    fontSize: "10px",
                    fontFamily: "sans-serif",
                    fill: "#fff",
                  }}
                  labelPosition={75}
                />
              </div>
              <div className="ml-4 text-gray-700">
                <p>
                  <span className="inline-block w-3 h-3 rounded-full bg-green-400 mr-2"></span>
                  {gameRatio.home_team_name}:{" "}
                  {gameRatio.home_team_ratio.toFixed(2)}%
                </p>
                <p>
                  <span className="inline-block w-3 h-3 rounded-full bg-red-400 mr-2"></span>
                  {gameRatio.away_team_name}:{" "}
                  {gameRatio.away_team_ratio.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
