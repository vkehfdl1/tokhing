// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getGame } from "npm:kbo-game@0.0.2";

type SyncMode = "daily_seed" | "hourly_refresh";

interface RequestBody {
  mode?: SyncMode;
  date?: string;
  initialPrices?: {
    HOME?: number;
    AWAY?: number;
    DRAW?: number;
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const DEFAULT_INITIAL_PRICES = {
  HOME: 47.5,
  AWAY: 47.5,
  DRAW: 5,
} as const;

const normalizeTeamKey = (value: string) => value.trim().toLowerCase();

const formatKstDate = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
};

const parseNumericScore = (value?: number) => {
  return Number.isFinite(value) ? value : null;
};

const sanitizeText = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "";
};

const hasGameChanged = (
  existing: Record<string, unknown>,
  next: Record<string, unknown>
) => {
  return (
    existing.game_time !== next.game_time ||
    existing.home_pitcher !== next.home_pitcher ||
    existing.away_pitcher !== next.away_pitcher ||
    existing.home_score !== next.home_score ||
    existing.away_score !== next.away_score ||
    existing.game_status !== next.game_status
  );
};

const createServiceRoleClient = () => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase 서비스 롤 환경변수가 설정되지 않았습니다.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const syncKboGames = async (supabase: ReturnType<typeof createServiceRoleClient>, body: RequestBody) => {
  const mode = body.mode ?? "daily_seed";
  const targetDate = body.date ?? formatKstDate();
  const initialPrices = {
    HOME: body.initialPrices?.HOME ?? DEFAULT_INITIAL_PRICES.HOME,
    AWAY: body.initialPrices?.AWAY ?? DEFAULT_INITIAL_PRICES.AWAY,
    DRAW: body.initialPrices?.DRAW ?? DEFAULT_INITIAL_PRICES.DRAW,
  };

  const crawledGames = await getGame(new Date(`${targetDate}T00:00:00+09:00`));

  if (!crawledGames || crawledGames.length === 0) {
    return {
      success: true,
      mode,
      date: targetDate,
      fetchedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      marketCreatedCount: 0,
      unmatchedTeams: [],
      message: "대상 날짜의 KBO 경기가 없습니다.",
    };
  }

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, short_name");

  if (teamsError) {
    throw new Error(`팀 목록 조회 실패: ${teamsError.message}`);
  }

  const teamMap = new Map<string, number>();
  (teams ?? []).forEach((team) => {
    teamMap.set(normalizeTeamKey(team.name), team.id);
    if (team.short_name) {
      teamMap.set(normalizeTeamKey(team.short_name), team.id);
    }
  });

  const { data: existingGames, error: existingGamesError } = await supabase
    .from("games")
    .select(
      "id, game_date, game_time, home_team_id, away_team_id, home_pitcher, away_pitcher, home_score, away_score, game_status"
    )
    .eq("game_date", targetDate);

  if (existingGamesError) {
    throw new Error(`기존 경기 조회 실패: ${existingGamesError.message}`);
  }

  const existingByMatchup = new Map<string, Record<string, unknown>>();
  (existingGames ?? []).forEach((game) => {
    if (game.home_team_id && game.away_team_id) {
      existingByMatchup.set(
        `${game.game_date}:${game.home_team_id}:${game.away_team_id}`,
        game
      );
    }
  });

  const unmatchedTeams = new Set<string>();
  const syncedGameIds: number[] = [];
  let insertedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const game of crawledGames) {
    const homeTeamId = teamMap.get(normalizeTeamKey(game.homeTeam));
    const awayTeamId = teamMap.get(normalizeTeamKey(game.awayTeam));

    if (!homeTeamId) {
      unmatchedTeams.add(game.homeTeam);
    }
    if (!awayTeamId) {
      unmatchedTeams.add(game.awayTeam);
    }

    if (!homeTeamId || !awayTeamId) {
      continue;
    }

    const nextGame = {
      game_date: targetDate,
      game_time: game.startTime,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_pitcher: sanitizeText(game.homePitcher),
      away_pitcher: sanitizeText(game.awayPitcher),
      home_score: parseNumericScore(game.score?.home),
      away_score: parseNumericScore(game.score?.away),
      game_status: game.status,
    };

    const key = `${targetDate}:${homeTeamId}:${awayTeamId}`;
    const existing = existingByMatchup.get(key);

    if (existing) {
      syncedGameIds.push(Number(existing.id));

      if (!hasGameChanged(existing, nextGame)) {
        unchangedCount += 1;
        continue;
      }

      const { error } = await supabase
        .from("games")
        .update({
          game_time: nextGame.game_time,
          home_pitcher: nextGame.home_pitcher,
          away_pitcher: nextGame.away_pitcher,
          home_score: nextGame.home_score,
          away_score: nextGame.away_score,
          game_status: nextGame.game_status,
        })
        .eq("id", existing.id);

      if (error) {
        throw new Error(`경기 업데이트 실패: ${error.message}`);
      }

      updatedCount += 1;
      continue;
    }

    const { data, error } = await supabase
      .from("games")
      .insert(nextGame)
      .select("id")
      .single();

    if (error) {
      throw new Error(`경기 생성 실패: ${error.message}`);
    }

    const gameId = Number(data?.id);
    if (!Number.isFinite(gameId) || gameId <= 0) {
      throw new Error("경기 생성 결과 ID가 올바르지 않습니다.");
    }

    syncedGameIds.push(gameId);
    insertedCount += 1;
  }

  let marketCreatedCount = 0;
  if (syncedGameIds.length > 0) {
    const uniqueGameIds = Array.from(new Set(syncedGameIds));
    const { data: existingMarkets, error: existingMarketsError } = await supabase
      .from("markets")
      .select("game_id")
      .in("game_id", uniqueGameIds);

    if (existingMarketsError) {
      throw new Error(`기존 마켓 조회 실패: ${existingMarketsError.message}`);
    }

    const existingMarketGameIds = new Set<number>(
      (existingMarkets ?? [])
        .map((row) => Number(row.game_id))
        .filter((value) => Number.isFinite(value) && value > 0)
    );

    const missingMarketGameIds = uniqueGameIds.filter(
      (gameId) => !existingMarketGameIds.has(gameId)
    );

    for (const gameId of missingMarketGameIds) {
      const { data, error } = await supabase.rpc("create_market", {
        p_game_id: gameId,
        p_initial_home: initialPrices.HOME,
        p_initial_away: initialPrices.AWAY,
        p_initial_draw: initialPrices.DRAW,
      });

      if (error) {
        throw new Error(`마켓 생성 실패(game_id=${gameId}): ${error.message}`);
      }

      const marketId = Number(data);
      if (!Number.isFinite(marketId) || marketId <= 0) {
        throw new Error(`마켓 생성 응답이 올바르지 않습니다(game_id=${gameId}).`);
      }

      marketCreatedCount += 1;
    }
  }

  const unmatchedList = Array.from(unmatchedTeams.values());

  return {
    success: true,
    mode,
    date: targetDate,
    fetchedCount: crawledGames.length,
    insertedCount,
    updatedCount,
    unchangedCount,
    marketCreatedCount,
    unmatchedTeams: unmatchedList,
    message: [
      `KBO 동기화 완료 (${targetDate})`,
      `수집 ${crawledGames.length}건`,
      `신규 ${insertedCount}건`,
      `업데이트 ${updatedCount}건`,
      `변경 없음 ${unchangedCount}건`,
      `마켓 생성 ${marketCreatedCount}건`,
      unmatchedList.length > 0
        ? `매핑 실패 팀: ${unmatchedList.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join(" / "),
  };
};

serve(async (request) => {
  if (request.method !== "POST") {
    return json(405, { success: false, error: "POST 요청만 허용됩니다." });
  }

  const expectedSecret = Deno.env.get("KBO_SYNC_SECRET");
  const providedSecret = request.headers.get("x-kbo-sync-secret");

  if (expectedSecret && providedSecret !== expectedSecret) {
    return json(401, { success: false, error: "유효하지 않은 요청입니다." });
  }

  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    body = {};
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await syncKboGames(supabase, body);

    await supabase.from("settings").upsert(
      {
        key: "kbo_sync_last_run",
        value: {
          ...result,
          executed_at: new Date().toISOString(),
        },
      },
      { onConflict: "key" }
    );

    return json(200, result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "KBO 동기화 중 오류가 발생했습니다.";

    try {
      const supabase = createServiceRoleClient();
      await supabase.from("settings").upsert(
        {
          key: "kbo_sync_last_run",
          value: {
            success: false,
            mode: body.mode ?? "daily_seed",
            date: body.date ?? null,
            error: message,
            executed_at: new Date().toISOString(),
          },
        },
        { onConflict: "key" }
      );
    } catch {
      // Ignore logging failure and return the original error.
    }

    return json(500, {
      success: false,
      error: message,
    });
  }
});
