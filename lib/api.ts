import { formatKstDate, normalizeToKstDateString } from "@/lib/kst";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

interface GameData {
  game_date: string;
  game_time?: string;
  home_team_id?: number;
  away_team_id?: number;
  home_pitcher?: string;
  away_pitcher?: string;
  home_score?: number | null;
  away_score?: number | null;
  game_status?: "SCHEDULED" | "LIVE" | "FINISHED";
}

interface LoginRpcResponse {
  success: boolean;
  user_id?: string;
  username?: string;
  password_changed?: boolean;
  error?: string;
}

interface WalletBalanceRpcResponse {
  success: boolean;
  balance?: number | string;
  error?: string;
}

interface WeeklyCoinsRpcResponse {
  success: boolean;
  users_count?: number | string;
  total_distributed?: number | string;
  error?: string;
}

interface AdminGrantCoinsRpcResponse {
  success: boolean;
  user_id?: string;
  granted_amount?: number | string;
  new_balance?: number | string;
  error?: string;
}

interface SettleMarketRpcResponse {
  success: boolean;
  total_users_settled?: number | string;
  total_coins_distributed?: number | string;
  error?: string;
}

interface MarketStatusRpcResponse {
  success: boolean;
  market_id?: number | string;
  status?: string;
  total_users_refunded?: number | string;
  total_refunded?: number | string;
  error?: string;
}

interface LiquiditySettingRpcResponse {
  success: boolean;
  previous_b?: number | string;
  current_b?: number | string;
  error?: string;
}

interface WeeklyCoinCronStatusRpcResponse {
  success: boolean;
  cron_enabled?: boolean;
  job_name?: string | null;
  last_run_at?: string | null;
  last_status?: string | null;
  message?: string | null;
  error?: string;
}

export interface AdminUser {
  id: string;
  student_number: number | string;
  username: string;
}

export type MarketOutcome = "HOME" | "AWAY" | "DRAW";

export type CrawledGameStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "FINISHED"
  | "CANCELED";

export interface CrawledMatch {
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  homePitcher?: string;
  awayPitcher?: string;
  score?: {
    home: number;
    away: number;
  };
  status: CrawledGameStatus;
}

interface TeamWithShortName {
  id: number;
  name: string;
  short_name?: string | null;
}

type TeamRelation = TeamWithShortName | TeamWithShortName[] | null;

interface GameForMarketListRow {
  id: number;
  game_date: string;
  game_time: string | null;
  game_status: string;
  home_score: number | null;
  away_score: number | null;
  home_team: TeamRelation;
  away_team: TeamRelation;
}

interface MarketForListRow {
  id: number;
  game_id: number;
  status: string;
  result: string | null;
  initial_home_price: number | string | null;
  initial_away_price: number | string | null;
  initial_draw_price: number | string | null;
}

interface LmsrPriceRow {
  outcome: string;
  price: number | string;
}

interface MarketDetailRpcPayload {
  market?: {
    id: number | string;
    game_id: number | string;
    q_home: number | string;
    q_away: number | string;
    q_draw: number | string;
    b: number | string;
    status: string;
    result: string | null;
    initial_home_price: number | string | null;
    initial_away_price: number | string | null;
    initial_draw_price: number | string | null;
  };
  prices?: LmsrPriceRow[] | null;
  game?: {
    id: number | string;
    game_date: string;
    game_time: string | null;
    game_status: string;
    home_pitcher: string | null;
    away_pitcher: string | null;
    home_score: number | string | null;
    away_score: number | string | null;
    home_team: TeamWithShortName | null;
    away_team: TeamWithShortName | null;
  };
}

interface MarketPositionRow {
  outcome: string;
  quantity: number | string;
  avg_entry_price: number | string;
  purchased_at: string | null;
}

interface OrderRpcResponse {
  success: boolean;
  order_id?: number | string;
  quantity?: number | string;
  total_cost?: number | string;
  total_refund?: number | string;
  avg_price?: number | string;
  new_balance?: number | string;
  error?: string;
}

interface UserOpenPositionRpcRow {
  market_id: number | string;
  outcome: string;
  quantity: number | string;
  avg_entry_price: number | string;
  updated_at: string;
}

interface UserOrderByDateRpcRow {
  order_id: number | string;
  market_id: number | string;
  outcome: string;
  side: string;
  quantity: number | string;
  total_cost: number | string;
  avg_price: number | string;
  created_at: string;
}

interface UserSettlementHistoryRpcRow {
  market_id: number | string;
  settled_at: string;
  settlement_amount: number | string;
  net_invested: number | string;
  final_pnl: number | string;
  home_quantity: number | string;
  away_quantity: number | string;
  draw_quantity: number | string;
}

interface MarketForHistoryContextRow {
  id: number;
  game_id: number;
  status: string;
  result: string | null;
}

interface GameForHistoryContextRow {
  id: number;
  game_date: string;
  game_time: string | null;
  home_team: TeamRelation;
  away_team: TeamRelation;
}

interface LeaderboardBalanceRpcRow {
  rank: number | string;
  user_id: string;
  username: string;
  balance: number | string;
}

interface LeaderboardRoiRpcRow {
  rank: number | string;
  user_id: string;
  username: string;
  roi_percent: number | string;
  current_balance: number | string;
  total_granted: number | string;
}

export interface MarketListItem {
  id: number;
  gameId: number;
  gameDate: string;
  gameTime: string | null;
  gameStatus: string;
  marketStatus: string;
  result: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string | null;
  awayTeamShortName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  prices: Record<MarketOutcome, number>;
  initialPrices: Record<MarketOutcome, number | null>;
}

export interface MarketPriceDisplayItem {
  marketId: number;
  gameDate: string;
  gameTime: string | null;
  marketStatus: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string | null;
  awayTeamShortName: string | null;
  prices: Record<MarketOutcome, number>;
}

