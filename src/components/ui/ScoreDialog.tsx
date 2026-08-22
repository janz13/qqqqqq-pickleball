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

  const modal = (
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
            </div>

            <div className="flex flex-col gap-4">
              <div className="text-center font-bold text-slate-800 dark:text-slate-200 text-lg">Team 2</div>
              <div className="flex flex-col gap-2 min-h-[80px]">
                {teamB.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-rose-400 to-rose-500 text-white flex items-center justify-center text-[10px] font-bold">
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
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-3xl font-bold text-center focus:ring-2 focus:ring-rose-500 outline-none transition-all"
                placeholder="0"
                required
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <label className="block text-center font-bold text-slate-700 dark:text-slate-300 mb-4 uppercase tracking-wider text-sm">Select Winner</label>
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={() => setWinner(Team.A)}
                className={`flex-1 py-4 px-4 rounded-2xl font-bold flex flex-col items-center gap-2 transition-all duration-200 border-2 ${
                  winner === Team.A 
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-400 shadow-md shadow-blue-500/20 scale-[1.02]' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <Trophy size={24} className={winner === Team.A ? 'text-blue-500' : 'text-slate-400'} />
                Team 1
              </button>
              <button 
                type="button"
                onClick={() => setWinner(Team.B)}
                className={`flex-1 py-4 px-4 rounded-2xl font-bold flex flex-col items-center gap-2 transition-all duration-200 border-2 ${
                  winner === Team.B 
                    ? 'bg-rose-50 dark:bg-rose-900/30 border-rose-500 text-rose-700 dark:text-rose-400 shadow-md shadow-rose-500/20 scale-[1.02]' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-rose-300 dark:hover:border-rose-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <Trophy size={24} className={winner === Team.B ? 'text-rose-500' : 'text-slate-400'} />
                Team 2
              </button>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-2xl transition-all duration-200"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={!winner || scoreA === '' || scoreB === ''}
              className="flex-1 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-2xl transition-all duration-200 disabled:opacity-50 disabled:grayscale shadow-lg shadow-emerald-500/20"
            >
              Save Match
            </button>
          </div>
        </form>
      </div>
    </div>
  );
  if (typeof window !== 'undefined') {
    const { createPortal } = require('react-dom');
    return createPortal(modal, document.body);
  }
  return null;
};

export default ScoreDialog;
