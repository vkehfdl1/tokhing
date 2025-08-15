"use client";

import { useState, useRef, useEffect } from "react";
import { getUserByStudentId } from "@/lib/api";
import DailyHistoryCard from "@/components/daily-history-card";
import PredictionRatioChart from "@/components/prediction-ratio-chart"; // Import the new component
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/lib/hooks/useResponsive";

// --- TYPE DEFINITIONS ---
type User = { id: string; student_number: string; name: string };

// Helper to format date to YYYY-MM-DD (timezone-safe for KST)
const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper to get current date in KST
const getKSTDate = () => {
  const now = new Date();
  // Convert to KST (UTC+9)
  const kstOffset = 9 * 60; // 9 hours in minutes
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kstTime = new Date(utc + kstOffset * 60000);
  return kstTime;
};

// Helper to format date in Korean format: 2025. 8. 13.(수)
const formatDateWithWeekday = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = weekdays[date.getDay()];

  return `${year}. ${month}. ${day}. (${weekday})`;
};

// --- COMPONENT ---
export default function HistoryPage() {
  const isMobile = useIsMobile();
  const [studentId, setStudentId] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const kstToday = getKSTDate();
    const kstYesterday = new Date(kstToday);
    kstYesterday.setDate(kstToday.getDate() - 1);
    return formatDate(kstYesterday);
  }); // Default to yesterday in KST
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setShowCalendar(false);
      }
    };

    if (showCalendar) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCalendar]);

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
  const navigateDate = (days: number) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + days);
    setSelectedDate(formatDate(currentDate));
  };

  const today = getKSTDate();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const isPreviousDisabled = new Date(selectedDate) <= firstDayOfMonth;
  const isNextDisabled = new Date(selectedDate) >= today; // Allow today

  // Generate calendar days for the current month
  const generateCalendarDays = () => {
    const currentDate = new Date(selectedDate);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days in the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const isInRange = date >= firstDayOfMonth && date <= today; // Allow today
      days.push({ day, date, isInRange });
    }

    return days;
  };

  const handleCalendarDateSelect = (date: Date) => {
    // Create a new date to avoid timezone issues
    const localDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
    setSelectedDate(formatDate(localDate));
    setShowCalendar(false);
  };

  // --- RENDER ---
  return (
    <div className={`w-full mx-auto ${isMobile ? "p-4" : "p-8"}`}>
      <h1
        className={`font-bold text-center text-black mb-4 ${
          isMobile ? "text-xl" : "text-4xl"
        }`}
      >
        {user ? `${user.name} 님의 예측 기록` : "예측 기록"}
      </h1>

      {/* --- LOGIN FORM -- */}
      {!user ? (
        <div
          className={`flex gap-4 mb-8 ${isMobile ? "flex-col" : "flex-row"}`}
        >
          <Input
            type="text"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="학번을 입력해 주세요"
            className="flex-grow text-black"
          />
          <Button
            onClick={handleLogin}
            disabled={isLoading}
            className={`px-6 text-base ${isMobile ? "w-full" : ""}`}
          >
            {isLoading ? "로딩 중..." : "로그인"}
          </Button>
        </div>
      ) : (<></>)}

      {error && <p className="text-red-500 text-center mb-4">{error}</p>}

      {user && !isLoading && (
        <div className="mb-8 flex flex-col items-center">
          {/* Date Navigation - Single row with previous, date, next */}
          <div className="flex items-center justify-center gap-1 mb-6 relative">
            <button
              onClick={() => navigateDate(-1)}
              disabled={isPreviousDisabled}
              className="w-10 h-10 flex items-center justify-center bg-transparent text-bold text-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              &lt;
            </button>

            <div className="relative">
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                className="font-bold text-xl text-black cursor-pointer hover:text-gray-700 transition-colors px-4 py-2 rounded-lg hover:bg-gray-100"
              >
                {formatDateWithWeekday(new Date(selectedDate))}
              </button>

              {/* Calendar Popup */}
              {showCalendar && (
                <div
                  ref={calendarRef}
                  className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-50 min-w-[280px]"
                >
                  <div className="text-center font-semibold mb-3 text-gray-800">
                    {new Date(selectedDate).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "long",
                    })}
                  </div>

                  {/* Calendar Header */}
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                      <div
                        key={day}
                        className="text-center text-sm font-medium text-gray-600 py-1"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {generateCalendarDays().map((dayData, index) => (
                      <div
                        key={index}
                        className="h-8 flex items-center justify-center"
                      >
                        {dayData ? (
                          <button
                            onClick={() =>
                              handleCalendarDateSelect(dayData.date)
                            }
                            disabled={!dayData.isInRange}
                            className={`w-8 h-8 rounded text-sm transition-colors ${
                              formatDate(dayData.date) === selectedDate
                                ? "bg-blue-500 text-white"
                                : dayData.isInRange
                                ? "hover:bg-gray-200 text-gray-800"
                                : "text-gray-300 cursor-not-allowed"
                            }`}
                          >
                            {dayData.day}
                          </button>
                        ) : (
                          <div className="w-8 h-8"></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => navigateDate(1)}
              disabled={isNextDisabled}
              className="w-10 h-10 flex items-center justify-center bg-transparent text-bold text-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              &gt;
            </button>
          </div>

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
