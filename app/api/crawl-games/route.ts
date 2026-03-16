import { NextRequest, NextResponse } from "next/server";
import { getGame } from "kbo-game";
import { createKstQueryDate, normalizeToKstDateString } from "@/lib/kst";

export async function POST(request: NextRequest) {
  try {
    const { date } = await request.json();

    const targetDate =
      typeof date === "string" ? normalizeToKstDateString(date) : null;

    if (!targetDate) {
      return NextResponse.json(
        { error: "Date is required" },
        { status: 400 }
      );
    }

    const queryDate = createKstQueryDate(targetDate);
    console.log("Crawling games for date:", targetDate, queryDate.toISOString());

    const crawledData = await getGame(queryDate);

    if (!crawledData) {
      return NextResponse.json(
        { error: "Failed to fetch game data" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      date: targetDate,
      data: crawledData
    });
  } catch (error) {
    console.error("Error in crawl-games API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
