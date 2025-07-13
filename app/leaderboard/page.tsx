"use client";

import { useState, useEffect } from 'react';
import { getLeaderboard } from '@/lib/api';

type LeaderboardEntry = {
    userId: string;
    name: string;
    student_number: string;
    score: number;
};

export default function LeaderboardPage() {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [highlightedStudentId, setHighlightedStudentId] = useState('');

    useEffect(() => {
        const fetchLeaderboard = async () => {
            setIsLoading(true);
            const data = await getLeaderboard();
            setLeaderboard(data);
            setIsLoading(false);
        };
        fetchLeaderboard();
    }, []);

    return (
        <div className="w-full max-w-4xl mx-auto p-8">
            <h1 className="text-4xl font-bold text-center text-gray-800 mb-10">Leaderboard</h1>

            <div className="flex gap-4 mb-8">
                <input
                    type="text"
                    value={highlightedStudentId}
                    onChange={(e) => setHighlightedStudentId(e.target.value)}
                    placeholder="Enter your Student ID to find your rank"
                    className="flex-grow p-3 border border-gray-300 rounded-lg"
                />
            </div>

            {isLoading ? (
                <p className="text-center">Loading leaderboard...</p>
            ) : (
                <div className="bg-white rounded-xl shadow-md">
                    <ul className="divide-y divide-gray-200">
                        {leaderboard.map((entry, index) => (
                            <li key={entry.userId} className={`flex items-center p-4 ${entry.student_number === highlightedStudentId ? 'bg-yellow-100' : ''}`}>
                                <span className="text-lg font-bold text-gray-600 w-12">{index + 1}</span>
                                <span className="text-xl font-semibold text-gray-800 flex-grow">{entry.name}</span>
                                <span className="text-2xl font-bold text-blue-600">{entry.score}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
