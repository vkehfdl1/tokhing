import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// Type definitions
interface Team {
  id: number;
  name: string;
  short_name: string;
}

interface GameWithTeams {
  id: number;
  home_team_id: number;
  away_team_id: number;
  home_team: Team | Team[];
  away_team: Team | Team[];
}

interface Game {
  id?: number;
  game_date: string;
  game_time: string;
  home_team_id: number;
  away_team_id: number;
  home_pitcher: string;
  away_pitcher: string;
  home_score: number | null;
  away_score: number | null;
  game_status: "SCHEDULED" | "LIVE" | "FINISHED";
}

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

// Helper to get today's date string in YYYY-MM-DD format for KST
export const getISODate = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60 * 1000; // Convert minutes to milliseconds
  const kstOffset = 9 * 60 * 60 * 1000; // KST is UTC+9
  const kstDate = new Date(date.getTime() + kstOffset + offset);
  return kstDate.toISOString().slice(0, 10);
};

// 1. Fetch User by Student ID
export const getUserByStudentId = async (studentId: string) => {
  const { data, error } = await supabase
    .from("users")
    .select("id, student_number, username")
    .eq("student_number", studentId)
    .single();

  if (error) {
    console.error("Error fetching user:", error);
    throw new Error("User not found or connection issue.");
  }
  // Map to frontend-expected fields if necessary, e.g., name
  return { ...data, name: data.username };
};

// 2. Fetch Today's Games with User's Predictions
export const getTodaysGamesWithPredictions = async (userId: string) => {
  const today = getISODate();
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select(
      `
      id, game_date, game_status, home_pitcher, away_pitcher, home_score, away_score,
      home_team:teams!home_team_id(id, name),
      away_team:teams!away_team_id(id, name)
    `
    )
    .eq("game_date", today);

  if (gamesError) {
    console.error("Error fetching today's games:", gamesError);
    return [];
  }

  const gameIds = games.map((g) => g.id);
  const { data: predictions, error: predsError } = await supabase
    .from("predictions")
    .select("game_id, predicted_winner_team_id")
    .eq("user_id", userId)
    .in("game_id", gameIds);

  if (predsError) {
    console.error("Error fetching predictions:", predsError);
    // Proceed with games even if predictions fail
  }

  return games.map((game) => {
    const prediction = predictions?.find((p) => p.game_id === game.id) || null;
    return { ...game, prediction };
  });
};

