"use client";

import { useState, useEffect } from "react";
import { getLeaderboard } from "@/lib/api";

type LeaderboardEntry = {
  userId: string;
  name: string;
  student_number: string;
  score: number;
};

export default function LeaderboardPage() {
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
    <div className="w-full max-w-4xl mx-auto p-8">
      <h1 className="text-4xl font-bold text-center text-gray-800 mb-10">
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
              <li key={entry.userId} className={`flex items-center p-4`}>
                <span className="text-lg font-bold text-gray-600 w-12">
                  {index + 1}
                </span>
                <span className="text-xl font-semibold text-gray-800 flex-grow">
                  {entry.name}
                </span>
                <span className="text-2xl font-bold text-blue-600">
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
