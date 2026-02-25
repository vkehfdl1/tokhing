"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  executeBuyByAmount,
  executeBuyOrder,
  executeSellOrder,
  getMarketDetail,
  getMarketPositions,
  getWalletBalance,
  isMarketClosedHours,
  type MarketDetailItem,
  type MarketOutcome,
  type MarketPositionsByOutcome,
} from "@/lib/api";
import { notifyWalletBalanceRefresh } from "@/lib/events";
import { useUserSession } from "@/lib/hooks/useUserSession";

type TradeSide = "BUY" | "SELL";
type BuyInputMode = "QUANTITY" | "AMOUNT";
type DisplayMarketStatus = "OPEN" | "CLOSED" | "SETTLED" | "CANCELED";

interface TradePreview {
  quantity: number;
  totalAmount: number;
  avgPrice: number;
  projectedBalance: number;
}

interface ToastState {
  type: "success" | "error";
  message: string;
}

const OUTCOMES: MarketOutcome[] = ["HOME", "AWAY", "DRAW"];

const STATUS_BADGE_CLASSES: Record<DisplayMarketStatus, string> = {
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

const coinFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

const quantityFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 4,
});

const createEmptyPositionsByOutcome = (): MarketPositionsByOutcome => ({
  HOME: { quantity: 0, avgEntryPrice: 0, purchasedAt: null },
  AWAY: { quantity: 0, avgEntryPrice: 0, purchasedAt: null },
  DRAW: { quantity: 0, avgEntryPrice: 0, purchasedAt: null },
});

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

