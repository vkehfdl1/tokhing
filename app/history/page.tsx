"use client";

import { useState } from "react";
import { getUserByStudentId } from "@/lib/api";
import DailyHistoryCard from "@/components/daily-history-card";
import PredictionRatioChart from "@/components/prediction-ratio-chart"; // Import the new component
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// --- TYPE DEFINITIONS ---
type User = { id: string; student_number: string; name: string };

// Helper to format date to YYYY-MM-DD
const formatDate = (date: Date) => date.toISOString().slice(0, 10);

// --- COMPONENT ---
export default function HistoryPage() {
  const [studentId, setStudentId] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    formatDate(new Date(Date.now() - 86400000))
  ); // Default to yesterday

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.message);
      setUser(null);
    }
    setIsLoading(false);
  };

  // --- DATE NAVIGATION ---
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const navigateDate = (days: number) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + days);
    setSelectedDate(formatDate(currentDate));
  };

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const isPreviousDisabled = new Date(selectedDate) <= firstDayOfMonth;
  const isNextDisabled = new Date(selectedDate) >= yesterday;

  // --- RENDER ---
  return (
    <div className="w-full max-w-4xl mx-auto p-8">
      <h1 className="text-4xl font-bold text-center text-gray-800 mb-10">
        예측 기록
      </h1>

      {/* --- LOGIN FORM -- */}
      {/* --- LOGIN FORM -- */}
      {!user ? (
        <div className="flex gap-4 mb-8">
          <Input
            type="text"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="학번을 입력해 주세요"
            className="flex-grow text-black bg-white"
          />
          <Button onClick={handleLogin} disabled={isLoading} className="px-6">
            {isLoading ? "로딩 중..." : "로그인"}
          </Button>
        </div>
      ) : (
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-gray-800">
            {user.name}님의 기록
          </h2>
        </div>
      )}

      {error && <p className="text-red-500 text-center mb-4">{error}</p>}

      {user && !isLoading && (
        <div className="mb-8 flex flex-col items-center">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigateDate(-1)}
              disabled={isPreviousDisabled}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              &lt; 전 날
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              min={formatDate(new Date(today.getFullYear(), 2, 1))} // March is month 2 (0-indexed)
              max={formatDate(yesterday)}
              className="p-2 border border-gray-300 rounded-lg text-black"
            />
            <button
              onClick={() => navigateDate(1)}
              disabled={isNextDisabled}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음 날 &gt;
            </button>
          </div>
          <h3 className="text-xl font-bold text-gray-700 mb-6">
            {new Date(selectedDate).toLocaleDateString("ko-KR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </h3>

          {/* Vertical layout for all screen sizes */}
          <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto">
            {/* Daily History Card - appears first */}
            <div>
              <DailyHistoryCard userId={user.id} date={selectedDate} />
            </div>

            {/* Prediction Ratio Chart - appears second */}
            <div>
              <PredictionRatioChart date={selectedDate} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
