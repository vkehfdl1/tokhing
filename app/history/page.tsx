"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getOrderHistory,
  getPositions,
  getSettlementHistory,
  type OpenPositionHistoryItem,
  type OrderHistoryItem,
  type SettlementHistoryItem,
} from "@/lib/api";
import { useUserSession } from "@/lib/hooks/useUserSession";

type HistoryTab = "OPEN_POSITIONS" | "ORDERS" | "SETTLEMENTS";

const KST_OFFSET_MINUTES = 9 * 60;
const HISTORY_TABS: Array<{ id: HistoryTab; label: string }> = [
  { id: "OPEN_POSITIONS", label: "진행 중 포지션" },
  { id: "ORDERS", label: "거래 내역" },
  { id: "SETTLEMENTS", label: "정산 내역" },
];

const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const coinFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

const quantityFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 4,
});

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateString = (dateString: string): Date => {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
};

const getKSTDate = () => {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kstTime = new Date(utc + KST_OFFSET_MINUTES * 60000);
  return new Date(kstTime.getFullYear(), kstTime.getMonth(), kstTime.getDate());
};

const toKstDateTime = (dateTime: string): Date => {
  const rawDate = new Date(dateTime);

  if (Number.isNaN(rawDate.getTime())) {
    return new Date(0);
  }

  const utc = rawDate.getTime() + rawDate.getTimezoneOffset() * 60000;
  return new Date(utc + KST_OFFSET_MINUTES * 60000);
};

const formatDateWithWeekday = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = KOREAN_WEEKDAYS[date.getDay()] ?? "-";

  return `${year}. ${month}. ${day}. (${weekday})`;
};

