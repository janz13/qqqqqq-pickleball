'use client';

import { useStore } from '@/lib/store';
import { Trophy, Medal, Award } from 'lucide-react';
import { PlayerCard } from '@/components/ui/PlayerCard';
import { getSortedPlayers } from '@/utils/leaderboard';

import { useState } from 'react';

export default function LeaderboardPanel() {
  const { players, matches, roster } = useStore();
  const [viewMode, setViewMode] = useState<'session' | 'alltime'>('session');

  const sourceData = viewMode === 'session' ? players : roster;
  
  // Custom sort for all-time since getSortedPlayers uses session properties
  const sortedPlayers = viewMode === 'session' 
    ? getSortedPlayers(players, matches)
    : [...roster].sort((a, b) => {
        if (b.allTimeWins !== a.allTimeWins) return b.allTimeWins - a.allTimeWins;
        const aPct = a.allTimeGamesPlayed > 0 ? a.allTimeWins / a.allTimeGamesPlayed : 0;
        const bPct = b.allTimeGamesPlayed > 0 ? b.allTimeWins / b.allTimeGamesPlayed : 0;
        return bPct - aPct;
      });

  const top3 = sortedPlayers.slice(0, 3);

  const getWinPct = (wins: number, games: number) => {
    if (games === 0) return 0;
    return Math.round((wins / games) * 100);
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-5xl mx-auto animate-slide-up">
      <div className="flex justify-center mt-4">
        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl inline-flex shadow-inner">
          <button
            onClick={() => setViewMode('session')}
            className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
              viewMode === 'session' 
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Current Session
          </button>
          <button
            onClick={() => setViewMode('alltime')}
            className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${
              viewMode === 'alltime' 
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            All-Time History
          </button>
        </div>
      </div>

      {top3.length > 0 && (
        <div className="flex justify-center items-end gap-3 sm:gap-6 h-56 px-4">
          {/* Second Place */}
          {top3[1] && (
            <div className="flex flex-col items-center flex-1 max-w-[140px] animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <div className="glass dark:glass-dark w-full pt-4 pb-2 px-2 flex flex-col items-center rounded-t-3xl border-b-0 translate-y-2 relative">
                <Medal className="text-slate-400 absolute -top-5 drop-shadow-md" size={32} />
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-slate-400 to-slate-500 text-white flex items-center justify-center font-bold text-sm shadow-md mb-2 overflow-hidden">
                  {top3[1].photoUrl ? <img src={top3[1].photoUrl} alt="Avatar" className="w-full h-full object-cover" /> : top3[1].name.substring(0, 2).toUpperCase()}
                </div>
                <div className="font-bold text-center text-sm truncate w-full">{top3[1].name}</div>
                <div className="text-xs font-semibold text-slate-500">{viewMode === 'session' ? top3[1].sessionWins : top3[1].allTimeWins} Wins</div>
              </div>
              <div className="w-full h-24 bg-gradient-to-t from-slate-300 to-slate-200 dark:from-slate-700 dark:to-slate-600 rounded-t-xl flex justify-center pt-3 shadow-inner">
                <span className="text-3xl font-black text-slate-400/50">2</span>
              </div>
            </div>
          )}

          {/* First Place */}
          {top3[0] && (
            <div className="flex flex-col items-center flex-1 max-w-[160px] z-10 animate-slide-up">
              <div className="glass dark:glass-dark w-full pt-6 pb-3 px-2 flex flex-col items-center rounded-t-3xl border-b-0 translate-y-2 relative shadow-amber-500/10">
                <Trophy className="text-amber-400 absolute -top-6 drop-shadow-lg scale-110" size={40} />
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white flex items-center justify-center font-bold text-base shadow-lg mb-2 ring-4 ring-amber-400/20 overflow-hidden">
                  {top3[0].photoUrl ? <img src={top3[0].photoUrl} alt="Avatar" className="w-full h-full object-cover" /> : top3[0].name.substring(0, 2).toUpperCase()}
                </div>
                <div className="font-bold text-center text-base truncate w-full">{top3[0].name}</div>
                <div className="text-sm font-bold text-amber-600 dark:text-amber-400">{viewMode === 'session' ? top3[0].sessionWins : top3[0].allTimeWins} Wins</div>
              </div>
              <div className="w-full h-32 bg-gradient-to-t from-amber-400 to-yellow-300 dark:from-amber-600 dark:to-amber-500 rounded-t-xl flex justify-center pt-3 shadow-inner">
                <span className="text-4xl font-black text-amber-600/50 dark:text-amber-900/30">1</span>
              </div>
            </div>
          )}

          {/* Third Place */}
          {top3[2] && (
            <div className="flex flex-col items-center flex-1 max-w-[140px] animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <div className="glass dark:glass-dark w-full pt-4 pb-2 px-2 flex flex-col items-center rounded-t-3xl border-b-0 translate-y-2 relative">
                <Award className="text-orange-400 absolute -top-5 drop-shadow-md" size={32} />
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-orange-600 to-orange-700 text-white flex items-center justify-center font-bold text-sm shadow-md mb-2 overflow-hidden">
                  {top3[2].photoUrl ? <img src={top3[2].photoUrl} alt="Avatar" className="w-full h-full object-cover" /> : top3[2].name.substring(0, 2).toUpperCase()}
                </div>
                <div className="font-bold text-center text-sm truncate w-full">{top3[2].name}</div>
                <div className="text-xs font-semibold text-slate-500">{viewMode === 'session' ? top3[2].sessionWins : top3[2].allTimeWins} Wins</div>
              </div>
              <div className="w-full h-20 bg-gradient-to-t from-orange-300 to-orange-200 dark:from-orange-800 dark:to-orange-700 rounded-t-xl flex justify-center pt-2 shadow-inner">
                <span className="text-3xl font-black text-orange-500/50 dark:text-orange-900/30">3</span>
              </div>
            </div>
          )}
        </div>
      )}

      {sortedPlayers.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500 glass dark:glass-dark rounded-3xl border-dashed">
          <Trophy size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No matches played yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h3 className="text-xl font-bold tracking-tight px-2">{viewMode === 'session' ? 'Session Rankings' : 'All-Time Rankings'}</h3>
          <div className="grid grid-cols-1 gap-3">
            {sortedPlayers.map((p, idx) => {
              const wins = viewMode === 'session' ? p.sessionWins : p.allTimeWins;
              const losses = viewMode === 'session' ? p.sessionLosses : p.allTimeLosses;
              const games = viewMode === 'session' ? p.sessionGamesPlayed : p.allTimeGamesPlayed;
              const pct = getWinPct(wins, games);
              return (
                <div key={p.id} className="glass dark:glass-dark p-4 rounded-2xl flex items-center gap-4 hover:scale-[1.01] transition-transform duration-200">
                  <div className="w-8 text-center font-mono font-bold text-slate-400 text-lg">
                    #{idx + 1}
                  </div>
                  <div className="flex-1">
                    <PlayerCard player={p} compact />
                  </div>
                  <div className="hidden sm:flex flex-col items-end min-w-[120px]">
                    <div className="flex items-center gap-3 w-full justify-end mb-1">
                      <span className="text-sm font-semibold">{pct}%</span>
                      <div className="text-xs text-slate-500">
                        {wins}W - {losses}L
                      </div>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