export interface MarketDetailItem {
  id: number;
  gameId: number;
  status: string;
  result: string | null;
  b: number;
  qValues: Record<MarketOutcome, number>;
  prices: Record<MarketOutcome, number>;
  initialPrices: Record<MarketOutcome, number | null>;
  gameDate: string;
  gameTime: string | null;
  gameStatus: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string | null;
  awayTeamShortName: string | null;
  homePitcher: string | null;
  awayPitcher: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

export interface MarketPosition {
  quantity: number;
  avgEntryPrice: number;
  purchasedAt: string | null;
}

export type MarketPositionsByOutcome = Record<MarketOutcome, MarketPosition>;

export interface MarketOrderExecutionResult {
  orderId: number;
  side: "BUY" | "SELL";
  quantity: number;
  totalAmount: number;
  avgPrice: number;
  newBalance: number;
}

export interface OpenPositionHistoryItem {
  marketId: number;
  outcome: MarketOutcome;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  updatedAt: string;
  gameDate: string;
  gameTime: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string | null;
  awayTeamShortName: string | null;
}

export interface OrderHistoryItem {
  orderId: number;
  marketId: number;
  outcome: MarketOutcome;
  side: "BUY" | "SELL";
  quantity: number;
  totalAmount: number;
  avgPrice: number;
  createdAt: string;
  gameDate: string;
  gameTime: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string | null;
  awayTeamShortName: string | null;
}

export interface SettlementHistoryItem {
  marketId: number;
  settledAt: string;
  settlementAmount: number;
  netInvested: number;
  finalPnl: number;
  result: MarketOutcome | null;
  positions: Record<MarketOutcome, number>;
  gameDate: string;
  gameTime: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string | null;
  awayTeamShortName: string | null;
}

export interface LeaderboardBalanceItem {
  rank: number;
  userId: string;
  username: string;
  balance: number;
}

export interface LeaderboardRoiItem {
  rank: number;
  userId: string;
  username: string;
  roiPercent: number;
  currentBalance: number;
  totalGranted: number;
}

export interface PriceSnapshotItem {
  homePrice: number;
  awayPrice: number;
  drawPrice: number;
  snapshotAt: string;
}

export interface AdminInitialPricesInput {
  HOME: number;
  AWAY: number;
  DRAW: number;
}

export interface AdminMarketEnsureResult {
  createdCount: number;
  skippedCount: number;
  createdMarketIds: number[];
}

export interface MarketSettlementResult {
  totalUsersSettled: number;
  totalCoinsDistributed: number;
}

export interface MarketStatusUpdateResult {
  marketId: number;
  status: string;
  totalUsersRefunded?: number;
  totalRefunded?: number;
}

export interface LiquiditySettingResult {
  previousB: number;
  currentB: number;
}

export interface WeeklyCoinCronStatusResult {
  cronEnabled: boolean;
  jobName: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  message: string | null;
}

const normalizeTeamRelation = (team: TeamRelation): TeamWithShortName | null => {
  if (Array.isArray(team)) {
    return team[0] ?? null;
  }

  return team ?? null;
};

const toNumberOrNull = (
  value: number | string | null | undefined
): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const converted = Number(value);
  return Number.isFinite(converted) ? converted : null;
};

const parseNumericJsonValue = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value && typeof value === "object" && "value" in value) {
    const nested = (value as { value?: unknown }).value;
    const parsed = Number(nested);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const isMarketOutcome = (value: string): value is MarketOutcome => {
  return value === "HOME" || value === "AWAY" || value === "DRAW";
};

const isOrderSide = (value: string): value is "BUY" | "SELL" => {
  return value === "BUY" || value === "SELL";
};

const createEmptyPriceMap = (): Record<MarketOutcome, number> => ({
  HOME: 0,
  AWAY: 0,
  DRAW: 0,
});

const createEmptyPositionsByOutcome = (): MarketPositionsByOutcome => ({
  HOME: { quantity: 0, avgEntryPrice: 0, purchasedAt: null },
  AWAY: { quantity: 0, avgEntryPrice: 0, purchasedAt: null },
  DRAW: { quantity: 0, avgEntryPrice: 0, purchasedAt: null },
});

const getUniqueMarketIds = (values: Array<number | string>): number[] => {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((id): id is number => Number.isFinite(id) && id > 0)
    )
  );
};

const getMarketGameContextByMarketIds = async (marketIds: number[]) => {
  const uniqueMarketIds = getUniqueMarketIds(marketIds);

  if (uniqueMarketIds.length === 0) {
    return {
      marketsById: new Map<number, MarketForHistoryContextRow>(),
      gamesById: new Map<number, GameForHistoryContextRow>(),
    };
  }

  const { data: marketRows, error: marketsError } = await supabase
    .from("markets")
    .select("id, game_id, status, result")
    .in("id", uniqueMarketIds);

  if (marketsError) {
    console.error("Error fetching markets for history context:", marketsError);
    throw new Error("히스토리 마켓 정보 조회 중 오류가 발생했습니다");
  }

  const markets = (marketRows ?? []) as MarketForHistoryContextRow[];
  if (markets.length === 0) {
    return {
      marketsById: new Map<number, MarketForHistoryContextRow>(),
      gamesById: new Map<number, GameForHistoryContextRow>(),
    };
  }

  const marketsById = new Map<number, MarketForHistoryContextRow>(
    markets.map((market) => [market.id, market])
  );
  const gameIds = Array.from(new Set(markets.map((market) => market.game_id)));

  if (gameIds.length === 0) {
    return {
      marketsById,
      gamesById: new Map<number, GameForHistoryContextRow>(),
    };
  }

  const { data: gameRows, error: gamesError } = await supabase
    .from("games")
    .select(
      `
      id,
      game_date,
      game_time,
      home_team:teams!home_team_id(id, name, short_name),
      away_team:teams!away_team_id(id, name, short_name)
    `
    )
    .in("id", gameIds);

  if (gamesError) {
    console.error("Error fetching games for history context:", gamesError);
    throw new Error("히스토리 경기 정보 조회 중 오류가 발생했습니다");
  }

  const games = (gameRows ?? []) as GameForHistoryContextRow[];
  const gamesById = new Map<number, GameForHistoryContextRow>(
    games.map((game) => [game.id, game])
  );

  return { marketsById, gamesById };
};

const getPriceMapByMarketIds = async (
  marketIds: number[]
): Promise<Map<number, Record<MarketOutcome, number>>> => {
  const uniqueMarketIds = getUniqueMarketIds(marketIds);
  const priceEntries = await Promise.all(
    uniqueMarketIds.map(async (marketId) => {
      const { data: rawPrices, error } = await supabase.rpc("lmsr_prices", {
        p_market_id: marketId,
      });

      if (error) {
        console.error("Error fetching lmsr prices for history:", error);
        throw new Error("현재가 조회 중 오류가 발생했습니다");
      }

      const prices = createEmptyPriceMap();
      ((rawPrices ?? []) as LmsrPriceRow[]).forEach((row) => {
        const outcome = row.outcome.toUpperCase();
        const price = Number(row.price);

        if (!isMarketOutcome(outcome) || !Number.isFinite(price)) {
          return;
        }

        prices[outcome] = price;
      });

      return [marketId, prices] as const;
    })
  );

  return new Map<number, Record<MarketOutcome, number>>(priceEntries);
};

