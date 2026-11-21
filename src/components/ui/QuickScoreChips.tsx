'use client';

import React from 'react';

/** Clamps a raw score input to valid pickleball UI range [0, 99]. */
export function clampScore(raw: string | number): number {
  const parsed = typeof raw === 'number' ? raw : parseInt(raw, 10);
  if (isNaN(parsed)) return 0;
  return Math.max(0, Math.min(99, parsed));
}

/** Returns an advisory hint if scores are valid (differ) yet unusual for win-by-2 pickleball. */
export function getScoreAdvisory(scoreA: number, scoreB: number, targetScore = 11): string | null {
  if (scoreA === scoreB) return null;
  const high = Math.max(scoreA, scoreB);
  const diff = Math.abs(scoreA - scoreB);
  if (high > 25) return 'Unusually high score (> 25). Double-check before saving.';
  if (high < targetScore) return `Winning score is below standard ${targetScore}.`;
  if (high >= targetScore && diff < 2) return 'Standard pickleball requires winning by 2 points.';
  return null;
}

interface QuickScoreChipsProps {
  teamAName: string;
  teamBName: string;
  /** Called with the final (scoreA, scoreB) when a chip is tapped. */
  onPick: (scoreA: number, scoreB: number) => void;
  /** Winning score for a standard game. Defaults to 11. */
  targetScore?: number;
  /** Currently selected scores, used to highlight the active chip. */
  currentA?: number;
  currentB?: number;
}

/**
 * Quick-tap loser score chips (0–9): pick the winning team's row and tap the loser's points.
 * Sets the winner to `targetScore` (11) and the loser to 0–9 without stepper clicks.
 */
export function QuickScoreChips({
  teamAName,
  teamBName,
  onPick,
  targetScore = 11,
  currentA,
  currentB,
}: QuickScoreChipsProps) {
  const loserScores = Array.from({ length: targetScore - 1 }, (_, i) => i);

  const renderRow = (winner: 'A' | 'B', name: string) => (
    <div className="space-y-1.5">
      <div className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
        {name} won {targetScore} –
      </div>
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
        {loserScores.map(s => {
          const a = winner === 'A' ? targetScore : s;
          const b = winner === 'A' ? s : targetScore;
          const isActive = currentA === a && currentB === b;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onPick(a, b)}
              className={`h-9 rounded-lg text-xs font-black transition-all active:scale-95 border ${
                isActive
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-400'
              }`}
              aria-label={`${name} wins ${targetScore} to ${s}`}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-dashed border-gray-200 dark:border-gray-700">
      <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
        ⚡ Quick Score: tap loser&apos;s points (0–{targetScore - 2})
      </div>
      {renderRow('A', teamAName)}
      {renderRow('B', teamBName)}
    </div>
  );
}
