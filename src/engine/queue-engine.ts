/**
 * QueueEngine — TypeScript port of QueueEngine.kt
 *
 * Pure, stateless, unit-testable business logic for queueing and rotation.
 * Guarantees fair game counts while optimizing for maximum player mixing and variety.
 */

import { Player, PlayerStatus } from '../types/models';
import { pairFour, scoreMatch } from './pairing-engine';

/**
 * Priority ordering for who plays next. Rules, in order:
 *   1. Latecomers who have NOT yet caught up to the field's median games-played.
 *   2. Fewest games played this session.
 *   3. Most consecutive sit-outs (someone who's been skipped repeatedly jumps ahead).
 *   4. Longest time waiting (FIFO tiebreak).
 */
export function priorityOrder(pool: Player[]): Player[] {
  return [...pool].sort((a, b) => {
    // 1. Latecomers who haven't caught up get top priority (descending → true first)
    const aLate = a.isLatecomer && !a.hasCaughtUp ? 1 : 0;
    const bLate = b.isLatecomer && !b.hasCaughtUp ? 1 : 0;
    if (bLate !== aLate) return bLate - aLate;

    // 2. Fewest games played (ascending)
    if (a.sessionGamesPlayed !== b.sessionGamesPlayed)
      return a.sessionGamesPlayed - b.sessionGamesPlayed;

    // 3. Most consecutive sit-outs (descending)
    if (a.consecutiveSitOuts !== b.consecutiveSitOuts)
      return b.consecutiveSitOuts - a.consecutiveSitOuts;

    // 4. Longest time waiting — lowest queuedAtEpochMs first (ascending)
    return a.queuedAtEpochMs - b.queuedAtEpochMs;
  });
}

/**
 * Builds batches of 4 players for open courts.
 * Incorporates candidate pool expansion and variety scoring to prevent
 * the same 4 players from constantly repeating together across matches.
 */
export function buildNextBatches(
  availablePlayers: Player[],
  openCourtCount: number
): Player[][] {
  if (openCourtCount <= 0) return [];

  const available = availablePlayers.filter((p) => p.status === PlayerStatus.AVAILABLE);
  if (available.length < 4) return [];

  const remainingPool = [...available];
  const resultBatches: Player[][] = [];

  for (let courtIdx = 0; courtIdx < openCourtCount; courtIdx++) {
    if (remainingPool.length < 4) break;

    // 1. Sort remaining available players by strict fairness priority
    const sorted = priorityOrder(remainingPool);

    // Cap at 40 candidates — C(40,4) = 91,390 combos.
    // In JavaScript this takes ~20ms per court, which is well within
    // the 100ms UI responsiveness budget, while giving maximum variety.
    const baseCandidates = sorted.slice(0, Math.min(40, sorted.length));

    // Ensure locked partners are also included in the candidates
    const candidatesSet = new Map<string, Player>();
    for (const p of baseCandidates) {
      candidatesSet.set(p.id, p);
      if (p.lockedPartnerId != null) {
        const partner = remainingPool.find((rp) => rp.id === p.lockedPartnerId);
        if (partner) {
          candidatesSet.set(partner.id, partner);
        }
      }
    }
    const candidates = Array.from(candidatesSet.values());

    // 3. Generate combinations of 4 from the candidates
    const allCombos = generateCombinations(candidates, 4);
    const top4 = sorted.slice(0, 4);

    // 4. Filter out combinations that split a locked pair
    //    (if one partner is in the combo, the other must be too)
    let combos = allCombos.filter((four) => {
      const ids = new Set(four.map((p) => p.id));
      return four.every((p) => p.lockedPartnerId == null || ids.has(p.lockedPartnerId));
    });

    if (combos.length === 0) combos = allCombos; // fallback if filtering leaves nothing

    let chosenFour = top4;
    let bestTotal = Infinity;

    for (const four of combos) {
      const match = pairFour(four);
      const varietyScore = scoreMatch(match);

      let skipPenalty = 0;
      for (const skipped of top4) {
        if (!four.some((p) => p.id === skipped.id)) {
          // High penalty for skipping someone who desperately needs to catch up
          if (skipped.isLatecomer && !skipped.hasCaughtUp) skipPenalty += 100;

          // Penalty for skipping someone who has sat out (lowered for variety)
          skipPenalty += skipped.consecutiveSitOuts * 5;

          // Penalty if we skipped this person for someone who has already played more games
          for (const selected of four) {
            if (!top4.some((t) => t.id === selected.id)) {
              if (selected.sessionGamesPlayed > skipped.sessionGamesPlayed) {
                skipPenalty += 20;
              }
            }
          }
        }
      }

      // Small positional penalty to favor strict FIFO when variety is equal
      let queuePositionPenalty = 0;
      for (const p of four) {
        queuePositionPenalty += sorted.findIndex((sp) => sp.id === p.id);
      }

      const total = varietyScore + skipPenalty + queuePositionPenalty;
      if (total < bestTotal) {
        bestTotal = total;
        chosenFour = four;
      }
    }

    resultBatches.push(chosenFour);
    const chosenIds = new Set(chosenFour.map((p) => p.id));
    // Remove chosen players from remaining pool
    for (let i = remainingPool.length - 1; i >= 0; i--) {
      if (chosenIds.has(remainingPool[i].id)) {
        remainingPool.splice(i, 1);
      }
    }
  }

  return resultBatches;
}

/** Generate all combinations of size k from a list */
function generateCombinations<T>(list: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (list.length === 0) return [];
  const [head, ...tail] = list;
  const withHead = generateCombinations(tail, k - 1).map((combo) => [head, ...combo]);
  const withoutHead = generateCombinations(tail, k);
  return [...withHead, ...withoutHead];
}

/**
 * Recomputes catch-up target for a brand-new mid-session player.
 */
export function catchUpTargetForNewPlayer(activeRoster: Player[]): number {
  const counts = activeRoster
    .filter((p) => p.status !== PlayerStatus.CHECKED_OUT)
    .map((p) => p.sessionGamesPlayed)
    .sort((a, b) => a - b);

  if (counts.length === 0) return 0;

  const mid = Math.floor(counts.length / 2);
  if (counts.length % 2 === 0 && counts.length > 0) {
    return Math.ceil((counts[mid - 1] + counts[mid]) / 2);
  } else {
    return counts[mid];
  }
}

/** Call after every match completion to update sit-out counters for everyone NOT selected. */
export function incrementSitOuts(pool: Player[], selectedIds: Set<string>): Player[] {
  return pool.map((p) => {
    if (selectedIds.has(p.id)) {
      return { ...p, consecutiveSitOuts: 0 };
    } else if (p.status === PlayerStatus.AVAILABLE) {
      return { ...p, consecutiveSitOuts: p.consecutiveSitOuts + 1 };
    }
    return p;
  });
}

/** Call after a player's sessionGamesPlayed increments, to clear latecomer flag once caught up. */
export function refreshCatchUpStatus(player: Player): Player {
  if (player.isLatecomer && player.sessionGamesPlayed >= player.catchUpTargetGames) {
    return { ...player, hasCaughtUp: true };
  }
  return player;
}
