'use client';

import React from 'react';
import { Users, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { PlayerStatus } from '@/types/models';

/**
 * Dynamic player-to-court ratio & estimated wait-time indicator for Roster and Settings tabs.
 * Highlights when the active roster exceeds 2 waves per rotation (>8 players per court).
 */
export function RosterRatioBanner() {
  const { players, courts } = useStore();

  const activePlayers = players.filter(
    p => p.status !== PlayerStatus.CHECKED_OUT && p.status !== PlayerStatus.RESTING
  );
  const playerCount = activePlayers.length;
  if (playerCount === 0) return null;

  const courtCount = Math.max(1, courts.length);
  const courtSlotsPerWave = courtCount * 4;
  const waves = playerCount / courtSlotsPerWave;
  const wavesRounded = Math.round(waves * 10) / 10;
  const wavesLabel = Number.isInteger(wavesRounded) ? wavesRounded.toString() : wavesRounded.toFixed(1);
  const estWaitMinutes = Math.max(0, Math.round((Math.max(1, waves) - 1) * 15));
  const exceedsTwoWaves = waves > 2;

  return (
    <div
      className={`rounded-2xl p-4 border flex items-start sm:items-center justify-between gap-3 flex-wrap transition-colors ${
        exceedsTwoWaves
          ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
          : 'bg-blue-50/80 dark:bg-slate-800/70 border-blue-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200'
      }`}
    >
      <div className="flex items-start sm:items-center gap-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            exceedsTwoWaves
              ? 'bg-amber-200/70 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
              : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
          }`}
        >
          {exceedsTwoWaves ? <AlertTriangle size={18} /> : <Users size={18} />}
        </div>
        <div className="text-sm">
          <div className="font-black">
            {playerCount} {playerCount === 1 ? 'Player' : 'Players'} / {courtCount}{' '}
            {courtCount === 1 ? 'Court' : 'Courts'} = {wavesLabel}{' '}
            {wavesRounded === 1 ? 'wave' : 'waves'} per rotation{' '}
            <span className="font-bold opacity-80">
              ({estWaitMinutes === 0 ? 'no wait' : `~${estWaitMinutes} min wait`})
            </span>
          </div>
          <p className="text-xs opacity-80 mt-0.5">
            {exceedsTwoWaves
              ? `Player-to-court ratio exceeds 2 waves (${courtSlotsPerWave} active slots per wave). Add courts if available to keep wait times under ~15 min.`
              : `${Math.min(playerCount, courtSlotsPerWave)} active on court per wave • ${Math.max(0, playerCount - courtSlotsPerWave)} queued in waiting pool.`}
          </p>
        </div>
      </div>

      <span
        className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 flex items-center gap-1 ${
          exceedsTwoWaves
            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
            : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
        }`}
      >
        {exceedsTwoWaves ? (
          <>High Wait Ratio (&gt;2:1)</>
        ) : (
          <>
            <CheckCircle2 size={12} /> Optimal Ratio
          </>
        )}
      </span>
    </div>
  );
}
