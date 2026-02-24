"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  getISODate,
  getMarketListForDate,
  type MarketListItem,
} from "@/lib/api";
import { useUserSession } from "@/lib/hooks/useUserSession";

type MarketOutcome = "HOME" | "AWAY" | "DRAW";
type MarketDateLabel = "today" | "tomorrow";
type DisplayMarketStatus = "OPEN" | "CLOSED" | "SETTLED" | "CANCELED";

const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const MARKET_STATUS_BADGE_CLASSES: Record<DisplayMarketStatus, string> = {
  OPEN: "bg-tokhin-green/10 text-tokhin-green",
  CLOSED: "bg-zinc-200 text-zinc-600",
  SETTLED: "bg-blue-100 text-blue-600",
  CANCELED: "bg-red-100 text-red-500",
};

const PRICE_TREND_CLASSES = {
  up: "text-green-500",
  down: "text-red-500",
  flat: "text-gray-500",
} as const;

const formatGameTime = (gameTime: string | null): string => {
  if (!gameTime) {
    return "--:--";
  }

  const [hour = "", minute = ""] = gameTime.split(":");

  if (!hour || !minute) {
    return gameTime;
  }

  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
};

const formatMarketDateTitle = (
  isoDate: string,
  label: MarketDateLabel
): string => {
  const [year, month, day] = isoDate.split("-").map(Number);
  const safeDate = new Date(year, (month || 1) - 1, day || 1);
  const weekday = KOREAN_WEEKDAYS[safeDate.getDay()] ?? "-";
  const suffix = label === "tomorrow" ? "내일의 마켓" : "오늘의 마켓";

  return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(
    2,
    "0"
  )} (${weekday}) ${suffix}`;
};

const getDisplayTeamName = (
  shortName: string | null,
  fullName: string
): string => {
  if (shortName && shortName.trim().length > 0) {
    return shortName;
  }

  return fullName;
};

const getTeamTextColorClass = (teamName: string): string => {
  const normalized = teamName.toUpperCase();

  if (normalized.includes("KIA")) return "text-kia";
  if (normalized.includes("NC")) return "text-nc";
  if (teamName.includes("키움")) return "text-kiwoom";
  if (teamName.includes("두산")) return "text-doosan";
  if (normalized.includes("KT")) return "text-kt";
  if (teamName.includes("삼성")) return "text-samsung";
  if (normalized.includes("SSG")) return "text-ssg";
  if (teamName.includes("롯데")) return "text-lotte";
  if (normalized.includes("LG")) return "text-lg-twins";
  if (teamName.includes("한화")) return "text-hanhwa";

  return "text-black";
};

const getDisplayMarketStatus = (
  gameStatus: string,
  marketStatus: string
): DisplayMarketStatus => {
  const normalizedGameStatus = gameStatus.toUpperCase();
  const normalizedMarketStatus = marketStatus.toUpperCase();

  if (normalizedMarketStatus === "SETTLED") {
    return "SETTLED";
  }

  if (
    normalizedMarketStatus === "CANCELED" ||
    normalizedGameStatus === "CANCELED"
  ) {
    return "CANCELED";
  }

  if (normalizedMarketStatus === "CLOSED" || normalizedGameStatus === "FINISHED") {
    return "CLOSED";
  }

  if (
    normalizedGameStatus === "SCHEDULED" ||
    normalizedGameStatus === "IN_PROGRESS" ||
    normalizedGameStatus === "LIVE"
  ) {
    return "OPEN";
  }

  return "OPEN";
};

const getPriceTrendClass = (
  currentPrice: number,
  baselinePrice: number | null
): string => {
  if (baselinePrice === null) {
    return PRICE_TREND_CLASSES.flat;
  }

  if (currentPrice > baselinePrice) {
    return PRICE_TREND_CLASSES.up;
  }

  if (currentPrice < baselinePrice) {
    return PRICE_TREND_CLASSES.down;
  }

  return PRICE_TREND_CLASSES.flat;
};

const isGameEnded = (status: string): boolean => {
  const normalizedStatus = status.toUpperCase();
  return normalizedStatus === "FINISHED" || normalizedStatus === "CANCELED";
};

export default function HomePage() {
  const { session, isLoading: isSessionLoading } = useUserSession({
    requireAuth: true,
  });
  const [markets, setMarkets] = useState<MarketListItem[]>([]);
  const [displayDate, setDisplayDate] = useState<string>(getISODate());
  const [displayDateLabel, setDisplayDateLabel] =
    useState<MarketDateLabel>("today");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAndSetMarkets = useCallback(async () => {
    if (!session?.user_id) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const today = getISODate();
      const todayMarkets = await getMarketListForDate(today);

      const allTodayGamesEnded =
        todayMarkets.length > 0 &&
        todayMarkets.every((market) => isGameEnded(market.gameStatus));

      if (allTodayGamesEnded || todayMarkets.length === 0) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDate = getISODate(tomorrow);
        const tomorrowMarkets = await getMarketListForDate(tomorrowDate);

        if (tomorrowMarkets.length > 0) {
          setMarkets(tomorrowMarkets);
          setDisplayDate(tomorrowDate);
          setDisplayDateLabel("tomorrow");
        } else {
          setMarkets(todayMarkets);
          setDisplayDate(today);
          setDisplayDateLabel("today");
        }
      } else {
        setMarkets(todayMarkets);
        setDisplayDate(today);
        setDisplayDateLabel("today");
      }
    } catch (fetchError) {
      console.error("Error loading market list:", fetchError);
      setError("마켓 목록을 불러오는 중 오류가 발생했습니다");
    } finally {
      setIsLoading(false);
    }
  }, [session?.user_id]);

  useEffect(() => {
    if (!session?.user_id) {
      return;
    }

    void fetchAndSetMarkets();
  }, [fetchAndSetMarkets, session?.user_id]);

  if (isSessionLoading) {
    return <p className="py-20 text-center text-zinc-500">로딩 중...</p>;
  }

  if (!session?.user_id) {
    return null;
  }

  return (
    <div className="w-full pt-1">
      <h1 className="mb-4 text-lg font-bold text-black">
        {formatMarketDateTitle(displayDate, displayDateLabel)}
      </h1>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">마켓 목록을 불러오는 중...</p>
      ) : markets.length === 0 ? (
        <div className="rounded-2xl bg-white p-5 text-center shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]">
          <p className="text-sm text-zinc-500">표시할 마켓이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {markets.map((market) => {
            const homeTeamName = getDisplayTeamName(
              market.homeTeamShortName,
              market.homeTeamName
            );
            const awayTeamName = getDisplayTeamName(
              market.awayTeamShortName,
              market.awayTeamName
            );
            const marketStatus = getDisplayMarketStatus(
              market.gameStatus,
              market.marketStatus
            );

            const renderPrice = (outcome: MarketOutcome) => (
              <p
                className={`text-center text-2xl font-bold tabular-nums ${getPriceTrendClass(
                  market.prices[outcome],
                  market.initialPrices[outcome]
                )}`}
              >
                {market.prices[outcome].toFixed(1)}
              </p>
            );

            return (
              <Link
                key={market.id}
                href={`/market/${market.id}`}
                className="block rounded-2xl bg-white p-5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)] transition-transform active:scale-[0.995]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-bold text-black">
                    <span className={getTeamTextColorClass(homeTeamName)}>
                      {homeTeamName}
                    </span>
                    <span className="px-1 text-zinc-400">vs</span>
                    <span className={getTeamTextColorClass(awayTeamName)}>
                      {awayTeamName}
                    </span>
                  </p>
                  <p className="text-sm text-zinc-500 tabular-nums">
                    {formatGameTime(market.gameTime)}
                  </p>
                </div>

                <div className="my-3 h-px w-full bg-zinc-200" />

                <div className="grid grid-cols-3 gap-2">
                  <p className="text-center text-xs font-semibold text-zinc-500">
                    HOME
                  </p>
                  <p className="text-center text-xs font-semibold text-zinc-500">
                    AWAY
                  </p>
                  <p className="text-center text-xs font-semibold text-zinc-500">
                    DRAW
                  </p>

                  {renderPrice("HOME")}
                  {renderPrice("AWAY")}
                  {renderPrice("DRAW")}
                </div>

                <div className="mt-4 flex justify-center">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${MARKET_STATUS_BADGE_CLASSES[marketStatus]}`}
                  >
                    {marketStatus}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
