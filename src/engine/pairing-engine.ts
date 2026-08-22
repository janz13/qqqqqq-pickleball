/**
 * PairingEngine — TypeScript port of PairingEngine.kt
 *
 * Given 4 players (chosen by QueueEngine), decides how to split them
 * into two skill-balanced teams of two, heavily penalizing recent partner
 * and opponent repetitions to guarantee maximum variety every match.
 */

import { Player, ProposedMatch } from '../types/models';

/**
 * Given 4 players, finds the best 2v2 split.
 * Respects locked pairs (Duo Queue) — forces them onto the same team.
 */
export function pairFour(fourPlayers: Player[]): ProposedMatch {
  if (fourPlayers.length < 4) {
    const half = Math.floor(fourPlayers.length / 2);
    return { teamA: fourPlayers.slice(0, half), teamB: fourPlayers.slice(half) };
  }

  const [p0, p1, p2, p3] = fourPlayers;

  // Check for locked partner pairs — if found, force them onto the same team
  const lockedPair = findLockedPair(fourPlayers);
  if (lockedPair) {
    const others = fourPlayers.filter(
      (p) => p.id !== lockedPair[0].id && p.id !== lockedPair[1].id
    );
    return { teamA: [lockedPair[0], lockedPair[1]], teamB: others };
  }

  const candidates: ProposedMatch[] = [
    { teamA: [p0, p1], teamB: [p2, p3] },
    { teamA: [p0, p2], teamB: [p1, p3] },
    { teamA: [p0, p3], teamB: [p1, p2] },
  ];

  let best = candidates[0];
  let bestScore = scoreMatch(candidates[0]);
  for (let i = 1; i < candidates.length; i++) {
    const s = scoreMatch(candidates[i]);
    if (s < bestScore) {
      bestScore = s;
      best = candidates[i];
    }
  }
  return best;
}

/** Finds a locked partner pair within a group of players, or null if none exists. */
function findLockedPair(players: Player[]): [Player, Player] | null {
  for (const p of players) {
    if (p.lockedPartnerId != null) {
      const partner = players.find((other) => other.id === p.lockedPartnerId);
      if (partner) return [p, partner];
    }
  }
  return null;
}

/**
 * Evaluates a proposed 2v2 match setup. Lower score = better match.
 * Incorporates skill balance, recent partner repetition, and recent opponent repetition.
 *
 * Penalty hierarchy (strictly ordered):
 *   1,000,000 — L4+ on same team/court as L2- (unless locked exempt)
 *     100,000 — Skill gap > 1 between teams
 *      10,000 — 3+ pairwise repeat relationships (cohort penalty)
 *     Weighted — Individual partner/opponent repeat penalties
 *           5 — Each point of skill gap
 */
export function scoreMatch(m: ProposedMatch): number {
  if (m.teamA.length === 0 || m.teamB.length === 0) return 0;

  const skillA = m.teamA.reduce((sum, p) => sum + p.skillLevel, 0);
  const skillB = m.teamB.reduce((sum, p) => sum + p.skillLevel, 0);
  const skillGap = Math.abs(skillA - skillB);

  let skillPenalty = skillGap * 5;
  if (skillGap > 1) {
    skillPenalty += 100000; // STRICT: Skill gap > 1 is practically forbidden
  }

  const teamA_hasL4 = m.teamA.some((p) => p.skillLevel >= 4);
  const teamA_hasL2 = m.teamA.some((p) => p.skillLevel <= 2);
  const teamB_hasL4 = m.teamB.some((p) => p.skillLevel >= 4);
  const teamB_hasL2 = m.teamB.some((p) => p.skillLevel <= 2);

  const teamA_isExemptLocked =
    m.teamA.length === 2 && m.teamA[0].lockedPartnerId === m.teamA[1].id;
  const teamB_isExemptLocked =
    m.teamB.length === 2 && m.teamB[0].lockedPartnerId === m.teamB[1].id;

  // Internal team violations (L4 and L2 on the same team). Exempt if they are locked.
  if (teamA_hasL4 && teamA_hasL2 && !teamA_isExemptLocked) skillPenalty += 1000000;
  if (teamB_hasL4 && teamB_hasL2 && !teamB_isExemptLocked) skillPenalty += 1000000;

  // Cross-team violations (L4 on one team vs L2 on the other).
  // Exempt if the team with the L2 chose to be locked (they accepted the challenge).
  if (teamA_hasL4 && teamB_hasL2 && !teamB_isExemptLocked) skillPenalty += 1000000;
  if (teamB_hasL4 && teamA_hasL2 && !teamA_isExemptLocked) skillPenalty += 1000000;

  let repeatCount = 0;

  let partnerPenalty = 0;
  if (m.teamA.length === 2) {
    const s = partnerRepeatScore(m.teamA[0], m.teamA[1]);
    if (s > 0) repeatCount++;
    partnerPenalty += s;
  }
  if (m.teamB.length === 2) {
    const s = partnerRepeatScore(m.teamB[0], m.teamB[1]);
    if (s > 0) repeatCount++;
    partnerPenalty += s;
  }

  let opponentPenalty = 0;
  for (const a of m.teamA) {
    for (const b of m.teamB) {
      const s = opponentRepeatScore(a, b);
      if (s > 0) repeatCount++;
      opponentPenalty += s;
    }
  }

  // Non-linear cohort penalty: If 3 or more pairwise relationships on this court are repeats,
  // it means 3 or 4 of these players have played together recently.
  // 6 pairwise repeats = exact 4-player repeat.
  // 3 pairwise repeats = exactly 3 players repeating.
  let cohortPenalty = 0;
  if (repeatCount >= 6) {
    cohortPenalty = 150000; // WORSE than a skill gap violation
  } else if (repeatCount >= 3) {
    cohortPenalty = 50000; 
  }

  // Multiplying partner and opponent penalties ensures the engine actively avoids ALL repeats,
  // while the strict 100,000 penalty on skill gap > 1 ensures it never breaks the balance rule.
  return skillPenalty + partnerPenalty * 20 + opponentPenalty * 10 + cohortPenalty;
}

function partnerRepeatScore(p1: Player, p2: Player): number {
  if (p1.lockedPartnerId === p2.id || p2.lockedPartnerId === p1.id) return 0;

  const idx1 = p1.recentPartnerIds.indexOf(p2.id);
  const idx2 = p2.recentPartnerIds.indexOf(p1.id);
  if (idx1 < 0 && idx2 < 0) return 0;

  const positives = [idx1, idx2].filter((i) => i >= 0);
  const minIdx = Math.min(...positives);

  switch (minIdx) {
    case 0:
      return 30; // Partnered in the very last match
    case 1:
      return 15; // Partnered 2 matches ago
    case 2:
      return 5; // Partnered 3 matches ago
    default:
      return 2;
  }
}

function opponentRepeatScore(p1: Player, p2: Player): number {
  const idx1 = p1.recentOpponentIds.indexOf(p2.id);
  const idx2 = p2.recentOpponentIds.indexOf(p1.id);
  if (idx1 < 0 && idx2 < 0) return 0;

  const positives = [idx1, idx2].filter((i) => i >= 0);
  const minIdx = Math.min(...positives);

  switch (minIdx) {
    case 0:
      return 15; // Opponents in the very last match
    case 1:
      return 8; // Opponents 2 matches ago
    case 2:
      return 3; // Opponents 3 matches ago
    default:
      return 1;
  }
}
