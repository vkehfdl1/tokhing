"use client";

import { useState, useEffect } from 'react';
import { getUserByStudentId } from '@/lib/api';
import DailyHistoryCard from '@/components/daily-history-card';

// --- TYPE DEFINITIONS ---
type User = { id: string; student_number: string; name: string; };

// Helper to format date to YYYY-MM-DD
const formatDate = (date: Date) => date.toISOString().slice(0, 10);

// --- COMPONENT ---
export default function HistoryPage() {
    const [studentId, setStudentId] = useState('');
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState(formatDate(new Date(Date.now() - 86400000))); // Default to yesterday

    // --- DATA FETCHING & LOGIN ---
    const handleLogin = async () => {
        if (!studentId) { setError('Please enter your student ID.'); return; }
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
            <h1 className="text-4xl font-bold text-center text-gray-800 mb-10">Prediction History</h1>

            {/* --- LOGIN FORM -- */}
            {!user ? (
                <div className="flex gap-4 mb-8">
                    <input
                        type="text"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        placeholder="Enter your Student ID"
                        className="flex-grow p-3 border border-gray-300 rounded-lg text-black"
                    />
                    <button onClick={handleLogin} disabled={isLoading} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg">
                        {isLoading ? 'Loading...' : 'Login'}
                    </button>
                </div>
            ) : (
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-semibold text-gray-800">History for {user.name}</h2>
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
                        >&lt; Previous Day</button>
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
                        >Next Day &gt;</button>
                    </div>
                    <h3 className="text-xl font-bold text-gray-700 mb-3">{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                    <DailyHistoryCard userId={user.id} date={selectedDate} />
                </div>
            )}
        </div>
    );
}
