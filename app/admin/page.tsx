"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

// Interface definitions
interface Team {
  id: number;
  name: string;
  short_name: string;
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

// Utility function to get KST date
const getKSTDate = (offsetDays = 0): string => {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000); // KST is UTC+9
  kst.setDate(kst.getDate() + offsetDays);
  return kst.toISOString().split("T")[0];
};

// Match Management Component
function MatchManagement({
  selectedDate,
}: {
  selectedDate: "today" | "tomorrow";
}) {
  const [games, setGames] = useState<Game[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const targetDate = selectedDate === "today" ? getKSTDate(0) : getKSTDate(1);

  const fetchTeams = async () => {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("name");

    if (error) {
      console.error("Error fetching teams:", error);
    } else {
      setTeams(data || []);
    }
  };

  const fetchGames = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("game_date", targetDate)
      .order("game_time");

    if (error) {
      console.error("Error fetching games:", error);
    } else {
      setGames(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTeams();
    fetchGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDate]);

  const addNewGame = () => {
    const newGame: Game = {
      game_date: targetDate,
      game_time: "19:00",
      home_team_id: teams[0]?.id || 0,
      away_team_id: teams[1]?.id || 0,
      home_pitcher: "",
      away_pitcher: "",
      home_score: null,
      away_score: null,
      game_status: "SCHEDULED",
    };
    setGames([...games, newGame]);
  };

  const updateGame = (
    index: number,
    field: keyof Game,
    value: string | number | null
  ) => {
    const updatedGames = [...games];
    updatedGames[index] = { ...updatedGames[index], [field]: value };
    setGames(updatedGames);
  };

  const removeGame = (index: number) => {
    const updatedGames = games.filter((_, i) => i !== index);
    setGames(updatedGames);
  };

  const saveGames = async () => {
    try {
      setLoading(true);

      // Separate games with and without IDs
      const existingGames = games.filter((game) => game.id);
      const newGames = games.filter((game) => !game.id);

      // Update existing games
      for (const game of existingGames) {
        const { id, ...gameData } = game;
        const { error } = await supabase
          .from("games")
          .update(gameData)
          .eq("id", id);

        if (error) {
          console.error("Error updating game:", error);
          throw error;
        }
      }

      // Insert new games
      if (newGames.length > 0) {
        const { error } = await supabase.from("games").insert(newGames);

        if (error) {
          console.error("Error inserting games:", error);
          throw error;
        }
      }

      // Refresh the games list
      await fetchGames();
      alert("Games saved successfully!");
    } catch (error) {
      alert("Error saving games. Please try again.");
      console.error("Save error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">
          {selectedDate === "today" ? "Today's" : "Tomorrow's"} Matches (
          {targetDate})
        </h2>
        <div className="space-x-2">
          <Button onClick={addNewGame} variant="outline">
            Add New Match
          </Button>
          <Button onClick={saveGames} disabled={loading}>
            {loading ? "Saving..." : "Save All Changes"}
          </Button>
        </div>
      </div>

      {games.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">
            No matches scheduled for this date.
          </p>
          <Button onClick={addNewGame} className="mt-4">
            Add First Match
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {games.map((game, index) => (
            <Card key={index} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`time-${index}`}>Game Time</Label>
                  <Input
                    id={`time-${index}`}
                    type="time"
                    value={game.game_time}
                    onChange={(e) =>
                      updateGame(index, "game_time", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`home-team-${index}`}>Home Team</Label>
                  <Select
                    id={`home-team-${index}`}
                    value={game.home_team_id}
                    onChange={(e) =>
                      updateGame(
                        index,
                        "home_team_id",
                        parseInt(e.target.value)
                      )
                    }
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`away-team-${index}`}>Away Team</Label>
                  <Select
                    id={`away-team-${index}`}
                    value={game.away_team_id}
                    onChange={(e) =>
                      updateGame(
                        index,
                        "away_team_id",
                        parseInt(e.target.value)
                      )
                    }
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`status-${index}`}>Status</Label>
                  <Select
                    id={`status-${index}`}
                    value={game.game_status}
                    onChange={(e) =>
                      updateGame(
                        index,
                        "game_status",
                        e.target.value as "SCHEDULED" | "LIVE" | "FINISHED"
                      )
                    }
                  >
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="LIVE">Live</option>
                    <option value="FINISHED">Finished</option>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`home-pitcher-${index}`}>Home Pitcher</Label>
                  <Input
                    id={`home-pitcher-${index}`}
                    value={game.home_pitcher}
                    onChange={(e) =>
                      updateGame(index, "home_pitcher", e.target.value)
                    }
                    placeholder="Home pitcher name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`away-pitcher-${index}`}>Away Pitcher</Label>
                  <Input
                    id={`away-pitcher-${index}`}
                    value={game.away_pitcher}
                    onChange={(e) =>
                      updateGame(index, "away_pitcher", e.target.value)
                    }
                    placeholder="Away pitcher name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`home-score-${index}`}>Home Score</Label>
                  <Input
                    id={`home-score-${index}`}
                    type="number"
                    min="0"
                    value={game.home_score || ""}
                    onChange={(e) =>
                      updateGame(
                        index,
                        "home_score",
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    placeholder="Score"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`away-score-${index}`}>Away Score</Label>
                  <Input
                    id={`away-score-${index}`}
                    type="number"
                    min="0"
                    value={game.away_score || ""}
                    onChange={(e) =>
                      updateGame(
                        index,
                        "away_score",
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    placeholder="Score"
                  />
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <Button
                  variant="destructive"
                  onClick={() => removeGame(index)}
                  size="sm"
                >
                  Remove Match
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Admin Dashboard Component
function AdminDashboard() {
  const [currentView, setCurrentView] = useState<
    "dashboard" | "today" | "tomorrow"
  >("dashboard");

  const getCurrentKSTTime = () => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const kst = new Date(utc + 9 * 3600000);
    return kst.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  };

  if (currentView !== "dashboard") {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => setCurrentView("dashboard")}
            className="mb-4"
          >
            ← Back to Dashboard
          </Button>
          <div className="text-sm text-muted-foreground mb-2">
            Current KST Time: {getCurrentKSTTime()}
          </div>
        </div>

        <MatchManagement selectedDate={currentView as "today" | "tomorrow"} />

        <div className="mt-8 flex justify-end">
          <Button
            variant="outline"
            onClick={() => {
              sessionStorage.removeItem("admin_authenticated");
              window.location.reload();
            }}
          >
            Logout
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to the admin control panel
        </p>
        <div className="text-sm text-muted-foreground mt-2">
          Current KST Time: {getCurrentKSTTime()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-3">Today&apos;s Matches</h3>
          <p className="text-muted-foreground mb-4">
            Manage today&apos;s game schedule and scores
          </p>
          <Button onClick={() => setCurrentView("today")}>
            Manage Today&apos;s Matches
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-3">
            Tomorrow&apos;s Matches
          </h3>
          <p className="text-muted-foreground mb-4">
            Schedule and configure tomorrow&apos;s games
          </p>
          <Button onClick={() => setCurrentView("tomorrow")}>
            Manage Tomorrow&apos;s Matches
          </Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-3">System Settings</h3>
          <p className="text-muted-foreground mb-4">
            Configure system preferences
          </p>
          <Button disabled>Settings (Coming Soon)</Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-3">User Management</h3>
          <p className="text-muted-foreground mb-4">
            Manage user accounts and permissions
          </p>
          <Button disabled>Manage Users (Coming Soon)</Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-3">Analytics</h3>
          <p className="text-muted-foreground mb-4">
            View system analytics and reports
          </p>
          <Button disabled>View Analytics (Coming Soon)</Button>
        </Card>

        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-3">Database</h3>
          <p className="text-muted-foreground mb-4">
            Database management tools
          </p>
          <Button disabled>Database Tools (Coming Soon)</Button>
        </Card>
      </div>

      <div className="mt-8 flex justify-end">
        <Button
          variant="outline"
          onClick={() => {
            sessionStorage.removeItem("admin_authenticated");
            window.location.reload();
          }}
        >
          Logout
        </Button>
      </div>
    </div>
  );
}

// Login Form Component
function LoginForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Hash function using Web Crypto API
  async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // Hash the input password
      const hashedInput = await hashPassword(password);

      // Get the stored hash from environment variable
      // In production, you'll set NEXT_PUBLIC_ADMIN_PASSWORD_HASH in your environment
      const storedHash = process.env.NEXT_PUBLIC_ADMIN_PASSWORD_HASH;

      if (!storedHash) {
        setError("Admin authentication not configured");
        setIsLoading(false);
        return;
      }

      // Compare hashes
      if (hashedInput === storedHash) {
        // Store authentication state in session storage
        sessionStorage.setItem("admin_authenticated", "true");
        onAuthenticated();
      } else {
        setError("Invalid password");
      }
    } catch (err) {
      console.error("Authentication error:", err);
      setError("Authentication failed");
    }

    setIsLoading(false);
    setPassword(""); // Clear password field for security
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">Admin Access</h1>
          <p className="text-muted-foreground">
            Enter admin password to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              autoFocus
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !password}
          >
            {isLoading ? "Verifying..." : "Access Admin Panel"}
          </Button>
        </form>

        <div className="mt-6 text-xs text-muted-foreground">
          <p>⚠️ This area is restricted to authorized administrators only.</p>
        </div>
      </Card>
    </div>
  );
}

// Main Admin Page Component
export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const authenticated =
      sessionStorage.getItem("admin_authenticated") === "true";
    setIsAuthenticated(authenticated);
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return <AdminDashboard />;
}
