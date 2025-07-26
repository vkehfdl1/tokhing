"use client";

import { useState, useEffect } from "react";
import { getLeaderboard } from "@/lib/api";
import { useIsMobile, useIsSmallMobile } from "@/lib/hooks/useResponsive";

type LeaderboardEntry = {
  userId: string;
  name: string;
  student_number: string;
  score: number;
};

export default function LeaderboardPage() {
  const isMobile = useIsMobile();
  const isSmallMobile = useIsSmallMobile();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setIsLoading(true);
      const data = await getLeaderboard("2025-07-24", "2025-08-17");
      setLeaderboard(data);
      setIsLoading(false);
    };
    fetchLeaderboard();
  }, []);

  return (
    <div className={`w-full mx-auto ${isMobile ? "p-4" : "p-8"}`}>
      <h1
        className={`font-bold text-center text-gray-800 mb-10 ${
          isSmallMobile ? "text-2xl" : isMobile ? "text-3xl" : "text-4xl"
        }`}
      >
        실시간 순위
      </h1>

      {isLoading ? (
        <p className="text-center">로딩 중...</p>
      ) : leaderboard.length === 0 ? (
        <p className="text-center text-gray-600">
          아직 순위표를 볼 수 없습니다.
        </p>
      ) : (
        <div className="bg-white rounded-xl shadow-md">
          <ul className="divide-y divide-gray-200">
            {leaderboard.map((entry, index) => (
              <li
                key={entry.userId}
                className={`flex items-center ${isMobile ? "p-3" : "p-4"}`}
              >
                <span
                  className={`font-bold text-gray-600 ${
                    isMobile ? "text-base w-8" : "text-lg w-12"
                  }`}
                >
                  {index + 1}
                </span>
                <span
                  className={`font-semibold text-gray-800 flex-grow ${
                    isSmallMobile
                      ? "text-base"
                      : isMobile
                      ? "text-lg"
                      : "text-xl"
                  }`}
                >
                  {entry.name}
                </span>
                <span
                  className={`font-bold text-blue-600 ${
                    isSmallMobile
                      ? "text-lg"
                      : isMobile
                      ? "text-xl"
                      : "text-2xl"
                  }`}
                >
                  {entry.score}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