// 3. Submit or Update a Prediction
export const submitPrediction = async (
  userId: string,
  gameId: number,
  predictedTeamId: number
) => {
  const { data, error } = await supabase
    .from("predictions")
    .upsert(
      {
        user_id: userId,
        game_id: gameId,
        predicted_winner_team_id: predictedTeamId,
      },
      { onConflict: "user_id, game_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("Error submitting prediction:", error);
    throw new Error("Failed to save prediction.");
  }
  return data;
};

// 3b. Submit Multiple Predictions at Once
export const submitMultiplePredictions = async (
  userId: string,
  predictions: { game_id: number; predicted_winner_team_id: number }[]
) => {
  const predictionsWithUser = predictions.map((p) => ({
    ...p,
    user_id: userId,
  }));

  const { data, error } = await supabase
    .from("predictions")
    .upsert(predictionsWithUser, { onConflict: "user_id, game_id" })
    .select();

  if (error) {
    console.error("Error submitting multiple predictions:", error);
    throw new Error("Failed to save predictions.");
  }
  return data;
};

// 4. Fetch Prediction History for a User
export const getPredictionHistory = async (userId: string) => {
  // 1. Define the date range: from the first day of the current month to yesterday.
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // 2. Fetch all finished games within this date range.
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select(
      `
            id, game_date, home_score, away_score,
            home_team:teams!home_team_id(id, name),
            away_team:teams!away_team_id(id, name)
        `
    )
    .gte("game_date", firstDayOfMonth.toISOString().slice(0, 10))
    .lte("game_date", yesterday.toISOString().slice(0, 10))
    .eq("is_finished", true)
    .order("game_date", { ascending: false });

  if (gamesError) {
    console.error("Error fetching games for history:", gamesError);
    throw new Error("Could not fetch game history.");
  }

  // 3. Fetch all of the user's predictions for these games.
  const gameIds = games.map((g) => g.id);
  const { data: predictions, error: predsError } = await supabase
    .from("predictions")
    .select("game_id, predicted_winner_team_id")
    .eq("user_id", userId)
    .in("game_id", gameIds);

  if (predsError) {
    console.error("Error fetching user predictions for history:", predsError);
    // Continue without predictions if this fails
  }

  // 4. Combine the data.
  return games.map((game) => {
    const prediction = predictions?.find((p) => p.game_id === game.id);

    // Handle both array and object formats for team data
    const homeTeam = Array.isArray(game.home_team)
      ? game.home_team[0]
      : game.home_team;
    const awayTeam = Array.isArray(game.away_team)
      ? game.away_team[0]
      : game.away_team;

    const actual_winner_id =
      game.home_score > game.away_score ? homeTeam.id : awayTeam.id;

    return {
      ...game,
      prediction: prediction
        ? {
            predicted_team_name:
              prediction.predicted_winner_team_id === homeTeam.id
                ? homeTeam.name
                : awayTeam.name,
            is_correct:
              prediction.predicted_winner_team_id === actual_winner_id,
          }
        : null, // Return null if no prediction was made
    };
  });
};

// 4b. Fetch Prediction History for a specific date
export const getHistoryForDate = async (userId: string, date: string) => {
  // 1. Fetch all games for the given date that have finished (have scores)
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select(
      `
            id, game_date, home_score, away_score, game_status,
            home_team:teams!home_team_id(id, name),
            away_team:teams!away_team_id(id, name)
        `
    )
    .eq("game_date", date)
    .eq("game_status", "FINISHED");

  if (gamesError) {
    console.error(`Error fetching games for date ${date}:`, gamesError);
    throw new Error("Could not fetch game history for that date.");
  }

  // 2. Fetch the user's predictions for all games on this date (not just finished ones)
  // This way we can show predictions even for games that haven't finished yet
  const { data: allDayGames, error: allGamesError } = await supabase
    .from("games")
    .select("id")
    .eq("game_date", date);

  if (allGamesError) {
    console.error(`Error fetching all games for date ${date}:`, allGamesError);
    throw new Error("Could not fetch games for prediction lookup.");
  }

  const allGameIds = allDayGames.map((g) => g.id);
  const { data: predictions, error: predsError } = await supabase
    .from("predictions")
    .select("game_id, predicted_winner_team_id, points_earned, is_settled")
    .eq("user_id", userId)
    .in("game_id", allGameIds);

  if (predsError) {
    console.error(`Error fetching predictions for date ${date}:`, predsError);
    // Continue, but predictions will be missing.
  }

  // 3. If no finished games, but user has predictions, show message about pending games
  if (games.length === 0) {
    const userPredictionsCount = predictions?.length || 0;
    if (userPredictionsCount > 0) {
      return {
        games: [],
        totalPoints: 0,
        message: `You have ${userPredictionsCount} prediction(s) for this date, but games haven't finished yet.`,
      };
    }
    return { games: [], totalPoints: 0 };
  }

  // 4. Combine the data and calculate total points for the day.
  let totalPoints = 0;
  const combinedData = games.map((game) => {
    const prediction = predictions?.find((p) => p.game_id === game.id);

    // Calculate points earned only for settled predictions
    if (prediction && prediction.points_earned && prediction.is_settled) {
      totalPoints += prediction.points_earned;
    }

    // Determine the actual winner (handle ties if necessary)
    let actual_winner_id = null;
    let gameResult = "TIE";
    if (game.home_score !== null && game.away_score !== null) {
      if (game.home_score > game.away_score) {
        // Handle both array and object formats for team data
        actual_winner_id =
          (Array.isArray(game.home_team) ? game.home_team[0] : game.home_team)
            ?.id || null;
        gameResult = "HOME_WIN";
      } else if (game.away_score > game.home_score) {
        actual_winner_id =
          (Array.isArray(game.away_team) ? game.away_team[0] : game.away_team)
            ?.id || null;
        gameResult = "AWAY_WIN";
      }
    }

    // Get team names and ids safely
    const homeTeam = Array.isArray(game.home_team)
      ? game.home_team[0]
      : game.home_team;
    const awayTeam = Array.isArray(game.away_team)
      ? game.away_team[0]
      : game.away_team;

    return {
      ...game,
      gameResult,
      prediction: prediction
        ? {
            predicted_team_name:
              prediction.predicted_winner_team_id === homeTeam.id
                ? homeTeam.name
                : awayTeam.name,
            is_correct:
              actual_winner_id !== null
                ? prediction.predicted_winner_team_id === actual_winner_id
                : false,
            points_earned: prediction.points_earned || 0,
            is_settled: prediction.is_settled || false,
          }
        : null,
    };
  });

  return { games: combinedData, totalPoints };
};

// 5. Fetch Leaderboard
export const getLeaderboard = async () => {
  const { data, error } = await supabase.rpc("get_leaderboard");

  if (error) {
    console.error("Error fetching leaderboard:", error);
    return [];
  }

  return data.map(
    (entry: {
      user_id: string;
      username: string;
      student_number: string;
      total_score: number;
    }) => ({
      userId: entry.user_id,
      name: entry.username,
      student_number: entry.student_number,
      score: entry.total_score,
    })
  );
};

// 6. Fetch Prediction Ratios for a specific date
export const getPredictionRatios = async (date: string) => {
  console.log(`Fetching prediction ratios for date: ${date}`); // Added for debugging
  const { data, error } = await supabase.rpc(
    "get_prediction_ratios_by_date_grouped",
    { target_date: date }
  );

  if (error) {
    console.error(`Error fetching prediction ratios for date ${date}:`, error);
    return [];
  }
  return data;
};

// 6a. Fetch Prediction Ratios for games with IN_PROGRESS or FINISHED status only
export const getPredictionRatiosForActiveGames = async (date: string) => {
  console.log(`Fetching prediction ratios for active games on date: ${date}`);

  // First get the games for the date with IN_PROGRESS or FINISHED status
  const { data: games, error: gamesError } = await supabase
    .from("games")
    .select(
      `
      id,
      home_team_id,
      away_team_id,
      home_team:teams!home_team_id(name),
      away_team:teams!away_team_id(name)
    `
    )
    .eq("game_date", date)
    .in("game_status", ["IN_PROGRESS", "FINISHED"]);

  if (gamesError) {
    console.error(`Error fetching active games for date ${date}:`, gamesError);
    return [];
  }

  if (!games || games.length === 0) {
    return [];
  }

  const gameIds = games.map((g) => g.id);

  // Get predictions for these games
  const { data: predictions, error: predictionsError } = await supabase
    .from("predictions")
    .select("game_id, predicted_winner_team_id")
    .in("game_id", gameIds);

  if (predictionsError) {
    console.error(
      `Error fetching predictions for active games:`,
      predictionsError
    );
    return [];
  }

  // Calculate ratios for each game
  const ratios = games.map((game) => {
    const gamePredictions =
      predictions?.filter((p) => p.game_id === game.id) || [];
    const totalPredictions = gamePredictions.length;

    const homeTeam = Array.isArray(game.home_team)
      ? game.home_team[0]
      : game.home_team;
    const awayTeam = Array.isArray(game.away_team)
      ? game.away_team[0]
      : game.away_team;

    if (totalPredictions === 0) {
      return {
        home_team_name: homeTeam?.name || "Unknown",
        away_team_name: awayTeam?.name || "Unknown",
        home_team_ratio: 0,
        away_team_ratio: 0,
      };
    }

    const homePredictions = gamePredictions.filter(
      (p) => p.predicted_winner_team_id === game.home_team_id
    ).length;
    const awayPredictions = gamePredictions.filter(
      (p) => p.predicted_winner_team_id === game.away_team_id
    ).length;

    return {
      home_team_name: homeTeam?.name || "Unknown",
      away_team_name: awayTeam?.name || "Unknown",
      home_team_ratio: (homePredictions / totalPredictions) * 100,
      away_team_ratio: (awayPredictions / totalPredictions) * 100,
    };
  });

  return ratios;
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
