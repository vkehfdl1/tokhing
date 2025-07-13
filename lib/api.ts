import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// Helper to get today's date string in YYYY-MM-DD format
const getISODate = (date = new Date()) => date.toISOString().slice(0, 10);

// 1. Fetch User by Student ID
export const getUserByStudentId = async (studentId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, student_number, username')
    .eq('student_number', studentId)
    .single();

  if (error) {
    console.error('Error fetching user:', error);
    throw new Error("User not found or connection issue.");
  }
  // Map to frontend-expected fields if necessary, e.g., name
  return { ...data, name: data.username };
};

// 2. Fetch Today's Games with User's Predictions
export const getTodaysGamesWithPredictions = async (userId: string) => {
  const today = getISODate();
  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select(`
      id, game_date, game_status, home_pitcher, away_pitcher,
      home_team:teams!home_team_id(id, name),
      away_team:teams!away_team_id(id, name)
    `)
    .eq('game_date', today);

  if (gamesError) {
    console.error('Error fetching today\'s games:', gamesError);
    return [];
  }


  const gameIds = games.map(g => g.id);
  const { data: predictions, error: predsError } = await supabase
    .from('predictions')
    .select('game_id, predicted_winner_team_id')
    .eq('user_id', userId)
    .in('game_id', gameIds);

  if (predsError) {
    console.error('Error fetching predictions:', predsError);
    // Proceed with games even if predictions fail
  }

  return games.map(game => {
    const prediction = predictions?.find(p => p.game_id === game.id) || null;
    return { ...game, prediction };
  });
};

// 3. Submit or Update a Prediction
export const submitPrediction = async (userId: string, gameId: number, predictedTeamId: number) => {
  const { data, error } = await supabase
    .from('predictions')
    .upsert(
      { user_id: userId, game_id: gameId, predicted_winner_team_id: predictedTeamId },
      { onConflict: 'user_id, game_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error submitting prediction:', error);
    throw new Error("Failed to save prediction.");
  }
  return data;
};

// 3b. Submit Multiple Predictions at Once
export const submitMultiplePredictions = async (userId: string, predictions: { game_id: number; predicted_winner_team_id: number }[]) => {
  const predictionsWithUser = predictions.map(p => ({ ...p, user_id: userId }));

  const { data, error } = await supabase
    .from('predictions')
    .upsert(predictionsWithUser, { onConflict: 'user_id, game_id' })
    .select();

  if (error) {
    console.error('Error submitting multiple predictions:', error);
    throw new Error("Failed to save predictions.");
  }
  return data;
};

// 4. Fetch Prediction History for a User
export const getPredictionHistory = async (userId: string) => {
    const { data, error } = await supabase
        .from('games')
        .select(`
            id, game_date, home_score, away_score,
            home_team:teams!home_team_id(id, name),
            away_team:teams!away_team_id(id, name),
            predictions!inner(predicted_winner_team_id)
        `)
        .eq('predictions.user_id', userId)
        .eq('is_finished', true)
        .order('game_date', { ascending: false });

    if (error) {
        console.error('Error fetching prediction history:', error);
        return [];
    }

    return data.map(game => {
        const prediction = game.predictions[0];
        const actual_winner_id = game.home_score > game.away_score ? game.home_team_id : game.away_team_id;
        const predicted_team_id = prediction.predicted_winner_team_id;
        const teams = { home: game.home_team, away: game.away_team };
        
        return {
            ...game,
            prediction: {
                predicted_team_name: predicted_team_id === teams.home.id ? teams.home.name : teams.away.name,
                is_correct: predicted_team_id === actual_winner_id,
            },
        };
    });
};

// 5. Fetch Leaderboard
export const getLeaderboard = async () => {
  const { data, error } = await supabase
    .from('user_scores')
    .select(`
      total_points,
      user:users!inner(id, username, student_number)
    `)
    .order('total_points', { ascending: false });

  if (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }

  return data.map(entry => ({
    userId: entry.user.id,
    name: entry.user.username,
    student_number: entry.user.student_number,
    score: entry.total_points,
  }));
};