const getKstDayRangeAsUtcIso = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("조회 날짜 형식이 올바르지 않습니다");
  }

  const startAt = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(startAt.getTime())) {
    throw new Error("조회 날짜 형식이 올바르지 않습니다");
  }

  const endAt = new Date(startAt.getTime() + 24 * 60 * 60 * 1000);
  return {
    startAtIso: startAt.toISOString(),
    endAtIso: endAt.toISOString(),
  };
};

// Helper to get today's date string in YYYY-MM-DD format for KST
export const getISODate = (date = new Date()) => {
  return formatKstDate(date);
};

export const getMarketTradeDeadline = (
  gameDate: string,
  gameTime: string | null
): Date | null => {
  if (!gameTime) {
    return null;
  }

  const normalizedTime = gameTime.length === 5 ? `${gameTime}:00` : gameTime;
  const gameStartAt = new Date(`${gameDate}T${normalizedTime}+09:00`);

  if (Number.isNaN(gameStartAt.getTime())) {
    return null;
  }

  return new Date(gameStartAt.getTime() + 2 * 60 * 60 * 1000);
};

export const isMarketPastTradeDeadline = (
  gameDate: string,
  gameTime: string | null,
  now = new Date()
): boolean => {
  const deadline = getMarketTradeDeadline(gameDate, gameTime);

  if (!deadline) {
    return false;
  }

  return now.getTime() >= deadline.getTime();
};

export const isMarketClosedHours = (): boolean => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60 * 1000;
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset + offset);
  const hour = kstNow.getHours();
  return hour >= 1 && hour < 9;
};

export const login = async (
  studentNumber: string,
  password: string
): Promise<LoginRpcResponse> => {
  const { data, error } = await supabase.rpc("login", {
    p_student_number: Number(studentNumber),
    p_password: password,
  });

  if (error) {
    console.error("Error calling login RPC:", error);
    throw new Error("로그인 중 오류가 발생했습니다");
  }

  if (!data?.success) {
    return {
      success: false,
      error: data?.error || "학번 또는 비밀번호가 올바르지 않습니다",
    };
  }

  return {
    success: true,
    user_id: data.user_id,
    username: data.username,
    password_changed: data.password_changed,
  };
};

export const changePassword = async (userId: string, newPassword: string) => {
  const { data, error } = await supabase.rpc("change_password", {
    p_user_id: userId,
    p_new_password: newPassword,
  });

  if (error) {
    console.error("Error calling change_password RPC:", error);
    throw new Error("비밀번호 변경 중 오류가 발생했습니다");
  }

  if (!data?.success) {
    throw new Error(data?.error || "비밀번호 변경에 실패했습니다");
  }

  return data;
};

// Fetch Leaderboard (US-008)
export const getLeaderboardBalance = async (): Promise<
  LeaderboardBalanceItem[]
> => {
  const { data, error } = await supabase.rpc("get_leaderboard_balance");

  if (error) {
    console.error("Error calling get_leaderboard_balance RPC:", error);
    throw new Error("리더보드 잔고 순위 조회 중 오류가 발생했습니다");
  }

  const rows = (data ?? []) as LeaderboardBalanceRpcRow[];

  return rows.map((entry) => ({
    rank: Math.trunc(toNumberOrNull(entry.rank) ?? 0),
    userId: entry.user_id,
    username: entry.username,
    balance: toNumberOrNull(entry.balance) ?? 0,
  }));
};

export const getLeaderboardRoi = async (): Promise<LeaderboardRoiItem[]> => {
  const { data, error } = await supabase.rpc("get_leaderboard_roi");

  if (error) {
    console.error("Error calling get_leaderboard_roi RPC:", error);
    throw new Error("리더보드 수익률 순위 조회 중 오류가 발생했습니다");
  }

  const rows = (data ?? []) as LeaderboardRoiRpcRow[];

  return rows.map((entry) => ({
    rank: Math.trunc(toNumberOrNull(entry.rank) ?? 0),
    userId: entry.user_id,
    username: entry.username,
    roiPercent: toNumberOrNull(entry.roi_percent) ?? 0,
    currentBalance: toNumberOrNull(entry.current_balance) ?? 0,
    totalGranted: toNumberOrNull(entry.total_granted) ?? 0,
  }));
};

// Admin Functions for Game Management

// Fetch all teams for admin dropdown
export const getAllTeams = async () => {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .order("name");

  if (error) {
    console.error("Error fetching teams:", error);
    throw new Error("Could not fetch teams.");
  }

  return data;
};

export const getMarketListForDate = async (
  date: string
): Promise<MarketListItem[]> => {
  const { data: gameRows, error: gamesError } = await supabase
    .from("games")
    .select(
      `
      id,
      game_date,
      game_time,
      game_status,
      home_score,
      away_score,
      home_team:teams!home_team_id(id, name, short_name),
      away_team:teams!away_team_id(id, name, short_name)
    `
    )
    .eq("game_date", date)
    .order("game_time", { ascending: true });

  if (gamesError) {
    console.error("Error fetching market games for date:", gamesError);
    throw new Error("마켓 경기 목록 조회 중 오류가 발생했습니다");
  }

  const games = (gameRows ?? []) as GameForMarketListRow[];
  if (games.length === 0) {
    return [];
  }

  const gameIds = games.map((game) => game.id);
  const { data: marketRows, error: marketsError } = await supabase
    .from("markets")
    .select(
      "id, game_id, status, result, initial_home_price, initial_away_price, initial_draw_price"
    )
    .in("game_id", gameIds);

  if (marketsError) {
    console.error("Error fetching markets for date:", marketsError);
    throw new Error("마켓 목록 조회 중 오류가 발생했습니다");
  }

  const markets = (marketRows ?? []) as MarketForListRow[];
  if (markets.length === 0) {
    return [];
  }

  const gamesById = new Map<number, GameForMarketListRow>(
    games.map((game) => [game.id, game])
  );

  const pricedMarkets = await Promise.all(
    markets.map(async (market) => {
      const { data: rawPrices, error: priceError } = await supabase.rpc(
        "lmsr_prices",
        {
          p_market_id: market.id,
        }
      );

      if (priceError) {
        console.error("Error fetching lmsr prices:", priceError);
        throw new Error("마켓 가격 조회 중 오류가 발생했습니다");
      }

      const prices: Record<MarketOutcome, number> = {
        HOME: 0,
        AWAY: 0,
        DRAW: 0,
      };

      ((rawPrices ?? []) as LmsrPriceRow[]).forEach((row) => {
        const outcome = row.outcome.toUpperCase();
        const numericPrice = Number(row.price);

        if (!Number.isFinite(numericPrice)) {
          return;
        }

        if (outcome === "HOME" || outcome === "AWAY" || outcome === "DRAW") {
          prices[outcome] = numericPrice;
        }
      });

      return { market, prices };
    })
  );

  const marketList = pricedMarkets.flatMap(({ market, prices }) => {
    const game = gamesById.get(market.game_id);

    if (!game) {
      return [];
    }

    const homeTeam = normalizeTeamRelation(game.home_team);
    const awayTeam = normalizeTeamRelation(game.away_team);

    if (!homeTeam || !awayTeam) {
      return [];
    }

    return [
      {
        id: market.id,
        gameId: market.game_id,
        gameDate: game.game_date,
        gameTime: game.game_time ?? null,
        gameStatus: game.game_status,
        marketStatus: market.status,
        result: market.result,
        homeTeamName: homeTeam.name,
        awayTeamName: awayTeam.name,
        homeTeamShortName: homeTeam.short_name ?? null,
        awayTeamShortName: awayTeam.short_name ?? null,
        homeScore: game.home_score ?? null,
        awayScore: game.away_score ?? null,
        prices,
        initialPrices: {
          HOME: toNumberOrNull(market.initial_home_price),
          AWAY: toNumberOrNull(market.initial_away_price),
          DRAW: toNumberOrNull(market.initial_draw_price),
        },
      },
    ];
  });

  return marketList.sort((a, b) => {
    const timeA = a.gameTime ?? "";
    const timeB = b.gameTime ?? "";
    if (timeA !== timeB) {
      return timeA.localeCompare(timeB);
    }

    return a.id - b.id;
  });
};

