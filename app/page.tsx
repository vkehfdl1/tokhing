"use client";

import { useState, useEffect } from "react";
import {
  getUserByStudentId,
  getTodaysGamesWithPredictions,
  submitMultiplePredictions,
} from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// --- TYPE DEFINITIONS ---
type Team = { id: number; name: string };
type Game = {
  id: number;
  home_team: Team;
  away_team: Team;
  home_pitcher: string | null;
  away_pitcher: string | null;
  game_status: "SCHEDULED" | "IN_PROGRESS" | "CANCELED" | "FINISHED";
  home_score: number | null;
  away_score: number | null;
  // prediction is what's already saved in the DB
  prediction: { predicted_winner_team_id: number } | null;
};
type User = { id: string; student_number: string; name: string };
// selectedPick is for UI interaction before submission
type SelectedPick = {
  gameId: number;
  predictedTeamId: number;
  teamName: string;
};

// --- COMPONENT ---
export default function HomePage() {
  const [studentId, setStudentId] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [todaysGames, setTodaysGames] = useState<Game[]>([]);
  const [selectedPicks, setSelectedPicks] = useState<Map<number, SelectedPick>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // --- DATA FETCHING & LOGIN ---
  const handleLogin = async () => {
    if (!studentId) {
      setError("Please enter your student ID.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const userData = await getUserByStudentId(studentId);
      setUser(userData);
    } catch (err: any) {
      setError(err.message);
      setUser(null);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (user) {
      const fetchGames = async () => {
        setIsLoading(true);
        const gamesData = await getTodaysGamesWithPredictions(user.id);
        setTodaysGames(gamesData);
        // Clear old picks when a new user logs in
        setSelectedPicks(new Map());
        setIsLoading(false);
      };
      fetchGames();
    }
  }, [user]);

  // --- UI HANDLERS ---
  const handleSelectPick = (
    gameId: number,
    predictedTeamId: number,
    teamName: string
  ) => {
    const newPicks = new Map(selectedPicks);
    newPicks.set(gameId, { gameId, predictedTeamId, teamName });
    setSelectedPicks(newPicks);
  };

  const handleConfirmSubmission = async () => {
    if (!user || selectedPicks.size === 0) return;

    const predictionsToSubmit = Array.from(selectedPicks.values()).map((p) => ({
      game_id: p.gameId,
      predicted_winner_team_id: p.predictedTeamId,
    }));

    setShowConfirmation(false);
    setIsLoading(true);

    try {
      await submitMultiplePredictions(user.id, predictionsToSubmit);
      // Refresh data from server to show the submitted picks
      const gamesData = await getTodaysGamesWithPredictions(user.id);
      setTodaysGames(gamesData);
      setSelectedPicks(new Map()); // Clear selections
    } catch (err) {
      setError("Failed to save predictions. Please try again.");
    }
    setIsLoading(false);
  };

  // --- RENDER ---
  return (
    <div className="w-full max-w-4xl mx-auto p-8">
      <h1 className="text-4xl font-bold text-center text-gray-800 mb-10">
        Today's Predictions
      </h1>

      {/* --- LOGIN FORM -- */}
      {!user ? (
        <div className="flex gap-4 mb-8">
          <Input
            type="text"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Enter your Student ID"
            className="flex-grow text-black bg-white"
          />
          <Button onClick={handleLogin} disabled={isLoading} className="px-6">
            {isLoading ? "Loading..." : "Login"}
          </Button>
        </div>
      ) : (
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-gray-800">
            Welcome, {user.name}!
          </h2>
        </div>
      )}

      {error && <p className="text-red-500 text-center mb-4">{error}</p>}
      {user && isLoading && (
        <p className="text-center text-gray-800">Loading games...</p>
      )}

      {/* --- GAMES LIST -- */}
      {user && !isLoading && (
        <div className="space-y-6">
          {todaysGames.map((game) => {
            const hasSubmitted = !!game.prediction;
            const currentPick = selectedPicks.get(game.id);
            const submittedPick = game.prediction?.predicted_winner_team_id;

            return (
              <div
                key={game.id}
                className={`p-6 rounded-xl shadow-md ${
                  game.game_status === "CANCELED"
                    ? "bg-red-50 border-2 border-red-200"
                    : "bg-white"
                }`}
              >
                <div className="grid grid-cols-3 items-center text-center text-gray-800">
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold">
                      {game.home_team.name}
                    </span>
                    <span className="text-sm text-gray-500">
                      {game.home_pitcher}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-sm text-gray-500">
                      {game.game_status}
                    </span>
                    {game.game_status === "IN_PROGRESS" ||
                    game.game_status === "FINISHED" ? (
                      <span className="text-3xl font-extrabold">
                        {game.home_score} - {game.away_score}
                      </span>
                    ) : game.game_status === "CANCELED" ? (
                      <span className="text-xl font-bold text-red-500">
                        CANCELED
                      </span>
                    ) : (
                      <span className="text-3xl font-extrabold">VS</span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold">
                      {game.away_team.name}
                    </span>
                    <span className="text-sm text-gray-500">
                      {game.away_pitcher}
                    </span>
                  </div>
                </div>

                {game.game_status === "CANCELED" ? (
                  <div className="mt-6 text-center">
                    <p className="text-lg text-gray-800">
                      This game has been canceled.
                    </p>
                  </div>
                ) : hasSubmitted ? (
                  <div className="mt-6 text-center">
                    <p className="text-lg text-gray-800">
                      Your pick:{" "}
                      <span className="font-bold">
                        {submittedPick === game.home_team.id
                          ? game.home_team.name
                          : game.away_team.name}
                      </span>
                    </p>
                  </div>
                ) : game.game_status === "SCHEDULED" ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() =>
                        handleSelectPick(
                          game.id,
                          game.home_team.id,
                          game.home_team.name
                        )
                      }
                      className={`w-full py-3 font-bold rounded-lg transition ${
                        currentPick?.predictedTeamId === game.home_team.id
                          ? "bg-green-600 text-white"
                          : "bg-green-200 text-green-800"
                      }`}
                    >
                      {game.home_team.name} Win
                    </button>
                    <button
                      onClick={() =>
                        handleSelectPick(
                          game.id,
                          game.away_team.id,
                          game.away_team.name
                        )
                      }
                      className={`w-full py-3 font-bold rounded-lg transition ${
                        currentPick?.predictedTeamId === game.away_team.id
                          ? "bg-red-600 text-white"
                          : "bg-red-200 text-red-800"
                      }`}
                    >
                      {game.away_team.name} Win
                    </button>
                  </div>
                ) : (
                  <div className="mt-6 text-center">
                    <p className="text-lg text-gray-800">
                      Predictions are closed for this game.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {/* --- SUBMIT BUTTON -- */}
          {selectedPicks.size > 0 && (
            <div className="mt-8 text-center">
              <button
                onClick={() => setShowConfirmation(true)}
                className="px-8 py-4 bg-blue-600 text-white font-bold rounded-lg shadow-lg"
              >
                Submit {selectedPicks.size} Prediction(s)
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- CONFIRMATION MODAL -- */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-8 rounded-lg shadow-2xl">
            <h3 className="text-xl font-bold mb-4 text-gray-900">
              Confirm Your Predictions
            </h3>
            <ul className="list-disc list-inside mb-6 text-gray-700">
              {Array.from(selectedPicks.values()).map((pick) => (
                <li key={pick.gameId}>
                  You picked the{" "}
                  <span className="font-bold">{pick.teamName}</span> to win.
                </li>
              ))}
            </ul>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setShowConfirmation(false)}
                className="px-6 py-2 bg-gray-300 text-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSubmission}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg"
              >
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
