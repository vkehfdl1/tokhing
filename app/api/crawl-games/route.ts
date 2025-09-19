import { NextRequest, NextResponse } from "next/server";
import { getGame } from "kbo-game";

export async function POST(request: NextRequest) {
  try {
    const { date } = await request.json();
    
    if (!date) {
      return NextResponse.json(
        { error: "Date is required" },
        { status: 400 }
      );
    }

    const targetDate = new Date(date);
    console.log("Crawling games for date:", targetDate);
    
    const crawledData = await getGame(targetDate);
    
    if (!crawledData) {
      return NextResponse.json(
        { error: "Failed to fetch game data" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
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