import { NextRequest, NextResponse } from "next/server";
import { normalizeToKstDateString } from "@/lib/kst";

type GameStatus = "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELED";

interface NaverTodayGame {
  gameDateTime?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamScore?: number | null;
  awayTeamScore?: number | null;
  statusCode?: string;
}

interface NaverTodayGamesResponse {
  success?: boolean;
  error?: {
    message?: string;
  };
  result?: {
    games?: NaverTodayGame[];
  };
}

const NAVER_API_BASE_URL = "https://api-gw.sports.naver.com";

const toStartTime = (value: string | undefined): string => {
  if (!value) {
    return "00:00";
  }

  const matched = value.match(/T(\d{2}:\d{2})/);
  if (matched?.[1]) {
    return matched[1];
  }

  return "00:00";
};

const toStatus = (statusCode: string | undefined): GameStatus => {
  if (!statusCode) {
    return "SCHEDULED";
  }

  switch (statusCode) {
    case "BEFORE":
      return "SCHEDULED";
    case "END":
      return "FINISHED";
    case "CANCEL":
      return "CANCELED";
    case "PLAY":
    case "LIVE":
    case "IN_PROGRESS":
      return "IN_PROGRESS";
    default:
      return "SCHEDULED";
  }
};

const toScore = (score: number | null | undefined): number => {
  if (typeof score !== "number" || Number.isNaN(score)) {
    return 0;
  }
  return score;
};

export async function POST(request: NextRequest) {
  try {
    const { date } = await request.json();

    if (!date || typeof date !== "string") {
      return NextResponse.json(
        { success: false, error: "날짜가 필요합니다." },
        { status: 400 }
      );
    }

    const targetDate = normalizeToKstDateString(date);
    if (!targetDate) {
      return NextResponse.json(
        { success: false, error: "유효하지 않은 날짜입니다." },
        { status: 400 }
      );
    }

    const seasonYear = targetDate.slice(0, 4);
    const url = new URL(`${NAVER_API_BASE_URL}/schedule/today-games`);
    url.searchParams.set("date", targetDate);
    url.searchParams.set("upperCategoryId", "wbaseball");
    url.searchParams.set("categoryId", "wbc");
    url.searchParams.set("phaseCode", "GROUP");
    url.searchParams.set("group", "ALL");
    url.searchParams.set("seasonYear", seasonYear);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `네이버 API 요청 실패 (${response.status})`,
        },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as NaverTodayGamesResponse;

    if (!payload.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            payload.error?.message ??
            "네이버 경기 정보를 불러오지 못했습니다.",
        },
        { status: 502 }
      );
    }

    const games = Array.isArray(payload.result?.games) ? payload.result.games : [];
    const normalizedGames = games
      .map((game) => ({
        homeTeam: (game.homeTeamName ?? "").trim(),
        awayTeam: (game.awayTeamName ?? "").trim(),
        startTime: toStartTime(game.gameDateTime),
        homePitcher: "",
        awayPitcher: "",
        score: {
          home: toScore(game.homeTeamScore),
          away: toScore(game.awayTeamScore),
        },
        status: toStatus(game.statusCode),
      }))
      .filter((game) => game.homeTeam && game.awayTeam);

    return NextResponse.json({
      success: true,
      data: normalizedGames,
    });
  } catch (error) {
    console.error("Error in crawl-naver-wbc-games API:", error);
    return NextResponse.json(
      { success: false, error: "내부 서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