const formatKstDateTime = (dateTime: string) => {
  const date = toKstDateTime(dateTime);

  if (Number.isNaN(date.getTime()) || date.getTime() === 0) {
    return "-";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}.${month}.${day} ${hour}:${minute}`;
};

const formatKstGroupDate = (dateTime: string) => {
  const date = toKstDateTime(dateTime);

  if (Number.isNaN(date.getTime()) || date.getTime() === 0) {
    return "날짜 미상";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const weekday = KOREAN_WEEKDAYS[date.getDay()] ?? "-";

  return `${year}.${month}.${day} (${weekday})`;
};

const formatGameDate = (gameDate: string) => {
  const [year, month, day] = gameDate.split("-").map(Number);

  if (!year || !month || !day) {
    return gameDate;
  }

  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
};

const formatGameTime = (gameTime: string | null) => {
  if (!gameTime) {
    return "--:--";
  }

  const [hour = "", minute = ""] = gameTime.split(":");

  if (!hour || !minute) {
    return gameTime;
  }

  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
};

const formatCoins = (value: number) => {
  return `${coinFormatter.format(value)} 코인`;
};

const formatQuantity = (value: number) => {
  return `${quantityFormatter.format(value)}주`;
};

const formatPnlText = (pnl: number) => {
  const absolute = Math.abs(pnl);

  if (pnl > 0.000001) {
    return `+${coinFormatter.format(absolute)} 코인 ▲`;
  }

  if (pnl < -0.000001) {
    return `-${coinFormatter.format(absolute)} 코인 ▼`;
  }

  return `${coinFormatter.format(0)} 코인`;
};

const getPnlTextClass = (pnl: number) => {
  if (pnl > 0.000001) {
    return "text-green-500";
  }

  if (pnl < -0.000001) {
    return "text-red-500";
  }

  return "text-zinc-500";
};

const getDisplayTeamName = (shortName: string | null, fullName: string) => {
  if (shortName && shortName.trim().length > 0) {
    return shortName;
  }

  return fullName;
};

const getTeamTextColorClass = (teamName: string) => {
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

const formatPositionsSummary = (positions: SettlementHistoryItem["positions"]) => {
  const summaryItems = Object.entries(positions)
    .filter(([, quantity]) => quantity > 0)
    .map(([outcome, quantity]) => `${outcome} ${quantityFormatter.format(quantity)}주`);

  return summaryItems.length > 0 ? summaryItems.join(" · ") : "보유 포지션 없음";
};

export default function HistoryPage() {
  const { session, isLoading: isSessionLoading } = useUserSession({
    requireAuth: true,
  });

  const [activeTab, setActiveTab] = useState<HistoryTab>("OPEN_POSITIONS");
  const [selectedDate, setSelectedDate] = useState(() => {
    const kstToday = getKSTDate();
    const kstYesterday = new Date(kstToday);
    kstYesterday.setDate(kstToday.getDate() - 1);
    return formatDate(kstYesterday);
  });
  const [showCalendar, setShowCalendar] = useState(false);

  const [openPositions, setOpenPositions] = useState<OpenPositionHistoryItem[]>(
    []
  );
  const [orderHistory, setOrderHistory] = useState<OrderHistoryItem[]>([]);
  const [settlementHistory, setSettlementHistory] = useState<
    SettlementHistoryItem[]
  >([]);

  const [isPositionsLoading, setIsPositionsLoading] = useState(false);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [isSettlementsLoading, setIsSettlementsLoading] = useState(false);

  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [settlementsError, setSettlementsError] = useState<string | null>(null);

  const calendarRef = useRef<HTMLDivElement>(null);

  const today = getKSTDate();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const selectedDateObject = parseDateString(selectedDate);

  const isPreviousDisabled = selectedDateObject <= firstDayOfMonth;
  const isNextDisabled = selectedDateObject >= today;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setShowCalendar(false);
      }
    };

    if (showCalendar) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCalendar]);

  useEffect(() => {
    if (!session?.user_id) {
      return;
    }

    let isCancelled = false;

    const fetchOpenPositions = async () => {
      setIsPositionsLoading(true);
      setPositionsError(null);

      try {
        const data = await getPositions(session.user_id);

        if (!isCancelled) {
          setOpenPositions(data);
        }
      } catch (error) {
        if (!isCancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "진행 중 포지션을 불러오지 못했습니다";
          setPositionsError(message);
        }
      } finally {
        if (!isCancelled) {
          setIsPositionsLoading(false);
        }
      }
    };

    void fetchOpenPositions();

    return () => {
      isCancelled = true;
    };
  }, [session?.user_id]);

  useEffect(() => {
    if (!session?.user_id) {
      return;
    }

    let isCancelled = false;

    const fetchOrderHistory = async () => {
      setIsOrdersLoading(true);
      setOrdersError(null);

      try {
        const data = await getOrderHistory(session.user_id, selectedDate);

        if (!isCancelled) {
          setOrderHistory(data);
        }
      } catch (error) {
        if (!isCancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "거래 내역을 불러오지 못했습니다";
          setOrdersError(message);
        }
      } finally {
        if (!isCancelled) {
          setIsOrdersLoading(false);
        }
      }
    };

    void fetchOrderHistory();

    return () => {
      isCancelled = true;
    };
  }, [selectedDate, session?.user_id]);

  useEffect(() => {
    if (!session?.user_id) {
      return;
    }

    let isCancelled = false;

    const fetchSettlementHistory = async () => {
      setIsSettlementsLoading(true);
      setSettlementsError(null);

      try {
        const data = await getSettlementHistory(session.user_id);

        if (!isCancelled) {
          setSettlementHistory(data);
        }
      } catch (error) {
        if (!isCancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "정산 내역을 불러오지 못했습니다";
          setSettlementsError(message);
        }
      } finally {
        if (!isCancelled) {
          setIsSettlementsLoading(false);
        }
      }
    };

    void fetchSettlementHistory();

    return () => {
      isCancelled = true;
    };
  }, [session?.user_id]);

  const groupedOrderHistory = useMemo(() => {
    const groups = new Map<string, OrderHistoryItem[]>();

    orderHistory.forEach((order) => {
      const dateKey = formatKstGroupDate(order.createdAt);
      const current = groups.get(dateKey) ?? [];
      current.push(order);
      groups.set(dateKey, current);
    });

    return Array.from(groups.entries()).map(([dateLabel, items]) => ({
      dateLabel,
      items,
    }));
  }, [orderHistory]);

  const navigateDate = (days: number) => {
    const targetDate = new Date(selectedDateObject);
    targetDate.setDate(targetDate.getDate() + days);
    setSelectedDate(formatDate(targetDate));
  };

  const generateCalendarDays = () => {
    const currentDate = parseDateString(selectedDate);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: Array<
      | {
          day: number;
          date: Date;
          isInRange: boolean;
        }
      | null
    > = [];

    for (let i = 0; i < startingDayOfWeek; i += 1) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const isInRange = date >= firstDayOfMonth && date <= today;
      days.push({ day, date, isInRange });
    }

    return days;
  };

  const handleCalendarDateSelect = (date: Date) => {
    const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    setSelectedDate(formatDate(localDate));
    setShowCalendar(false);
  };

  if (isSessionLoading) {
    return <p className="py-20 text-center text-zinc-500">로딩 중...</p>;
  }

  if (!session?.user_id) {
    return null;
  }

  return (
    <div className="w-full pb-4">
      <h1 className="mb-4 text-center text-xl font-bold text-black">
        {`${session.username} 님의 포지션`}
      </h1>

      <div className="mb-4 border-b border-zinc-200">
        <div className="grid grid-cols-3">
          {HISTORY_TABS.map((tab) => (
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

      {activeTab === "ORDERS" && (
        <div className="mb-5 mt-1 flex flex-col items-center">
          <div className="relative mb-1 flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => navigateDate(-1)}
              disabled={isPreviousDisabled}
              className="flex h-10 w-10 items-center justify-center bg-transparent text-zinc-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              &lt;
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCalendar((prev) => !prev)}
                className="rounded-lg px-4 py-2 text-lg font-bold text-black transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                {formatDateWithWeekday(parseDateString(selectedDate))}
              </button>

              {showCalendar && (
                <div
                  ref={calendarRef}
                  className="absolute left-1/2 top-full z-50 mt-2 min-w-[280px] -translate-x-1/2 rounded-lg border border-gray-300 bg-white p-4 shadow-lg"
                >
                  <div className="mb-3 text-center font-semibold text-gray-800">
                    {parseDateString(selectedDate).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "long",
                    })}
                  </div>

                  <div className="mb-2 grid grid-cols-7 gap-1">
                    {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                      <div
                        key={day}
                        className="py-1 text-center text-sm font-medium text-gray-600"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {generateCalendarDays().map((dayData, index) => (
                      <div
                        key={`calendar-day-${index}`}
                        className="flex h-8 items-center justify-center"
                      >
                        {dayData ? (
                          <button
                            type="button"
                            onClick={() => handleCalendarDateSelect(dayData.date)}
                            disabled={!dayData.isInRange}
                            className={`h-8 w-8 rounded text-sm transition-colors ${
                              formatDate(dayData.date) === selectedDate
                                ? "bg-blue-500 text-white"
                                : dayData.isInRange
                                ? "text-gray-800 hover:bg-gray-200"
                                : "cursor-not-allowed text-gray-300"
                            }`}
                          >
                            {dayData.day}
                          </button>
                        ) : (
                          <div className="h-8 w-8" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigateDate(1)}
              disabled={isNextDisabled}
              className="flex h-10 w-10 items-center justify-center bg-transparent text-zinc-500 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              &gt;
            </button>
          </div>
        </div>
      )}

      {activeTab === "OPEN_POSITIONS" && (
        <div className="space-y-3">
          {isPositionsLoading ? (
            <p className="py-12 text-center text-zinc-500">포지션을 불러오는 중...</p>
          ) : positionsError ? (
            <p className="py-12 text-center text-red-500">{positionsError}</p>
          ) : openPositions.length === 0 ? (
            <div className="rounded-2xl bg-white p-5 text-center shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]">
              <p className="text-sm text-zinc-500">보유 중인 포지션이 없습니다.</p>
            </div>
          ) : (
            openPositions.map((position) => {
              const homeTeamName = getDisplayTeamName(
                position.homeTeamShortName,
                position.homeTeamName
              );
              const awayTeamName = getDisplayTeamName(
                position.awayTeamShortName,
                position.awayTeamName
              );

              return (
                <article
                  key={`${position.marketId}-${position.outcome}`}
                  className="rounded-2xl bg-white p-5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-base font-bold text-black">
                      <span className={getTeamTextColorClass(homeTeamName)}>
                        {homeTeamName}
                      </span>
                      <span className="px-1 text-zinc-400">vs</span>
                      <span className={getTeamTextColorClass(awayTeamName)}>
                        {awayTeamName}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatGameDate(position.gameDate)} {formatGameTime(position.gameTime)}
                    </p>
                  </div>

                  <p className="text-sm font-semibold text-zinc-700">
                    {position.outcome} {formatQuantity(position.quantity)}
                  </p>

                  <p className="mt-2 text-sm text-zinc-600">
                    평균 {coinFormatter.format(position.avgEntryPrice)} · 현재 {" "}
                    {coinFormatter.format(position.currentPrice)}
                  </p>

                  <p
                    className={`mt-2 text-sm font-semibold ${getPnlTextClass(
                      position.unrealizedPnl
                    )}`}
                  >
                    미실현 손익: {formatPnlText(position.unrealizedPnl)}
                  </p>
                </article>
              );
            })
          )}
        </div>
      )}

      {activeTab === "ORDERS" && (
        <div className="space-y-4">
          {isOrdersLoading ? (
            <p className="py-12 text-center text-zinc-500">거래 내역을 불러오는 중...</p>
          ) : ordersError ? (
            <p className="py-12 text-center text-red-500">{ordersError}</p>
          ) : groupedOrderHistory.length === 0 ? (
            <div className="rounded-2xl bg-white p-5 text-center shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]">
              <p className="text-sm text-zinc-500">선택한 날짜의 거래 내역이 없습니다.</p>
            </div>
          ) : (
            groupedOrderHistory.map((group) => (
              <section key={group.dateLabel}>
                <h2 className="mb-2 text-sm font-semibold text-zinc-500">
                  {group.dateLabel}
                </h2>

                <div className="space-y-3">
                  {group.items.map((order) => {
                    const homeTeamName = getDisplayTeamName(
                      order.homeTeamShortName,
                      order.homeTeamName
                    );
                    const awayTeamName = getDisplayTeamName(
                      order.awayTeamShortName,
                      order.awayTeamName
                    );
                    const sideClass =
                      order.side === "BUY"
                        ? "bg-green-500/10 text-green-500"
                        : "bg-red-500/10 text-red-500";

                    return (
                      <article
                        key={order.orderId}
                        className="rounded-2xl bg-white p-5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs text-zinc-500">
                            {formatKstDateTime(order.createdAt)}
                          </p>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sideClass}`}
                          >
                            {order.side}
                          </span>
                        </div>

                        <p className="text-sm font-semibold text-black">
                          <span className={getTeamTextColorClass(homeTeamName)}>
                            {homeTeamName}
                          </span>
                          <span className="px-1 text-zinc-400">vs</span>
                          <span className={getTeamTextColorClass(awayTeamName)}>
                            {awayTeamName}
                          </span>
                        </p>

                        <p className="mt-2 text-sm text-zinc-700">
                          {order.outcome} · 수량 {formatQuantity(order.quantity)} · 체결금액 {" "}
                          {formatCoins(order.totalAmount)}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {activeTab === "SETTLEMENTS" && (
        <div className="space-y-3">
          {isSettlementsLoading ? (
            <p className="py-12 text-center text-zinc-500">정산 내역을 불러오는 중...</p>
          ) : settlementsError ? (
            <p className="py-12 text-center text-red-500">{settlementsError}</p>
          ) : settlementHistory.length === 0 ? (
            <div className="rounded-2xl bg-white p-5 text-center shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]">
              <p className="text-sm text-zinc-500">정산 내역이 없습니다.</p>
            </div>
          ) : (
            settlementHistory.map((settlement) => {
              const homeTeamName = getDisplayTeamName(
                settlement.homeTeamShortName,
                settlement.homeTeamName
              );
              const awayTeamName = getDisplayTeamName(
                settlement.awayTeamShortName,
                settlement.awayTeamName
              );

              return (
                <article
                  key={`${settlement.marketId}-${settlement.settledAt}`}
                  className="rounded-2xl bg-white p-5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-base font-bold text-black">
                      <span className={getTeamTextColorClass(homeTeamName)}>
                        {homeTeamName}
                      </span>
                      <span className="px-1 text-zinc-400">vs</span>
                      <span className={getTeamTextColorClass(awayTeamName)}>
                        {awayTeamName}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatKstDateTime(settlement.settledAt)}
                    </p>
                  </div>

                  <p className="text-sm text-zinc-700">
                    보유했던 포지션: {formatPositionsSummary(settlement.positions)}
                  </p>

                  <p className="mt-2 text-sm text-zinc-700">
                    정산금액: {formatCoins(settlement.settlementAmount)}
                  </p>

                  <p
                    className={`mt-2 text-sm font-semibold ${getPnlTextClass(
                      settlement.finalPnl
                    )}`}
                  >
                    최종 손익: {formatPnlText(settlement.finalPnl)}
                  </p>
                </article>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
