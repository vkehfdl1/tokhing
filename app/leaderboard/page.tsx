"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getLeaderboardBalance,
  getLeaderboardRoi,
  type LeaderboardBalanceItem,
  type LeaderboardRoiItem,
} from "@/lib/api";
import { useUserSession } from "@/lib/hooks/useUserSession";

type LeaderboardTab = "BALANCE" | "ROI";

type LeaderboardDisplayRow = {
  key: string;
  rank: number;
  username: string;
  valueText: string;
};

const LEADERBOARD_TABS: Array<{ id: LeaderboardTab; label: string }> = [
  { id: "BALANCE", label: "잔고 순위" },
  { id: "ROI", label: "수익률 순위" },
];

const valueFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

const formatRoiPercent = (value: number) => {
  const formatted = valueFormatter.format(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${formatted}%`;
};

const getRankTextClass = (rank: number) => {
  if (rank === 1) {
    return "text-white";
  }

  if (rank === 2 || rank === 3) {
    return "text-tokhin-green";
  }

  return "text-stone-500";
};

const getRankBackgroundClass = (rank: number) => {
  return rank === 1 ? "bg-tokhin-green" : "bg-neutral-50";
};

export default function LeaderboardPage() {
  const { session, isLoading: isSessionLoading } = useUserSession({
    requireAuth: true,
  });

  const [activeTab, setActiveTab] = useState<LeaderboardTab>("BALANCE");
  const [balanceLeaderboard, setBalanceLeaderboard] = useState<
    LeaderboardBalanceItem[]
  >([]);
  const [roiLeaderboard, setRoiLeaderboard] = useState<LeaderboardRoiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user_id) {
      return;
    }

    let isCancelled = false;
    const fetchLeaderboard = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [balanceData, roiData] = await Promise.all([
          getLeaderboardBalance(),
          getLeaderboardRoi(),
        ]);

        if (isCancelled) {
          return;
        }

        setBalanceLeaderboard(balanceData);
        setRoiLeaderboard(roiData);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "리더보드 조회 중 오류가 발생했습니다";

        setErrorMessage(message);
        setBalanceLeaderboard([]);
        setRoiLeaderboard([]);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchLeaderboard();

    return () => {
      isCancelled = true;
    };
  }, [session?.user_id]);

  const displayRows = useMemo<LeaderboardDisplayRow[]>(() => {
    if (activeTab === "BALANCE") {
      return balanceLeaderboard.map((entry) => ({
        key: `balance-${entry.userId}`,
        rank: entry.rank,
        username: entry.username,
        valueText: valueFormatter.format(entry.balance),
      }));
    }

    return roiLeaderboard.map((entry) => ({
      key: `roi-${entry.userId}`,
      rank: entry.rank,
      username: entry.username,
      valueText: formatRoiPercent(entry.roiPercent),
    }));
  }, [activeTab, balanceLeaderboard, roiLeaderboard]);

  if (isSessionLoading) {
    return <p className="py-20 text-center text-zinc-500">로딩 중...</p>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="w-full pt-1">
      <h1 className="mb-6 text-center text-xl font-bold text-black">리더보드</h1>

      <div className="mb-5 border-b border-zinc-200">
        <div className="grid grid-cols-2">
          {LEADERBOARD_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-black text-black"
                  : "text-zinc-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-center">로딩 중...</p>
      ) : errorMessage ? (
        <p className="text-center text-red-500">{errorMessage}</p>
      ) : displayRows.length === 0 ? (
        <p className="text-center text-gray-600">
          아직 {activeTab === "BALANCE" ? "잔고" : "수익률"} 순위표를 볼 수
          없습니다.
        </p>
      ) : (
        <div>
          <ul className="divide-y divide-transparent">
            {displayRows.map((entry) => (
              <li
                key={entry.key}
                className={`my-2 flex h-12 items-center rounded-lg px-4 shadow-[0px_0px_8px_0px_rgba(0,0,0,0.12)] ${getRankBackgroundClass(
                  entry.rank
                )}`}
              >
                <span
                  className={`w-6 text-center text-base font-medium ${getRankTextClass(
                    entry.rank
                  )}`}
                >
                  {entry.rank}
                </span>
                <span
                  className={`flex-grow px-2 text-base font-medium ${getRankTextClass(
                    entry.rank
                  )}`}
                >
                  {entry.username}
                </span>
                <span
                  className={`px-1 text-base font-normal ${getRankTextClass(
                    entry.rank
                  )}`}
                >
                  {entry.valueText}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
