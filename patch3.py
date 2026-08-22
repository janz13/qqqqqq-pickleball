import os

base_dir = r"C:\Users\test\Downloads\QQQQQQ\QQQQQQ\web\src"

def rewrite_file(path, content):
    with open(os.path.join(base_dir, path), "w", encoding="utf-8") as f:
        f.write(content)

page_content = """'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Users, Shuffle, Trophy, ArrowRight, LayoutGrid } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const [joinCode, setJoinCode] = useState('');
  const router = useRouter();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length > 0) {
      router.push(`/session/${joinCode.toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 selection:bg-blue-500/30 overflow-hidden relative">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-10">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[2rem] mx-auto mb-8 flex items-center justify-center shadow-lg rotate-3 transition-transform hover:rotate-6">
            <LayoutGrid className="w-12 h-12 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-5xl sm:text-6xl font-black text-gray-900 dark:text-gray-100 tracking-tighter mb-4">
            QQQQQQ
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 font-medium">
            Smart pickleball queue management
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 space-y-8 shadow-sm border border-gray-200 dark:border-gray-800">
          
          <form onSubmit={handleJoin} className="space-y-4">
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 ml-2 uppercase tracking-wider">
              Join a Session
            </label>
            <div className="flex gap-3">
              <input 
                type="text" 
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter Code"
                maxLength={6}
                className="flex-grow px-6 min-h-[64px] text-2xl font-mono font-black tracking-widest text-center rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all uppercase placeholder:normal-case placeholder:font-sans placeholder:font-medium placeholder:tracking-normal placeholder:text-gray-400 text-gray-900 dark:text-gray-100"
              />
              <button 
                type="submit"
                disabled={joinCode.trim().length === 0}
                className="px-6 min-h-[64px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:grayscale text-white rounded-2xl transition-all hover:scale-[1.05] active:scale-95 flex items-center justify-center shadow-md"
              >
                <ArrowRight size={28} strokeWidth={3} />
              </button>
            </div>
          </form>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-gray-200 dark:border-gray-800"></div>
            <span className="flex-shrink-0 mx-4 text-gray-400 font-bold text-sm tracking-widest uppercase">OR</span>
            <div className="flex-grow border-t border-gray-200 dark:border-gray-800"></div>
          </div>

          <Link 
            href="/dashboard/new"
            className="w-full min-h-[64px] bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 font-bold text-lg rounded-2xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 shadow-sm"
          >
            <Play size={22} fill="currentColor" />
            Create New Session
          </Link>
        </div>

        <div className="mt-12 grid gap-4 max-w-sm mx-auto">
          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="p-3 bg-gradient-to-br from-blue-400 to-blue-500 text-white rounded-xl shrink-0 shadow-sm">
              <Shuffle size={20} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Smart Pairing</h3>
              <p className="text-xs text-gray-500 font-medium">Guarantees maximum variety.</p>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="p-3 bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-xl shrink-0 shadow-sm">
              <Users size={20} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Duo Queue</h3>
              <p className="text-xs text-gray-500 font-medium">Lock in with a partner.</p>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-xl shrink-0 shadow-sm">
              <Trophy size={20} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Live Leaderboards</h3>
              <p className="text-xs text-gray-500 font-medium">Track wins and percentages.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
"""
rewrite_file(r"app/page.tsx", page_content)

player_card_content = """'use client';

import { Player, PlayerStatus, Court } from '@/types/models';
import { useStore } from '@/lib/store';
import { Link2, ExternalLink } from 'lucide-react';
import Image from 'next/image';

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

  const Photo = () => player.photoUrl ? (
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
            <Photo />
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
            <Photo />
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
              <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{player.status.toLowerCase().replace('_', ' ')}</span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1.5">
            {player.lockedPartnerId && (
              <span className="text-[10px] bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1 font-medium shadow-sm">
                <Link2 size={10} /> Duo
              </span>
            )}
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
"""
rewrite_file(r"components/ui/PlayerCard.tsx", player_card_content)
