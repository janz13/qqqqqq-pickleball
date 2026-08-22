import os

base_dir = r"C:\Users\test\Downloads\QQQQQQ\QQQQQQ\web\src"

def rewrite_file(path, content):
    with open(os.path.join(base_dir, path), "w", encoding="utf-8") as f:
        f.write(content)


court_card_content = """'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { Court, CourtStatus, Team, Player } from '@/types/models';
import { Clock, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { PlayerCard } from './PlayerCard';

export function CourtCard({ court }: { court: Court }) {
  const { matches, players, completeMatch, updateCourt, removeCourt } = useStore();
  const [now, setNow] = useState(Date.now());

  const match = court.currentMatchId ? matches.find(m => m.id === court.currentMatchId) : null;
  const teamA = match ? match.teamA.map(id => players.find(p => p.id === id)!).filter(Boolean) : [];
  const teamB = match ? match.teamB.map(id => players.find(p => p.id === id)!).filter(Boolean) : [];

  useEffect(() => {
    if (!match || court.status !== CourtStatus.IN_PROGRESS) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [match, court.status]);

  let elapsed = '00:00';
  if (match && court.status === CourtStatus.IN_PROGRESS) {
    const diff = Math.floor((now - match.startedAtEpochMs) / 1000);
    const m = Math.floor(Math.max(0, diff) / 60).toString().padStart(2, '0');
    const s = (Math.max(0, diff) % 60).toString().padStart(2, '0');
    elapsed = `${m}:${s}`;
  }

  const headerGradient = 
    court.status === CourtStatus.OPEN ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 
    court.status === CourtStatus.IN_PROGRESS ? 'bg-blue-500 text-white' : 
    'bg-rose-500 text-white';

  return (
    <div className="flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-all duration-200 animate-slide-up">
      <div className={`flex items-center justify-between p-4 ${headerGradient}`}>
        <div className="flex items-center gap-2">
          <h3 className="font-bold tracking-tight text-lg">{court.label}</h3>
        </div>
        {court.status === CourtStatus.IN_PROGRESS && (
          <div className="flex items-center gap-1.5 font-mono text-lg font-semibold bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm text-white">
            <Clock size={16} />
            <span>{elapsed}</span>
          </div>
        )}
      </div>

      <div className="p-5 flex-grow flex flex-col justify-center min-h-[160px]">
        {court.status === CourtStatus.IN_PROGRESS && teamA.length > 0 && teamB.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {teamA.map((p: Player) => (
                <PlayerCard key={p.id} player={p} compact />
              ))}
            </div>
            
            <div className="flex items-center justify-center gap-3">
              <div className="h-px w-12 bg-gray-200 dark:bg-gray-700"></div>
              <span className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400 border border-gray-200 dark:border-gray-700 shadow-sm">
                VS
              </span>
              <div className="h-px w-12 bg-gray-200 dark:bg-gray-700"></div>
            </div>
            
            <div className="flex flex-col gap-2">
              {teamB.map((p: Player) => (
                <PlayerCard key={p.id} player={p} compact />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 py-6 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-800/20">
            {court.status === CourtStatus.OPEN ? 'Waiting for assignment...' : 'Needs reset before next match'}
          </div>
        )}
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-3">
        {court.status === CourtStatus.IN_PROGRESS && match && (
          <div className="flex w-full gap-3">
            <button 
              onClick={() => completeMatch(match.id, Team.A, 11, 0)}
              className="flex-1 min-h-[44px] bg-gradient-to-r from-blue-500 to-blue-600 hover:scale-[1.02] text-white rounded-xl text-sm font-semibold transition-all duration-200 shadow-md shadow-blue-500/20"
            >
              Team 1 Wins
            </button>
            <button 
              onClick={() => completeMatch(match.id, Team.B, 11, 0)}
              className="flex-1 min-h-[44px] bg-gradient-to-r from-rose-500 to-rose-600 hover:scale-[1.02] text-white rounded-xl text-sm font-semibold transition-all duration-200 shadow-md shadow-rose-500/20"
            >
              Team 2 Wins
            </button>
          </div>
        )}

        {court.status === CourtStatus.OPEN && (
          <div className="flex w-full gap-3">
            <button
              onClick={() => updateCourt({ ...court, status: CourtStatus.NEEDS_RESET })}
              className="flex-1 flex items-center justify-center gap-2 min-h-[44px] bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 rounded-xl text-sm font-medium transition-all duration-200"
            >
              <AlertCircle size={16} /> Mark Needs Reset
            </button>
            {!match && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to remove this court?')) {
                    removeCourt(court.id);
                  }
                }}
                className="px-4 min-h-[44px] bg-gray-100 text-gray-500 hover:text-rose-500 hover:bg-rose-50 dark:bg-gray-800 dark:text-gray-400 rounded-xl transition-all duration-200 flex items-center justify-center"
                aria-label="Remove Court"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        )}

        {court.status === CourtStatus.NEEDS_RESET && (
          <div className="flex w-full gap-3">
              <button
                onClick={() => updateCourt({ ...court, status: CourtStatus.OPEN })}
                className="flex-1 flex items-center justify-center gap-2 min-h-[44px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition-all duration-200 shadow-md"
              >
                <CheckCircle size={16} /> Mark Open
              </button>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to remove this court?')) {
                    removeCourt(court.id);
                  }
                }}
                className="px-4 min-h-[44px] bg-gray-100 text-gray-500 hover:text-rose-500 hover:bg-rose-50 dark:bg-gray-800 dark:text-gray-400 rounded-xl transition-all duration-200 flex items-center justify-center"
                aria-label="Remove Court"
              >
                <Trash2 size={18} />
              </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CourtCard;
"""
rewrite_file(r"components/ui/CourtCard.tsx", court_card_content)