export const getMarkets = async (
  date = getISODate()
): Promise<MarketListItem[]> => {
  return getMarketListForDate(date);
};

export const getMarketPriceDisplay = async (
  date: string
): Promise<MarketPriceDisplayItem[]> => {
  const markets = await getMarketListForDate(date);

  return markets.map((market) => ({
    marketId: market.id,
    gameDate: market.gameDate,
    gameTime: market.gameTime,
    marketStatus: market.marketStatus,
    homeTeamName: market.homeTeamName,
    awayTeamName: market.awayTeamName,
    homeTeamShortName: market.homeTeamShortName,
    awayTeamShortName: market.awayTeamShortName,
    prices: market.prices,
  }));
};

const parseOrderResult = (
  rpcResult: OrderRpcResponse | null,
  side: "BUY" | "SELL"
): MarketOrderExecutionResult => {
  if (!rpcResult?.success) {
    throw new Error(rpcResult?.error || "주문 처리에 실패했습니다");
  }

  const orderId = Number(rpcResult.order_id);
  const quantity = Number(rpcResult.quantity);
  const totalAmount = Number(
    side === "BUY" ? rpcResult.total_cost : rpcResult.total_refund
  );
  const avgPrice = Number(rpcResult.avg_price);
  const newBalance = Number(rpcResult.new_balance);

  if (
    !Number.isFinite(orderId) ||
    !Number.isFinite(quantity) ||
    !Number.isFinite(totalAmount) ||
    !Number.isFinite(avgPrice) ||
    !Number.isFinite(newBalance)
  ) {
    throw new Error("주문 응답 형식이 올바르지 않습니다");
  }

  return {
    orderId,
    side,
    quantity,
    totalAmount,
    avgPrice,
    newBalance,
  };
};

export const getMarketDetail = async (
  marketId: number
): Promise<MarketDetailItem> => {
  if (!Number.isFinite(marketId) || marketId <= 0) {
    throw new Error("유효하지 않은 마켓 ID입니다");
  }

  const { data, error } = await supabase.rpc("get_market_detail", {
    p_market_id: marketId,
  });

  if (error) {
    console.error("Error calling get_market_detail RPC:", error);
    throw new Error("마켓 상세 조회 중 오류가 발생했습니다");
  }

  const rpcResult = data as MarketDetailRpcPayload | null;
  const market = rpcResult?.market;
  const game = rpcResult?.game;

  if (!market || !game) {
    throw new Error("마켓 상세 정보가 올바르지 않습니다");
  }

  const prices = createEmptyPriceMap();
  (rpcResult.prices ?? []).forEach((row) => {
    const outcome = row.outcome.toUpperCase();
    if (!isMarketOutcome(outcome)) {
      return;
    }

    const price = Number(row.price);
    if (Number.isFinite(price)) {
      prices[outcome] = price;
    }
  });

  const homeTeam = normalizeTeamRelation(game.home_team);
  const awayTeam = normalizeTeamRelation(game.away_team);

  if (!homeTeam || !awayTeam) {
    throw new Error("팀 정보를 불러오지 못했습니다");
  }

  const parsedMarketId = Number(market.id);
  const parsedGameId = Number(market.game_id);
  const parsedB = Number(market.b);

  if (
    !Number.isFinite(parsedMarketId) ||
    !Number.isFinite(parsedGameId) ||
    !Number.isFinite(parsedB) ||
    parsedB <= 0
  ) {
    throw new Error("마켓 데이터 형식이 올바르지 않습니다");
  }

  return {
    id: parsedMarketId,
    gameId: parsedGameId,
    status: market.status,
    result: market.result,
    b: parsedB,
    qValues: {
      HOME: toNumberOrNull(market.q_home) ?? 0,
      AWAY: toNumberOrNull(market.q_away) ?? 0,
      DRAW: toNumberOrNull(market.q_draw) ?? 0,
    },
    prices,
    initialPrices: {
      HOME: toNumberOrNull(market.initial_home_price),
      AWAY: toNumberOrNull(market.initial_away_price),
      DRAW: toNumberOrNull(market.initial_draw_price),
    },
    gameDate: game.game_date,
    gameTime: game.game_time ?? null,
    gameStatus: game.game_status,
    homeTeamName: homeTeam.name,
    awayTeamName: awayTeam.name,
    homeTeamShortName: homeTeam.short_name ?? null,
    awayTeamShortName: awayTeam.short_name ?? null,
    homePitcher: game.home_pitcher ?? null,
    awayPitcher: game.away_pitcher ?? null,
    homeScore: toNumberOrNull(game.home_score),
    awayScore: toNumberOrNull(game.away_score),
  };
};

