"use client";

import { useState, useEffect } from "react";
import { getLeaderboard } from "@/lib/api";
import { useIsMobile } from "@/lib/hooks/useResponsive";

type LeaderboardEntry = {
  userId: string;
  name: string;
  student_number: string;
  score: number;
};

export default function LeaderboardPage() {
  const isMobile = useIsMobile();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setIsLoading(true);
      const data = await getLeaderboard("2025-08-18", "2025-12-31");
      setLeaderboard(data);
      setIsLoading(false);
    };
    fetchLeaderboard();
  }, []);

  return (
    <div className={`w-full mx-auto ${isMobile ? "p-4" : "p-8"}`}>
      <h1
        className={`font-bold text-center text-black mb-8 ${
          isMobile ? "text-xl" : "text-4xl"
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
        <div>
          <ul className="divide-y divide-transparent">
            {leaderboard.map((entry, index) => (
              <li
                key={entry.userId}
                className={`flex items-center ${
                  isMobile ? "px-4" : "px-4"
                } h-12 ${
                  index === 0 ? "bg-tokhin-green" : "bg-neutral-50"
                } rounded-lg shadow-[0px_0px_8px_0px_rgba(0,0,0,0.12)] my-2`}
              >
                <span
                  className={`font-base ${
                    index === 0
                      ? "text-white"
                      : index === 1 || index === 2
                      ? "text-tokhin-green"
                      : "text-stone-500"
                  } ${
                    isMobile
                      ? "text-base w-6 text-center"
                      : "text-lg w-12 text-center"
                  }`}
                >
                  {index + 1}
                </span>
                <span
                  className={`font-base ${
                    index === 0
                      ? "text-white"
                      : index === 1 || index === 2
                      ? "text-tokhin-green"
                      : "text-stone-500"
                  } flex-grow ${isMobile ? "text-base px-2" : "text-xl"}`}
                >
                  {entry.name}
                </span>
                <span
                  className={`font-normal ${
                    index === 0
                      ? "text-white"
                      : index === 1 || index === 2
                      ? "text-tokhin-green"
                      : "text-stone-500"
                  } ${isMobile ? "text-base px-1" : "text-2xl"}`}
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
