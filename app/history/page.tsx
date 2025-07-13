"use client";

import { useState, useEffect } from 'react';
import { getUserByStudentId, getPredictionHistory } from '@/lib/api';

type Team = { id: number; name: string; };
type Game = {
    id: number;
    game_date: string;
    home_team: Team;
    away_team: Team;
    home_score: number | null;
    away_score: number | null;
    prediction: {
        predicted_team_name: string | undefined;
        is_correct: boolean;
    } | null;
};
type User = { id: string; student_number: string; name: string; };

export default function HistoryPage() {
    const [studentId, setStudentId] = useState('');
    const [user, setUser] = useState<User | null>(null);
    const [history, setHistory] = useState<Game[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async () => {
        if (!studentId) {
            setError('Please enter your student ID.');
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
            const fetchHistory = async () => {
                setIsLoading(true);
                const historyData = await getPredictionHistory(user.id);
                setHistory(historyData);
                setIsLoading(false);
            };
            fetchHistory();
        }
    }, [user]);

    return (
        <div className="w-full max-w-4xl mx-auto p-8">
            <h1 className="text-4xl font-bold text-center text-gray-800 mb-10">Prediction History</h1>

            {!user ? (
                <div className="flex gap-4 mb-8">
                    <input
                        type="text"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        placeholder="Enter your Student ID"
                        className="flex-grow p-3 border border-gray-300 rounded-lg"
                    />
                    <button onClick={handleLogin} disabled={isLoading} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg">
                        {isLoading ? 'Loading...' : 'Login'}
                    </button>
                </div>
            ) : (
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-semibold">History for {user.name}</h2>
                </div>
            )}

            {error && <p className="text-red-500 text-center mb-4">{error}</p>}

            {user && isLoading && <p className="text-center">Loading history...</p>}

            {user && !isLoading && (
                <div className="space-y-6">
                    {history.map((game) => (
                        <div key={game.id} className={`p-6 bg-white rounded-xl shadow-md border-l-4 ${game.prediction?.is_correct ? 'border-green-500' : 'border-red-500'}`}>
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-lg">{new Date(game.game_date).toLocaleDateString()}</span>
                                <span className="font-mono text-lg">{game.home_team.name} {game.home_score} - {game.away_score} {game.away_team.name}</span>
                            </div>
                            <p className="text-center text-gray-700">Your pick: <span className="font-bold">{game.prediction?.predicted_team_name ?? 'No prediction'}</span></p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