export const getMarketPositions = async (
  userId: string,
  marketId: number
): Promise<MarketPositionsByOutcome> => {
  if (!userId) {
    throw new Error("사용자 정보가 올바르지 않습니다");
  }

  const defaultPositions = createEmptyPositionsByOutcome();
  let rows: MarketPositionRow[] = [];

  const { data, error } = await supabase.rpc("get_market_positions", {
    p_user_id: userId,
    p_market_id: marketId,
  });

  if (error) {
    console.error("Error calling get_market_positions RPC:", error);

    const { data: fallbackRows, error: fallbackError } = await supabase
      .from("positions")
      .select("outcome, quantity, avg_entry_price")
      .eq("user_id", userId)
      .eq("market_id", marketId);

    if (fallbackError) {
      console.error("Fallback query failed for market positions:", fallbackError);
      throw new Error("포지션 조회 중 오류가 발생했습니다");
    }

    rows = (fallbackRows ?? []) as MarketPositionRow[];
  } else {
    rows = (data ?? []) as MarketPositionRow[];
  }

  rows.forEach((row) => {
    const outcome = row.outcome.toUpperCase();
    if (!isMarketOutcome(outcome)) {
      return;
    }

    defaultPositions[outcome] = {
      quantity: toNumberOrNull(row.quantity) ?? 0,
      avgEntryPrice: toNumberOrNull(row.avg_entry_price) ?? 0,
      purchasedAt: row.purchased_at ?? null,
    };
  });

  return defaultPositions;
};

interface PriceSnapshotRpcRow {
  home_price: number | string;
  away_price: number | string;
  draw_price: number | string;
  snapshot_at: string;
}

export const getPriceSnapshots = async (
  marketId: number
): Promise<PriceSnapshotItem[]> => {
  if (!Number.isFinite(marketId) || marketId <= 0) {
    throw new Error("유효하지 않은 마켓 ID입니다");
  }

  const { data, error } = await supabase.rpc("get_price_snapshots", {
    p_market_id: marketId,
  });

  if (error) {
    console.error("Error calling get_price_snapshots RPC:", error);
    throw new Error("가격 스냅샷 조회 중 오류가 발생했습니다");
  }

  const rows = (data ?? []) as PriceSnapshotRpcRow[];

  return rows.map((row) => ({
    homePrice: toNumberOrNull(row.home_price) ?? 0,
    awayPrice: toNumberOrNull(row.away_price) ?? 0,
    drawPrice: toNumberOrNull(row.draw_price) ?? 0,
    snapshotAt: row.snapshot_at,
  }));
};

export const getOpenPositionsHistory = async (
  userId: string
): Promise<OpenPositionHistoryItem[]> => {
  if (!userId) {
    throw new Error("사용자 정보가 올바르지 않습니다");
  }

  const { data, error } = await supabase.rpc("get_user_open_positions", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error calling get_user_open_positions RPC:", error);
    throw new Error("진행 중 포지션 조회 중 오류가 발생했습니다");
  }

  const rows = (data ?? []) as UserOpenPositionRpcRow[];
  if (rows.length === 0) {
    return [];
  }

  const marketIds = getUniqueMarketIds(rows.map((row) => row.market_id));
  if (marketIds.length === 0) {
    return [];
  }

  const [context, pricesByMarket] = await Promise.all([
    getMarketGameContextByMarketIds(marketIds),
    getPriceMapByMarketIds(marketIds),
  ]);

  const items: OpenPositionHistoryItem[] = [];
  rows.forEach((row) => {
    const marketId = Number(row.market_id);
    const outcome = row.outcome.toUpperCase();
    const quantity = toNumberOrNull(row.quantity) ?? 0;
    const avgEntryPrice = toNumberOrNull(row.avg_entry_price) ?? 0;

    if (!Number.isFinite(marketId) || !isMarketOutcome(outcome) || quantity <= 0) {
      return;
    }

    const market = context.marketsById.get(marketId);
    if (!market) {
      return;
    }

    const game = context.gamesById.get(market.game_id);
    if (!game) {
      return;
    }

    const homeTeam = normalizeTeamRelation(game.home_team);
    const awayTeam = normalizeTeamRelation(game.away_team);

    if (!homeTeam || !awayTeam) {
      return;
    }

    const currentPrice = pricesByMarket.get(marketId)?.[outcome] ?? 0;
    const unrealizedPnl = (currentPrice - avgEntryPrice) * quantity;

    items.push({
      marketId,
      outcome,
      quantity,
      avgEntryPrice,
      currentPrice,
      unrealizedPnl,
      updatedAt: row.updated_at,
      gameDate: game.game_date,
      gameTime: game.game_time ?? null,
      homeTeamName: homeTeam.name,
      awayTeamName: awayTeam.name,
      homeTeamShortName: homeTeam.short_name ?? null,
      awayTeamShortName: awayTeam.short_name ?? null,
    });
  });

  return items.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
};

export const getPositions = async (
  userId: string
): Promise<OpenPositionHistoryItem[]> => {
  return getOpenPositionsHistory(userId);
};