const formatGameDate = (gameDate: string): string => {
  const [year, month, day] = gameDate.split("-").map(Number);
  if (!year || !month || !day) {
    return gameDate;
  }

  return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(
    2,
    "0"
  )}`;
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

const parsePositiveNumber = (rawValue: string): number | null => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const truncateToEightDigits = (value: number): number => {
  return Math.trunc(value * 100000000) / 100000000;
};

const calculateLmsrCost = (
  qValues: Record<MarketOutcome, number>,
  b: number
): number => {
  const maxQ = Math.max(qValues.HOME, qValues.AWAY, qValues.DRAW);
  const shiftedHome = Math.exp((qValues.HOME - maxQ) / b);
  const shiftedAway = Math.exp((qValues.AWAY - maxQ) / b);
  const shiftedDraw = Math.exp((qValues.DRAW - maxQ) / b);

  return maxQ + b * Math.log(shiftedHome + shiftedAway + shiftedDraw);
};

const calculateBuyCost = (
  qValues: Record<MarketOutcome, number>,
  b: number,
  outcome: MarketOutcome,
  quantity: number
): number => {
  const qAfter = { ...qValues };
  qAfter[outcome] += quantity;

  const costBefore = calculateLmsrCost(qValues, b);
  const costAfter = calculateLmsrCost(qAfter, b);

  return 100 * (costAfter - costBefore);
};

const calculateSellRefund = (
  qValues: Record<MarketOutcome, number>,
  b: number,
  outcome: MarketOutcome,
  quantity: number
): number => {
  const qAfter = { ...qValues };
  qAfter[outcome] -= quantity;

  const costBefore = calculateLmsrCost(qValues, b);
  const costAfter = calculateLmsrCost(qAfter, b);

  return 100 * (costBefore - costAfter);
};

const estimateBuyQuantityByAmount = (
  qValues: Record<MarketOutcome, number>,
  b: number,
  outcome: MarketOutcome,
  amount: number
): number => {
  let low = 0;
  let high = 1;

  for (let i = 0; i < 60; i += 1) {
    const estimatedCost = calculateBuyCost(qValues, b, outcome, high);
    if (!Number.isFinite(estimatedCost)) {
      return 0;
    }

    if (estimatedCost >= amount) {
      break;
    }

    high *= 2;
  }

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const estimatedCost = calculateBuyCost(qValues, b, outcome, mid);

    if (estimatedCost <= amount) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return truncateToEightDigits(low);
};

const getOutcomeColorClass = (
  outcome: MarketOutcome,
  homeTeamName: string,
  awayTeamName: string
): string => {
  if (outcome === "HOME") {
    return getTeamTextColorClass(homeTeamName);
  }

  if (outcome === "AWAY") {
    return getTeamTextColorClass(awayTeamName);
  }

  return "text-zinc-500";
};

export default function MarketDetailPage() {
  const { session, isLoading } = useUserSession({ requireAuth: true });
  const params = useParams<{ id: string }>();
  const marketId = Number(params.id);
  const isMarketIdValid = Number.isFinite(marketId) && marketId > 0;

  const [marketDetail, setMarketDetail] = useState<MarketDetailItem | null>(
    null
  );
  const [positions, setPositions] = useState<MarketPositionsByOutcome>(
    createEmptyPositionsByOutcome
  );
  const [walletBalance, setWalletBalance] = useState(0);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tradeSide, setTradeSide] = useState<TradeSide>("BUY");
  const [buyInputMode, setBuyInputMode] = useState<BuyInputMode>("QUANTITY");
  const [selectedOutcome, setSelectedOutcome] = useState<MarketOutcome>("HOME");
  const [quantityInput, setQuantityInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [closedHours, setClosedHours] = useState(isMarketClosedHours);
  const [cooldownRemaining, setCooldownRemaining] = useState("");

  const loadMarketData = useCallback(async () => {
    if (!session?.user_id || !isMarketIdValid) {
      return;
    }

    setIsDataLoading(true);
    setError(null);

    try {
      const [detail, userPositions, balance] = await Promise.all([
        getMarketDetail(marketId),
        getMarketPositions(session.user_id, marketId),
        getWalletBalance(session.user_id),
      ]);

      setMarketDetail(detail);
      setPositions(userPositions);
      setWalletBalance(balance);
    } catch (loadError) {
      console.error("Failed to load market detail page data:", loadError);
      setError("마켓 정보를 불러오는 중 오류가 발생했습니다");
    } finally {
      setIsDataLoading(false);
    }
  }, [isMarketIdValid, marketId, session?.user_id]);

  useEffect(() => {
    if (!session?.user_id || !isMarketIdValid) {
      return;
    }

    void loadMarketData();
  }, [isMarketIdValid, loadMarketData, session?.user_id]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setToast(null);
    }, 2800);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [toast]);

  useEffect(() => {
    if (tradeSide !== "SELL") {
      return;
    }

    if (positions[selectedOutcome].quantity > 0) {
      return;
    }

    const fallbackOutcome = OUTCOMES.find(
      (outcome) => positions[outcome].quantity > 0
    );

    if (fallbackOutcome) {
      setSelectedOutcome(fallbackOutcome);
    }
  }, [positions, selectedOutcome, tradeSide]);

  useEffect(() => {
    const checkClosed = () => setClosedHours(isMarketClosedHours());
    checkClosed();
    const id = window.setInterval(checkClosed, 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (tradeSide !== "SELL") {
      setCooldownRemaining("");
      return;
    }

    const purchasedAt = positions[selectedOutcome]?.purchasedAt;
    if (!purchasedAt) {
      setCooldownRemaining("");
      return;
    }

    const update = () => {
      const elapsed = Date.now() - new Date(purchasedAt).getTime();
      const remaining = 30 * 60 * 1000 - elapsed;
      if (remaining <= 0) {
        setCooldownRemaining("");
        return false;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCooldownRemaining(
        `매도 가능까지 ${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      );
      return true;
    };

    if (!update()) return;
    const id = window.setInterval(() => {
      if (!update()) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [tradeSide, selectedOutcome, positions]);

  const displayStatus = useMemo<DisplayMarketStatus>(() => {
    if (!marketDetail) {
      return "OPEN";
    }

    return getDisplayMarketStatus(marketDetail.gameStatus, marketDetail.status);
  }, [marketDetail]);

  const isTradingClosed =
    closedHours ||
    displayStatus === "CLOSED" ||
    displayStatus === "SETTLED" ||
    displayStatus === "CANCELED";

  const hasAnyPosition = OUTCOMES.some(
    (outcome) => positions[outcome].quantity > 0
  );

  const tradePreview = useMemo<TradePreview | null>(() => {
    if (!marketDetail || isTradingClosed) {
      return null;
    }

    const qValues = marketDetail.qValues;
    const b = marketDetail.b;

    if (tradeSide === "BUY") {
      if (buyInputMode === "QUANTITY") {
        const quantity = parsePositiveNumber(quantityInput);
        if (!quantity) {
          return null;
        }

        const totalCost = calculateBuyCost(qValues, b, selectedOutcome, quantity);
        if (!Number.isFinite(totalCost) || totalCost <= 0) {
          return null;
        }

        return {
          quantity,
          totalAmount: totalCost,
          avgPrice: totalCost / quantity,
          projectedBalance: walletBalance - totalCost,
        };
      }

      const amount = parsePositiveNumber(amountInput);
      if (!amount) {
        return null;
      }

      const quantity = estimateBuyQuantityByAmount(
        qValues,
        b,
        selectedOutcome,
        amount
      );

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return null;
      }

      const totalCost = calculateBuyCost(qValues, b, selectedOutcome, quantity);
      if (!Number.isFinite(totalCost) || totalCost <= 0) {
        return null;
      }

      return {
        quantity,
        totalAmount: totalCost,
        avgPrice: totalCost / quantity,
        projectedBalance: walletBalance - totalCost,
      };
    }

    const quantity = parsePositiveNumber(quantityInput);
    if (!quantity) {
      return null;
    }

    const totalRefund = calculateSellRefund(qValues, b, selectedOutcome, quantity);
    if (!Number.isFinite(totalRefund) || totalRefund <= 0) {
      return null;
    }

    return {
      quantity,
      totalAmount: totalRefund,
      avgPrice: totalRefund / quantity,
      projectedBalance: walletBalance + totalRefund,
    };
  }, [
    amountInput,
    buyInputMode,
    isTradingClosed,
    marketDetail,
    quantityInput,
    selectedOutcome,
    tradeSide,
    walletBalance,
  ]);

  const warningMessage = useMemo(() => {
    if (!marketDetail) {
      return null;
    }

    if (closedHours) {
      return "폐장 시간 (01:00~09:00)";
    }

    if (isTradingClosed) {
      return "거래 마감";
    }

    if (tradeSide === "BUY") {
      if (buyInputMode === "AMOUNT") {
        const amount = parsePositiveNumber(amountInput);
        if (!amount) {
          return null;
        }

        if (amount > walletBalance) {
          return "잔고 부족";
        }

        if (!tradePreview || tradePreview.quantity <= 0) {
          return "입력한 금액으로는 매수할 수 없습니다";
        }

        return null;
      }

      if (!tradePreview) {
        return null;
      }

      if (tradePreview.totalAmount > walletBalance) {
        return "잔고 부족";
      }

      return null;
    }

    if (cooldownRemaining) {
      return cooldownRemaining;
    }

    const sellQuantity = parsePositiveNumber(quantityInput);
    if (!sellQuantity) {
      return null;
    }

    if (sellQuantity > positions[selectedOutcome].quantity) {
      return "보유수량 부족";
    }

    return null;
  }, [
    amountInput,
    buyInputMode,
    closedHours,
    cooldownRemaining,
    isTradingClosed,
    marketDetail,
    positions,
    quantityInput,
    selectedOutcome,
    tradePreview,
    tradeSide,
    walletBalance,
  ]);

  const hasRequiredInput = useMemo(() => {
    if (tradeSide === "BUY" && buyInputMode === "AMOUNT") {
      return parsePositiveNumber(amountInput) !== null;
    }

    return parsePositiveNumber(quantityInput) !== null;
  }, [amountInput, buyInputMode, quantityInput, tradeSide]);

  const canOpenConfirmModal =
    Boolean(marketDetail) &&
    !isTradingClosed &&
    hasRequiredInput &&
    Boolean(tradePreview) &&
    !warningMessage &&
    !isSubmitting;

  const homeTeamName = useMemo(() => {
    if (!marketDetail) {
      return "";
    }

    return getDisplayTeamName(
      marketDetail.homeTeamShortName,
      marketDetail.homeTeamName
    );
  }, [marketDetail]);

  const awayTeamName = useMemo(() => {
    if (!marketDetail) {
      return "";
    }

    return getDisplayTeamName(
      marketDetail.awayTeamShortName,
      marketDetail.awayTeamName
    );
  }, [marketDetail]);

  const handleOrderClick = () => {
    if (!canOpenConfirmModal) {
      return;
    }

    setIsConfirmOpen(true);
  };

  const handleConfirmOrder = async () => {
    if (!session?.user_id || !marketDetail || !tradePreview) {
      return;
    }

    try {
      setIsSubmitting(true);

      if (tradeSide === "BUY") {
        if (buyInputMode === "AMOUNT") {
          const amount = parsePositiveNumber(amountInput);
          if (!amount) {
            throw new Error("유효한 매수 금액을 입력해주세요");
          }

          await executeBuyByAmount(
            session.user_id,
            marketDetail.id,
            selectedOutcome,
            amount
          );
        } else {
          await executeBuyOrder(
            session.user_id,
            marketDetail.id,
            selectedOutcome,
            tradePreview.quantity
          );
        }
      } else {
        await executeSellOrder(
          session.user_id,
          marketDetail.id,
          selectedOutcome,
          tradePreview.quantity
        );
      }

      setIsConfirmOpen(false);
      setQuantityInput("");
      setAmountInput("");
      setToast({
        type: "success",
        message:
          tradeSide === "BUY"
            ? "매수 주문이 체결되었습니다"
            : "매도 주문이 체결되었습니다",
      });

      await loadMarketData();
      notifyWalletBalanceRefresh();
    } catch (submitError) {
      console.error("Failed to execute order:", submitError);
      const message =
        submitError instanceof Error
          ? submitError.message
          : "주문 처리 중 오류가 발생했습니다";

      setToast({
        type: "error",
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <p className="py-20 text-center text-zinc-500">로딩 중...</p>;
  }

  if (!session?.user_id) {
    return null;
  }

  if (!isMarketIdValid) {
    return (
      <div className="w-full pt-2">
        <p className="text-sm text-red-500">유효하지 않은 마켓입니다.</p>
        <Link
          href="/"
          className="mt-6 inline-flex h-12 items-center rounded-lg bg-tokhin-green px-4 text-sm font-semibold text-white shadow-[0px_0px_8px_0px_rgba(0,0,0,0.12)]"
        >
          마켓 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  if (isDataLoading || !marketDetail) {
    return <p className="py-20 text-center text-zinc-500">마켓 정보를 불러오는 중...</p>;
  }

  return (
    <>
      {toast ? (
        <div className="pointer-events-none fixed left-1/2 top-6 z-[70] w-[calc(100%-2rem)] max-w-[398px] -translate-x-1/2">
          <div
            className={`rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.20)] ${
              toast.type === "success" ? "bg-tokhin-green" : "bg-red-500"
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      <div className="w-full space-y-4 pt-1">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-zinc-600">
            ← 마켓 목록
          </Link>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASSES[displayStatus]}`}
          >
            {displayStatus}
          </span>
        </div>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <section className="rounded-2xl bg-white p-5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]">
          <h1 className="text-xl font-bold text-black">
            <span className={getTeamTextColorClass(homeTeamName)}>
              {homeTeamName}
            </span>
            <span className="px-1 text-zinc-400">vs</span>
            <span className={getTeamTextColorClass(awayTeamName)}>
              {awayTeamName}
            </span>
          </h1>

          <p className="mt-1 text-sm text-zinc-500">
            {formatGameDate(marketDetail.gameDate)} ·{" "}
            {formatGameTime(marketDetail.gameTime)}
          </p>

          <div className="my-4 h-px w-full bg-zinc-200" />

          <div className="grid grid-cols-3 gap-2">
            {OUTCOMES.map((outcome) => (
              <div key={`label-${outcome}`} className="text-center">
                <p
                  className={`text-xs font-semibold ${getOutcomeColorClass(
                    outcome,
                    homeTeamName,
                    awayTeamName
                  )}`}
                >
                  {outcome}
                </p>
              </div>
            ))}

            {OUTCOMES.map((outcome) => (
              <div key={outcome} className="text-center">
                <p
                  className={`text-3xl font-bold tabular-nums ${getPriceTrendClass(
                    marketDetail.prices[outcome],
                    marketDetail.initialPrices[outcome]
                  )}`}
                >
                  {marketDetail.prices[outcome].toFixed(1)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]">
          <h2 className="text-base font-semibold text-black">내 포지션</h2>

          {hasAnyPosition ? (
            <div className="mt-3 space-y-2">
              {OUTCOMES.map((outcome) => {
                const quantity = positions[outcome].quantity;
                const valuation = quantity * marketDetail.prices[outcome];

                return (
                  <div
                    key={`position-${outcome}`}
                    className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-zinc-700">
                      {outcome}
                    </p>
                    <p className="text-sm tabular-nums text-zinc-700">
                      {quantity > 0
                        ? `${quantityFormatter.format(
                            quantity
                          )}주 · 평가 ${coinFormatter.format(valuation)}코인`
                        : "-"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">보유 포지션 없음</p>
          )}
        </section>

        <section
          className={`rounded-2xl border p-5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)] ${
            tradeSide === "BUY"
              ? "border-green-100 bg-green-50/60"
              : "border-red-100 bg-red-50/60"
          }`}
        >
          {closedHours ? (
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-amber-700">
                폐장 시간 (01:00~09:00)
              </p>
              <p className="mt-1 text-xs text-amber-600">
                오전 9시 이후에 거래해주세요.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTradeSide("BUY")}
              disabled={isSubmitting || isTradingClosed}
              className={`h-12 rounded-lg text-sm font-semibold shadow-[0px_0px_8px_0px_rgba(0,0,0,0.12)] ${
                tradeSide === "BUY"
                  ? "bg-green-500 text-white"
                  : "bg-white text-zinc-500"
              }`}
            >
              매수 (BUY)
            </button>
            <button
              type="button"
              onClick={() => setTradeSide("SELL")}
              disabled={isSubmitting || isTradingClosed}
              className={`h-12 rounded-lg text-sm font-semibold shadow-[0px_0px_8px_0px_rgba(0,0,0,0.12)] ${
                tradeSide === "SELL"
                  ? "bg-red-500 text-white"
                  : "bg-white text-zinc-500"
              }`}
            >
              매도 (SELL)
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {OUTCOMES.map((outcome) => {
              const isDisabledForSell =
                tradeSide === "SELL" && positions[outcome].quantity <= 0;
              const isSelected = selectedOutcome === outcome;

              return (
                <button
                  key={`outcome-${outcome}`}
                  type="button"
                  onClick={() => setSelectedOutcome(outcome)}
                  disabled={isSubmitting || isTradingClosed || isDisabledForSell}
                  className={`rounded-lg border px-2 py-2 text-center transition ${
                    isSelected
                      ? tradeSide === "BUY"
                        ? "border-green-500 bg-green-500/10 text-green-700"
                        : "border-red-500 bg-red-500/10 text-red-700"
                      : "border-zinc-200 bg-white text-zinc-600"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <p className="text-sm font-semibold">{outcome}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {tradeSide === "SELL"
                      ? `보유 ${quantityFormatter.format(
                          positions[outcome].quantity
                        )}주`
                      : ""}
                  </p>
                </button>
              );
            })}
          </div>

          {tradeSide === "BUY" ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBuyInputMode("QUANTITY")}
                disabled={isSubmitting || isTradingClosed}
                className={`h-10 rounded-lg text-sm font-semibold ${
                  buyInputMode === "QUANTITY"
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-500"
                }`}
              >
                수량(주)
              </button>
              <button
                type="button"
                onClick={() => setBuyInputMode("AMOUNT")}
                disabled={isSubmitting || isTradingClosed}
                className={`h-10 rounded-lg text-sm font-semibold ${
                  buyInputMode === "AMOUNT"
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-500"
                }`}
              >
                금액(코인)
              </button>
            </div>
          ) : null}

          <div className="mt-4">
            <label
              htmlFor="order-input"
              className="mb-2 block text-xs font-semibold text-zinc-500"
            >
              {tradeSide === "BUY" && buyInputMode === "AMOUNT"
                ? "투자 금액(코인)"
                : "수량(주)"}
            </label>
            <div className="flex gap-2">
              <Input
                id="order-input"
                type="number"
                min="0"
                step="any"
                value={
                  tradeSide === "BUY" && buyInputMode === "AMOUNT"
                    ? amountInput
                    : quantityInput
                }
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (tradeSide === "BUY" && buyInputMode === "AMOUNT") {
                    setAmountInput(nextValue);
                    return;
                  }

                  setQuantityInput(nextValue);
                }}
                placeholder={
                  tradeSide === "BUY" && buyInputMode === "AMOUNT"
                    ? "예: 500"
                    : "예: 10"
                }
                disabled={isSubmitting || isTradingClosed}
                className="text-center font-semibold tabular-nums text-black"
              />
              {tradeSide === "SELL" && positions[selectedOutcome].quantity > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setQuantityInput(String(positions[selectedOutcome].quantity))
                  }
                  disabled={isSubmitting || isTradingClosed}
                  className="shrink-0 rounded-lg bg-red-500 px-3 text-xs font-semibold text-white shadow-[0px_0px_8px_0px_rgba(0,0,0,0.12)] transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  전량
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-white/80 p-3">
            {tradePreview ? (
              <div className="space-y-1 text-sm text-zinc-700">
                {tradeSide === "BUY" && buyInputMode === "AMOUNT" ? (
                  <p className="font-semibold text-zinc-800">
                    예상 수량: {quantityFormatter.format(tradePreview.quantity)}주
                  </p>
                ) : null}

                <p className="font-semibold text-zinc-800">
                  {tradeSide === "BUY" ? "예상 비용" : "예상 환급금"}:{" "}
                  {coinFormatter.format(tradePreview.totalAmount)}코인
                </p>
                <p>평균 단가: {tradePreview.avgPrice.toFixed(2)}</p>
                <p>
                  잔고: {coinFormatter.format(walletBalance)} →{" "}
                  {coinFormatter.format(Math.max(0, tradePreview.projectedBalance))}
                </p>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                수량 또는 금액을 입력하면 예상 주문 정보를 표시합니다.
              </p>
            )}
          </div>

          {warningMessage ? (
            <p className="mt-3 text-sm font-semibold text-red-500">
              {warningMessage}
            </p>
          ) : null}

          <Button
            type="button"
            onClick={handleOrderClick}
            disabled={!canOpenConfirmModal}
            className={`mt-4 w-full ${
              tradeSide === "BUY"
                ? "bg-green-500 hover:bg-green-600"
                : "bg-red-500 hover:bg-red-600"
            }`}
          >
            {tradeSide === "BUY" ? "매수 주문하기" : "매도 주문하기"}
          </Button>
        </section>
      </div>

      {isConfirmOpen && tradePreview ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-[390px] rounded-2xl bg-white p-5 shadow-[0px_10px_28px_0px_rgba(0,0,0,0.20)]">
            <h3 className="text-lg font-bold text-black">주문 확인</h3>

            <div className="mt-4 space-y-2 text-sm text-zinc-700">
              <p className="font-semibold text-zinc-900">
                {homeTeamName} vs {awayTeamName}
              </p>
              <p>
                {selectedOutcome} {tradeSide === "BUY" ? "매수" : "매도"}
              </p>
              <p>수량: {quantityFormatter.format(tradePreview.quantity)}주</p>
              <p>
                {tradeSide === "BUY" ? "예상 비용" : "예상 환급금"}:{" "}
                {coinFormatter.format(tradePreview.totalAmount)}코인
              </p>
              <p>평균 단가: {tradePreview.avgPrice.toFixed(2)}</p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsConfirmOpen(false)}
                disabled={isSubmitting}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={handleConfirmOrder}
                disabled={isSubmitting}
                className={
                  tradeSide === "BUY"
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-red-500 hover:bg-red-600"
                }
              >
                {isSubmitting ? "주문 처리 중..." : "확인"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
