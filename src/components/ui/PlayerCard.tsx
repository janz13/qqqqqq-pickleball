/* eslint-disable @next/next/no-img-element */
'use client';

import { Player, PlayerStatus, Court } from '@/types/models';
import { useStore } from '@/lib/store';
import { Link2, ExternalLink } from 'lucide-react';

interface PlayerCardProps {
  player: Player;
  onClick?: () => void;
  compact?: boolean;
}

const skillGradients: Record<number, string> = {
  1: 'bg-gradient-to-r from-gray-400 to-gray-500 text-white',
  2: 'bg-gradient-to-r from-blue-400 to-blue-500 text-white',
  3: 'bg-gradient-to-r from-emerald-400 to-emerald-500 text-white',
  4: 'bg-gradient-to-r from-amber-400 to-amber-500 text-white',
  5: 'bg-gradient-to-r from-rose-400 to-rose-500 text-white',
};

const statusColors: Record<PlayerStatus, string> = {
  [PlayerStatus.AVAILABLE]: 'bg-emerald-500',
  [PlayerStatus.QUEUED]: 'bg-purple-500',
  [PlayerStatus.PLAYING]: 'bg-amber-500',
  [PlayerStatus.RESTING]: 'bg-gray-400',
  [PlayerStatus.CHECKED_OUT]: 'bg-rose-500',
};

const statusBorderColors: Record<PlayerStatus, string> = {
  [PlayerStatus.AVAILABLE]: 'border-l-emerald-500',
  [PlayerStatus.QUEUED]: 'border-l-purple-500',
  [PlayerStatus.PLAYING]: 'border-l-amber-500',
  [PlayerStatus.RESTING]: 'border-l-gray-400',
  [PlayerStatus.CHECKED_OUT]: 'border-l-rose-500',
};

export function PlayerCard({ player, onClick, compact = false }: PlayerCardProps) {
  const courts = useStore(state => state.courts);
  const currentCourt = player.currentCourtId ? courts.find((c: Court) => c.id === player.currentCourtId) : null;
  const initials = player.name.substring(0, 2).toUpperCase();

  const photoContent = player.photoUrl ? (
    <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover rounded-full shadow-sm" />
  ) : (
    <div className={`w-full h-full rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${skillGradients[player.skillLevel] || skillGradients[3]}`}>
      {initials}
    </div>
  );

  if (compact) {
    return (
      <button 
        onClick={onClick}
        className={`w-full text-left min-h-[44px] px-3 py-2 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-l-4 ${statusBorderColors[player.status]} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full">
            {photoContent}
          </div>
          <span className="font-medium text-gray-900 dark:text-gray-100">{player.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${statusColors[player.status]}`} />
        </div>
      </button>
    );
  }

  return (
    <button 
      onClick={onClick}
      className={`w-full text-left min-h-[64px] p-4 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 focus:ring-2 ring-blue-500/30 transition-colors flex flex-col gap-3 border-l-4 ${statusBorderColors[player.status]} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex justify-between items-start w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full">
            {photoContent}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 dark:text-gray-100 text-lg leading-none tracking-tight">{player.name}</span>
              {player.duprProfileUrl && (
                <a href={player.duprProfileUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-500 hover:text-blue-600 transition-colors">
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`w-2 h-2 rounded-full ${statusColors[player.status]}`} />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-widest">{player.status}</span>
            </div>
            {player.lockedPartnerId && (
              <div className="flex items-center gap-1 mt-1 text-blue-600 dark:text-blue-400 text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 w-fit px-1.5 py-0.5 rounded">
                <Link2 size={12} />
                Duo Locked
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1.5">
            {player.isLatecomer && !player.hasCaughtUp && (
              <span className="text-[10px] bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2 py-0.5 rounded-full font-medium shadow-sm">
                Catching Up
              </span>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shadow-sm ${skillGradients[player.skillLevel] || skillGradients[3]}`}>
              L{player.skillLevel}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-end w-full pt-1 border-t border-gray-100 dark:border-gray-800">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
          W: {player.sessionWins} | L: {player.sessionLosses} | {player.sessionGamesPlayed} GP
        </div>
        
        {player.status === PlayerStatus.PLAYING && currentCourt && (
          <span className="text-[10px] font-semibold bg-gradient-to-r from-amber-400 to-orange-500 text-white px-2 py-0.5 rounded-full shadow-sm">
            {currentCourt.label}
          </span>
        )}
      </div>
    </button>
  );
}

export default PlayerCard;