export const getOrderHistoryByDate = async (
  userId: string,
  date: string
): Promise<OrderHistoryItem[]> => {
  if (!userId) {
    throw new Error("사용자 정보가 올바르지 않습니다");
  }

  const { startAtIso, endAtIso } = getKstDayRangeAsUtcIso(date);
  const { data, error } = await supabase.rpc("get_user_orders_by_date", {
    p_user_id: userId,
    p_start_at: startAtIso,
    p_end_at: endAtIso,
  });

  if (error) {
    console.error("Error calling get_user_orders_by_date RPC:", error);
    throw new Error("거래 내역 조회 중 오류가 발생했습니다");
  }

  const rows = (data ?? []) as UserOrderByDateRpcRow[];
  if (rows.length === 0) {
    return [];
  }

  const marketIds = getUniqueMarketIds(rows.map((row) => row.market_id));
  if (marketIds.length === 0) {
    return [];
  }

  const context = await getMarketGameContextByMarketIds(marketIds);
  const items: OrderHistoryItem[] = [];

  rows.forEach((row) => {
    const orderId = Number(row.order_id);
    const marketId = Number(row.market_id);
    const outcome = row.outcome.toUpperCase();
    const side = row.side.toUpperCase();

    if (
      !Number.isFinite(orderId) ||
      !Number.isFinite(marketId) ||
      !isMarketOutcome(outcome) ||
      !isOrderSide(side)
    ) {
      return;
    }

    const market = context.marketsById.get(marketId);
    if (!market) {
      return;
    }

    const game = context.gamesById.get(market.game_id);
    if (!game) {
      return;
    }

    const homeTeam = normalizeTeamRelation(game.home_team);
    const awayTeam = normalizeTeamRelation(game.away_team);

    if (!homeTeam || !awayTeam) {
      return;
    }

    items.push({
      orderId,
      marketId,
      outcome,
      side,
      quantity: toNumberOrNull(row.quantity) ?? 0,
      totalAmount: toNumberOrNull(row.total_cost) ?? 0,
      avgPrice: toNumberOrNull(row.avg_price) ?? 0,
      createdAt: row.created_at,
      gameDate: game.game_date,
      gameTime: game.game_time ?? null,
      homeTeamName: homeTeam.name,
      awayTeamName: awayTeam.name,
      homeTeamShortName: homeTeam.short_name ?? null,
      awayTeamShortName: awayTeam.short_name ?? null,
    });
  });

  return items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

export const getOrderHistory = async (
  userId: string,
  date = getISODate()
): Promise<OrderHistoryItem[]> => {
  return getOrderHistoryByDate(userId, date);
};

export const getSettlementHistory = async (
  userId: string
): Promise<SettlementHistoryItem[]> => {
  if (!userId) {
    throw new Error("사용자 정보가 올바르지 않습니다");
  }

  const { data, error } = await supabase.rpc("get_user_settlement_history", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error calling get_user_settlement_history RPC:", error);
    throw new Error("정산 내역 조회 중 오류가 발생했습니다");
  }

  const rows = (data ?? []) as UserSettlementHistoryRpcRow[];
  if (rows.length === 0) {
    return [];
  }

  const marketIds = getUniqueMarketIds(rows.map((row) => row.market_id));
  if (marketIds.length === 0) {
    return [];
  }

  const context = await getMarketGameContextByMarketIds(marketIds);
  const items: SettlementHistoryItem[] = [];

  rows.forEach((row) => {
    const marketId = Number(row.market_id);

    if (!Number.isFinite(marketId)) {
      return;
    }

    const market = context.marketsById.get(marketId);
    if (!market) {
      return;
    }

    const game = context.gamesById.get(market.game_id);
    if (!game) {
      return;
    }

    const homeTeam = normalizeTeamRelation(game.home_team);
    const awayTeam = normalizeTeamRelation(game.away_team);

    if (!homeTeam || !awayTeam) {
      return;
    }

    const marketResult = market.result?.toUpperCase();
    const result = marketResult && isMarketOutcome(marketResult)
      ? marketResult
      : null;

    items.push({
      marketId,
      settledAt: row.settled_at,
      settlementAmount: toNumberOrNull(row.settlement_amount) ?? 0,
      netInvested: toNumberOrNull(row.net_invested) ?? 0,
      finalPnl: toNumberOrNull(row.final_pnl) ?? 0,
      result,
      positions: {
        HOME: toNumberOrNull(row.home_quantity) ?? 0,
        AWAY: toNumberOrNull(row.away_quantity) ?? 0,
        DRAW: toNumberOrNull(row.draw_quantity) ?? 0,
      },
      gameDate: game.game_date,
      gameTime: game.game_time ?? null,
      homeTeamName: homeTeam.name,
      awayTeamName: awayTeam.name,
      homeTeamShortName: homeTeam.short_name ?? null,
      awayTeamShortName: awayTeam.short_name ?? null,
    });
  });

  return items.sort(
    (a, b) => new Date(b.settledAt).getTime() - new Date(a.settledAt).getTime()
  );
};

export const executeBuyOrder = async (
  userId: string,
  marketId: number,
  outcome: MarketOutcome,
  quantity: number
): Promise<MarketOrderExecutionResult> => {
  const { data, error } = await supabase.rpc("execute_buy_order", {
    p_user_id: userId,
    p_market_id: marketId,
    p_outcome: outcome,
    p_quantity: quantity,
  });

  if (error) {
    console.error("Error calling execute_buy_order RPC:", error);
    throw new Error("매수 주문 처리 중 오류가 발생했습니다");
  }

  return parseOrderResult(data as OrderRpcResponse | null, "BUY");
};

export const executeBuyByAmount = async (
  userId: string,
  marketId: number,
  outcome: MarketOutcome,
  amount: number
): Promise<MarketOrderExecutionResult> => {
  const { data, error } = await supabase.rpc("execute_buy_by_amount", {
    p_user_id: userId,
    p_market_id: marketId,
    p_outcome: outcome,
    p_amount: amount,
  });

  if (error) {
    console.error("Error calling execute_buy_by_amount RPC:", error);
    throw new Error("금액 매수 주문 처리 중 오류가 발생했습니다");
  }

  return parseOrderResult(data as OrderRpcResponse | null, "BUY");
};

export const executeSellOrder = async (
  userId: string,
  marketId: number,
  outcome: MarketOutcome,
  quantity: number
): Promise<MarketOrderExecutionResult> => {
  const { data, error } = await supabase.rpc("execute_sell_order", {
    p_user_id: userId,
    p_market_id: marketId,
    p_outcome: outcome,
    p_quantity: quantity,
  });

  if (error) {
    console.error("Error calling execute_sell_order RPC:", error);
    throw new Error("매도 주문 처리 중 오류가 발생했습니다");
  }

  return parseOrderResult(data as OrderRpcResponse | null, "SELL");
};

// Fetch games for a specific date (admin)
export const getGamesForDate = async (date: string) => {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("game_date", date)
    .order("game_time");

  if (error) {
    console.error("Error fetching games for date:", error);
    throw new Error("Could not fetch games.");
  }

  return data;
};

// Update an existing game (admin)
export const updateGame = async (gameId: number, gameData: GameData) => {
  const { data, error } = await supabase
    .from("games")
    .update(gameData)
    .eq("id", gameId)
    .select()
    .single();

  if (error) {
    console.error("Error updating game:", error);
    throw new Error("Could not update game.");
  }

  return data;
};

// Insert a new game (admin)
export const insertGame = async (gameData: GameData) => {
  const { data, error } = await supabase
    .from("games")
    .insert(gameData)
    .select()
    .single();

  if (error) {
    console.error("Error inserting game:", error);
    throw new Error("Could not create game.");
  }

  return data;
};

// Delete a game (admin)
export const deleteGame = async (gameId: number) => {
  const { data, error } = await supabase
    .from("games")
    .delete()
    .eq("id", gameId);

  if (error) {
    console.error("Error deleting game:", error);
    throw new Error("Could not delete game.");
  }

  return data;
};

// Fetch game data from external source via API route to avoid CORS issues
export const getGameData = async (
  date: Date | string
): Promise<CrawledMatch[] | null> => {
  try {
    const targetDate =
      date instanceof Date ? getISODate(date) : normalizeToKstDateString(date);

    if (!targetDate) {
      throw new Error("Invalid game date");
    }

    const response = await fetch("/api/crawl-games", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date: targetDate,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Failed to fetch game data");
    }

    if (!Array.isArray(result.data)) {
      throw new Error("Invalid game data format");
    }

    return result.data as CrawledMatch[];
  } catch (error) {
    console.error("Error fetching game data:", error);
    return null;
  }
};

export const getNaverWbcGameData = async (
  date: Date | string
): Promise<CrawledMatch[] | null> => {
  try {
    const targetDate =
      date instanceof Date ? getISODate(date) : normalizeToKstDateString(date);

    if (!targetDate) {
      throw new Error("Invalid naver game date");
    }

    const response = await fetch("/api/crawl-naver-wbc-games", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date: targetDate,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Failed to fetch naver game data");
    }

    if (!Array.isArray(result.data)) {
      throw new Error("Invalid naver game data format");
    }

    return result.data as CrawledMatch[];
  } catch (error) {
    console.error("Error fetching naver game data:", error);
    return null;
  }
};

export const ensureMarketsForGames = async (
  gameIds: number[],
  initialPrices: AdminInitialPricesInput
): Promise<AdminMarketEnsureResult> => {
  const uniqueGameIds = Array.from(
    new Set(
      gameIds.filter(
        (gameId): gameId is number => Number.isFinite(gameId) && gameId > 0
      )
    )
  );

  if (uniqueGameIds.length === 0) {
    return {
      createdCount: 0,
      skippedCount: 0,
      createdMarketIds: [],
    };
  }

  const homePrice = Number(initialPrices.HOME);
  const awayPrice = Number(initialPrices.AWAY);
  const drawPrice = Number(initialPrices.DRAW);

  if (
    !Number.isFinite(homePrice) ||
    !Number.isFinite(awayPrice) ||
    !Number.isFinite(drawPrice) ||
    homePrice <= 0 ||
    awayPrice <= 0 ||
    drawPrice <= 0
  ) {
    throw new Error("초기 가격은 모두 0보다 큰 숫자여야 합니다");
  }

  const total = homePrice + awayPrice + drawPrice;
  if (Math.abs(total - 100) > 0.000001) {
    throw new Error("초기 가격의 합은 100이어야 합니다");
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("markets")
    .select("game_id")
    .in("game_id", uniqueGameIds);

  if (existingError) {
    console.error("Error checking existing markets:", existingError);
    throw new Error("기존 마켓 조회 중 오류가 발생했습니다");
  }

  const existingGameIds = new Set<number>(
    (existingRows ?? [])
      .map((row) => Number((row as { game_id: number | string }).game_id))
      .filter((gameId): gameId is number => Number.isFinite(gameId) && gameId > 0)
  );

  const missingGameIds = uniqueGameIds.filter(
    (gameId) => !existingGameIds.has(gameId)
  );

  if (missingGameIds.length === 0) {
    return {
      createdCount: 0,
      skippedCount: uniqueGameIds.length,
      createdMarketIds: [],
    };
  }

  const createdMarketIds: number[] = [];
  for (const gameId of missingGameIds) {
    const { data, error } = await supabase.rpc("create_market", {
      p_game_id: gameId,
      p_initial_home: homePrice,
      p_initial_away: awayPrice,
      p_initial_draw: drawPrice,
    });

    if (error) {
      const loweredMessage = error.message.toLowerCase();
      const isDuplicateError =
        loweredMessage.includes("duplicate") || loweredMessage.includes("unique");

      if (isDuplicateError) {
        continue;
      }

      console.error("Error creating market for game:", { gameId, error });
      throw new Error("마켓 자동 생성 중 오류가 발생했습니다");
    }

    const marketId = Number(data);
    if (!Number.isFinite(marketId) || marketId <= 0) {
      throw new Error("마켓 생성 응답이 올바르지 않습니다");
    }

    createdMarketIds.push(marketId);
  }

  return {
    createdCount: createdMarketIds.length,
    skippedCount: uniqueGameIds.length - createdMarketIds.length,
    createdMarketIds,
  };
};

export const settleMarket = async (
  marketId: number,
  result: MarketOutcome
): Promise<MarketSettlementResult> => {
  if (!Number.isFinite(marketId) || marketId <= 0) {
    throw new Error("유효하지 않은 마켓 ID입니다");
  }

  if (!isMarketOutcome(result)) {
    throw new Error("정산 결과는 HOME, AWAY, DRAW 중 하나여야 합니다");
  }

  const { data, error } = await supabase.rpc("settle_market", {
    p_market_id: marketId,
    p_result: result,
  });

  if (error) {
    console.error("Error calling settle_market RPC:", error);
    throw new Error("마켓 정산 중 오류가 발생했습니다");
  }

  const rpcResult = data as SettleMarketRpcResponse | null;
  if (!rpcResult?.success) {
    throw new Error(rpcResult?.error || "마켓 정산에 실패했습니다");
  }

  const totalUsersSettled = Number(rpcResult.total_users_settled ?? 0);
  const totalCoinsDistributed = Number(rpcResult.total_coins_distributed ?? 0);

  if (
    !Number.isFinite(totalUsersSettled) ||
    !Number.isFinite(totalCoinsDistributed)
  ) {
    throw new Error("마켓 정산 응답 형식이 올바르지 않습니다");
  }

  return {
    totalUsersSettled,
    totalCoinsDistributed,
  };
};

export const closeMarket = async (
  marketId: number
): Promise<MarketStatusUpdateResult> => {
  if (!Number.isFinite(marketId) || marketId <= 0) {
    throw new Error("유효하지 않은 마켓 ID입니다");
  }

  const { data, error } = await supabase.rpc("close_market", {
    p_market_id: marketId,
  });

  if (error) {
    console.error("Error calling close_market RPC:", error);
    throw new Error("마켓 종료 중 오류가 발생했습니다");
  }

  const rpcResult = data as MarketStatusRpcResponse | null;
  if (!rpcResult?.success) {
    throw new Error(rpcResult?.error || "마켓 종료에 실패했습니다");
  }

  const parsedMarketId = Number(rpcResult.market_id ?? marketId);
  if (!Number.isFinite(parsedMarketId) || parsedMarketId <= 0) {
    throw new Error("마켓 종료 응답 형식이 올바르지 않습니다");
  }

  return {
    marketId: parsedMarketId,
    status: rpcResult.status ?? "CLOSED",
  };
};

export const cancelMarket = async (
  marketId: number
): Promise<MarketStatusUpdateResult> => {
  if (!Number.isFinite(marketId) || marketId <= 0) {
    throw new Error("유효하지 않은 마켓 ID입니다");
  }

  const { data, error } = await supabase.rpc("cancel_market", {
    p_market_id: marketId,
  });

  if (error) {
    console.error("Error calling cancel_market RPC:", error);
    throw new Error("마켓 취소 중 오류가 발생했습니다");
  }

  const rpcResult = data as MarketStatusRpcResponse | null;
  if (!rpcResult?.success) {
    throw new Error(rpcResult?.error || "마켓 취소에 실패했습니다");
  }

  const parsedMarketId = Number(rpcResult.market_id ?? marketId);
  if (!Number.isFinite(parsedMarketId) || parsedMarketId <= 0) {
    throw new Error("마켓 취소 응답 형식이 올바르지 않습니다");
  }

  return {
    marketId: parsedMarketId,
    status: rpcResult.status ?? "CANCELED",
    totalUsersRefunded: Number(rpcResult.total_users_refunded ?? 0),
    totalRefunded: Number(rpcResult.total_refunded ?? 0),
  };
};

export const getLiquidityB = async (): Promise<number> => {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "liquidity_b")
    .maybeSingle();

  if (error) {
    console.error("Error fetching liquidity_b setting:", error);
    throw new Error("현재 b값 조회 중 오류가 발생했습니다");
  }

  const parsed = parseNumericJsonValue(data?.value);
  if (parsed === null || parsed <= 0) {
    throw new Error("현재 b값이 올바르지 않습니다");
  }

  return parsed;
};

export const updateLiquidityB = async (
  nextB: number
): Promise<LiquiditySettingResult> => {
  if (!Number.isFinite(nextB) || nextB <= 0) {
    throw new Error("b값은 0보다 큰 숫자여야 합니다");
  }

  const { data, error } = await supabase.rpc("set_liquidity_b", {
    p_b: nextB,
  });

  if (error) {
    console.error("Error calling set_liquidity_b RPC:", error);
    throw new Error("b값 변경 중 오류가 발생했습니다");
  }

  const rpcResult = data as LiquiditySettingRpcResponse | null;
  if (!rpcResult?.success) {
    throw new Error(rpcResult?.error || "b값 변경에 실패했습니다");
  }

  const previousB = Number(rpcResult.previous_b ?? nextB);
  const currentB = Number(rpcResult.current_b ?? nextB);

  if (!Number.isFinite(previousB) || !Number.isFinite(currentB) || currentB <= 0) {
    throw new Error("b값 변경 응답 형식이 올바르지 않습니다");
  }

  return {
    previousB,
    currentB,
  };
};

export const getWeeklyCoinCronStatus =
  async (): Promise<WeeklyCoinCronStatusResult> => {
    const { data, error } = await supabase.rpc("get_weekly_coin_cron_status");

    if (error) {
      console.error("Error calling get_weekly_coin_cron_status RPC:", error);
      throw new Error("자동 지급 상태 조회 중 오류가 발생했습니다");
    }

    const rpcResult = data as WeeklyCoinCronStatusRpcResponse | null;
    if (!rpcResult?.success) {
      throw new Error(rpcResult?.error || "자동 지급 상태 조회에 실패했습니다");
    }

    return {
      cronEnabled: Boolean(rpcResult.cron_enabled),
      jobName: typeof rpcResult.job_name === "string" ? rpcResult.job_name : null,
      lastRunAt:
        typeof rpcResult.last_run_at === "string" ? rpcResult.last_run_at : null,
      lastStatus:
        typeof rpcResult.last_status === "string" ? rpcResult.last_status : null,
      message: typeof rpcResult.message === "string" ? rpcResult.message : null,
    };
  };

export const getWalletBalance = async (userId: string): Promise<number> => {
  const { data, error } = await supabase.rpc("get_wallet_balance", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error calling get_wallet_balance RPC:", error);
    throw new Error("지갑 잔고 조회 중 오류가 발생했습니다");
  }

  const rpcResult = data as WalletBalanceRpcResponse | null;
  if (!rpcResult?.success) {
    throw new Error(rpcResult?.error || "지갑 잔고 조회에 실패했습니다");
  }

  return Number(rpcResult.balance ?? 0);
};

export const distributeWeeklyCoins = async (amount = 300) => {
  const { data, error } = await supabase.rpc("distribute_weekly_coins", {
    p_amount: amount,
  });

  if (error) {
    console.error("Error calling distribute_weekly_coins RPC:", error);
    throw new Error("전체 코인 지급 중 오류가 발생했습니다");
  }

  const rpcResult = data as WeeklyCoinsRpcResponse | null;
  if (!rpcResult?.success) {
    throw new Error(rpcResult?.error || "전체 코인 지급에 실패했습니다");
  }

  return {
    success: true,
    users_count: Number(rpcResult.users_count ?? 0),
    total_distributed: Number(rpcResult.total_distributed ?? 0),
  };
};

export const adminGrantCoins = async (userId: string, amount: number) => {
  const { data, error } = await supabase.rpc("admin_grant_coins", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    console.error("Error calling admin_grant_coins RPC:", error);
    throw new Error("코인 지급 중 오류가 발생했습니다");
  }

  const rpcResult = data as AdminGrantCoinsRpcResponse | null;
  if (!rpcResult?.success) {
    throw new Error(rpcResult?.error || "코인 지급에 실패했습니다");
  }

  return {
    success: true,
    user_id: rpcResult.user_id || userId,
    granted_amount: Number(rpcResult.granted_amount ?? amount),
    new_balance: Number(rpcResult.new_balance ?? 0),
  };
};

export const getUsersForAdmin = async (): Promise<AdminUser[]> => {
  const { data, error } = await supabase
    .from("users_public")
    .select("id, student_number, username")
    .order("student_number", { ascending: true });

  if (error) {
    console.error("Error fetching users for admin:", error);
    throw new Error("유저 목록 조회 중 오류가 발생했습니다");
  }

  return (data ?? []) as AdminUser[];
};

export const adminResetPassword = async (studentNumber: number) => {
  const { data, error } = await supabase.rpc("admin_reset_password", {
    p_student_number: studentNumber,
  });

  if (error) {
    console.error("Error calling admin_reset_password RPC:", error);
    throw new Error("비밀번호 초기화 중 오류가 발생했습니다");
  }

  const rpcResult = data as {
    success: boolean;
    error?: string;
    username?: string;
    student_number?: number;
  } | null;

  if (!rpcResult?.success) {
    throw new Error(rpcResult?.error || "비밀번호 초기화에 실패했습니다");
  }

  return {
    success: true,
    username: rpcResult.username ?? "",
    studentNumber: Number(rpcResult.student_number ?? studentNumber),
  };
};
