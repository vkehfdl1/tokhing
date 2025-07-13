"use client";

import { useState, useEffect } from 'react';
import { getHistoryForDate } from '@/lib/api';

// --- TYPE DEFINITIONS ---
type Team = { id: number; name: string; };
type Game = {
    id: number;
    home_team: Team;
    away_team: Team;
    home_score: number | null;
    away_score: number | null;
    prediction: {
        predicted_team_name: string | undefined;
        is_correct: boolean;
        points_earned: number;
    } | null;
};

interface DailyHistoryCardProps {
    userId: string;
    date: string;
}

// --- COMPONENT ---
export default function DailyHistoryCard({ userId, date }: DailyHistoryCardProps) {
    const [dailyData, setDailyData] = useState<{ games: Game[], totalPoints: number } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userId || !date) return;

        const fetchDailyHistory = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const data = await getHistoryForDate(userId, date);
                setDailyData(data);
            } catch (err: any) {
                setError(err.message);
            }
            setIsLoading(false);
        };

        fetchDailyHistory();
    }, [userId, date]);

    if (isLoading) {
        return <p className="text-center text-gray-500">Loading daily results...</p>;
    }

    if (error) {
        return <p className="text-center text-red-500">{error}</p>;
    }

    if (!dailyData || dailyData.games.length === 0) {
        return <p className="text-center text-gray-500 py-8">이 날짜에는 경기가 없습니다.</p>;
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Total Points Earned: {dailyData.totalPoints}</h3>
            <div className="space-y-4">
                {dailyData.games.map(game => (
                    <div key={game.id} className={`p-4 rounded-lg border-l-4 ${!game.prediction ? 'border-gray-300' : game.prediction.is_correct ? 'border-green-500' : 'border-red-500'}`}>
                        <div className="flex justify-between items-center">
                            <div className="font-mono text-lg text-gray-800">
                                <span>{game.home_team.name}</span>
                                <span className="mx-2 font-bold">{game.home_score} - {game.away_score}</span>
                                <span>{game.away_team.name}</span>
                            </div>
                            <div className="text-right">
                                <p className="text-gray-700">Your pick: <span className="font-bold">{game.prediction?.predicted_team_name ?? 'N/A'}</span></p>
                                <p className={`text-sm font-semibold ${game.prediction?.is_correct ? 'text-green-600' : 'text-red-600'}`}>
                                    Points: {game.prediction?.points_earned ?? 0}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
