"use client";
import React, { useState } from 'react';
import { Match, Player, Team } from '@/types/models';
import { Trophy } from 'lucide-react';

interface Props {
  match: Match;
  players: Player[];
  onSubmit: (winner: Team, scoreA: number, scoreB: number) => void;
  onClose: () => void;
}

export const ScoreDialog: React.FC<Props> = ({ match, players, onSubmit, onClose }) => {
  const [scoreA, setScoreA] = useState<number | ''>('');
  const [scoreB, setScoreB] = useState<number | ''>('');
  const [winner, setWinner] = useState<Team | null>(null);

  const teamA = match.teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
  const teamB = match.teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (winner && scoreA !== '' && scoreB !== '') {
      onSubmit(winner, Number(scoreA), Number(scoreB));
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="glass dark:glass-dark rounded-3xl overflow-hidden max-w-md w-full shadow-2xl animate-slide-up border-0">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white text-center">
          <h2 className="text-2xl font-bold tracking-tight">Enter Match Score</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-6 relative">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 z-10 border border-slate-200 dark:border-slate-700 shadow-sm">
              VS
            </div>

            <div className="flex flex-col gap-4">
              <div className="text-center font-bold text-slate-800 dark:text-slate-200 text-lg">Team 1</div>
              <div className="flex flex-col gap-2 min-h-[80px]">
                {teamA.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-400 to-blue-500 text-white flex items-center justify-center text-[10px] font-bold">
                      {p.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium truncate">{p.name}</span>
                  </div>
                ))}
              </div>
              <input 
                type="number" 
                min="0" 
                value={scoreA} 
                onChange={(e) => setScoreA(e.target.value === '' ? '' : parseInt(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-3xl font-bold text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="0"
                required
              />
              <button 
                type="button"
                className={`py-3 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                  winner === Team.A 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20 scale-[1.02]' 
                    : 'bg-slate-100 dark:bg-slate-800/50 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                onClick={() => setWinner(Team.A)}
              >
                {winner === Team.A && <Trophy size={16} />} Winner
              </button>
            </div>
            
            <div className="flex flex-col gap-4">
              <div className="text-center font-bold text-slate-800 dark:text-slate-200 text-lg">Team 2</div>
              <div className="flex flex-col gap-2 min-h-[80px]">
                {teamB.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-rose-400 to-red-500 text-white flex items-center justify-center text-[10px] font-bold">
                      {p.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium truncate">{p.name}</span>
                  </div>
                ))}
              </div>
              <input 
                type="number" 
                min="0" 
                value={scoreB} 
                onChange={(e) => setScoreB(e.target.value === '' ? '' : parseInt(e.target.value))}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-3xl font-bold text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="0"
                required
              />
              <button 
                type="button"
                className={`py-3 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                  winner === Team.B 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20 scale-[1.02]' 
                    : 'bg-slate-100 dark:bg-slate-800/50 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                onClick={() => setWinner(Team.B)}
              >
                {winner === Team.B && <Trophy size={16} />} Winner
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-4 pt-6 border-t border-slate-100 dark:border-slate-800">
            <button 
              type="submit" 
              disabled={!winner || scoreA === '' || scoreB === ''}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-500/20"
            >
              Submit Score
            </button>
            <button type="button" onClick={onClose} className="w-full py-3 text-slate-500 dark:text-slate-400 font-medium hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-xl transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScoreDialog;
