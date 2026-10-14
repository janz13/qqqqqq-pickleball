import { Player, TournamentState, TournamentPair, TournamentMatch, SessionType, Team } from '@/types/models';

// ─────────────────────────────────────────────────────────────
//  Utility: Fisher-Yates Shuffle (uniform random distribution)
// ─────────────────────────────────────────────────────────────
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─────────────────────────────────────────────────────────────
//  Initialize Tournament
// ─────────────────────────────────────────────────────────────

/**
 * Generates an initial tournament state from a list of players.
 */
export function initializeTournament(
  players: Player[], 
  type: SessionType, 
  pairingStrategy: 'RANDOM' | 'LOCKED' | 'CUSTOM' = 'RANDOM',
  customPairs?: TournamentPair[]
): TournamentState {
  const availablePlayers = players.filter(p => p.status !== 'CHECKED_OUT');
  
  let pairs: TournamentPair[] = [];
  
  if (customPairs && customPairs.length > 0) {
    pairs = customPairs.map((p, idx) => ({
      ...p,
      seed: idx + 1,
      poolPlayWins: 0,
      poolPlayPointDiff: 0,
      poolPlayPointsScored: 0
    }));
  } else if (pairingStrategy === 'LOCKED') {
    // First, pair up locked partners
    const pairedIds = new Set<string>();
    for (const p of availablePlayers) {
      if (pairedIds.has(p.id)) continue;
      
      if (p.lockedPartnerId && !pairedIds.has(p.lockedPartnerId)) {
        const partner = availablePlayers.find(x => x.id === p.lockedPartnerId);
        if (partner) {
          pairs.push({
            id: `pair_${Date.now()}_${pairs.length}`,
            player1Id: p.id,
            player2Id: partner.id,
            name: `${p.name} & ${partner.name}`,
            seed: pairs.length + 1,
            poolPlayWins: 0,
            poolPlayPointDiff: 0,
            poolPlayPointsScored: 0
          });
          pairedIds.add(p.id);
          pairedIds.add(partner.id);
        }
      }
    }
    
    // Then randomly pair the rest using Fisher-Yates
    const remaining = shuffle(availablePlayers.filter(p => !pairedIds.has(p.id)));
    for (let i = 0; i + 1 < remaining.length; i += 2) {
      pairs.push({
        id: `pair_${Date.now()}_${pairs.length}`,
        player1Id: remaining[i].id,
        player2Id: remaining[i + 1].id,
        name: `${remaining[i].name} & ${remaining[i + 1].name}`,
        seed: pairs.length + 1,
        poolPlayWins: 0,
        poolPlayPointDiff: 0,
        poolPlayPointsScored: 0
      });
    }
  } else {
    // Completely random using Fisher-Yates
    const shuffled = shuffle(availablePlayers);
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      pairs.push({
        id: `pair_${Date.now()}_${pairs.length}`,
        player1Id: shuffled[i].id,
        player2Id: shuffled[i + 1].id,
        name: `${shuffled[i].name} & ${shuffled[i + 1].name}`,
        seed: pairs.length + 1,
        poolPlayWins: 0,
        poolPlayPointDiff: 0,
        poolPlayPointsScored: 0
      });
    }
  }

  let phase: 'REGISTRATION' | 'POOL_PLAY' | 'BRACKET' | 'COMPLETED' = 'BRACKET';
  if (type === SessionType.TOURNAMENT_DOUBLES) phase = 'POOL_PLAY';

  const matches: TournamentMatch[] = [];

  // For Chaos Roulette, build the first round immediately as "BRACKET" phase.
  if (type === SessionType.TOURNAMENT_CHAOS) {
    for (let i = 0; i < pairs.length; i += 2) {
      const hasBye = i + 1 >= pairs.length;
      matches.push({
        id: `chaos_match_${(i/2) + 1}`,
        round: 1,
        isLosersBracket: false,
        matchNumber: (i/2) + 1,
        nextMatchId: null,
        nextLoserMatchId: null,
        teamAId: pairs[i].id,
        teamBId: hasBye ? null : pairs[i + 1].id,
        courtId: null,
        status: hasBye ? 'COMPLETED' : 'READY',
        startedAtEpochMs: null,
        endedAtEpochMs: hasBye ? Date.now() : null,
        winnerTeamId: hasBye ? pairs[i].id : null,
        scoreA: null,
        scoreB: null,
        isBestOf3: false,
        games: []
      });
    }
  }

  let state: TournamentState = {
    pairs,
    matches,
    phase
  };

  // For Knockout Sprint, generate the bracket immediately
  if (type === SessionType.TOURNAMENT_SINGLE_ELIM) {
    state = generateBracket(state, type);
  }

  // For Doubles (Grand Slam), generate the first pool round immediately
  if (type === SessionType.TOURNAMENT_DOUBLES) {
    state.matches = buildPoolPlayRound(state, 4);
  }

  return state;
}

// ─────────────────────────────────────────────────────────────
//  Pool Play Round Generation (Swiss System)
// ─────────────────────────────────────────────────────────────

/**
 * Builds the next round of pool play matches using a simple Swiss system.
 * Avoids rematches from previous rounds when possible.
 */
export function buildPoolPlayRound(state: TournamentState, courtsCount: number): TournamentMatch[] {
  // Sort pairs by wins, then point diff
  const sortedPairs = [...state.pairs].sort((a, b) => {
    if ((a.poolPlayWins ?? 0) !== (b.poolPlayWins ?? 0)) return (b.poolPlayWins ?? 0) - (a.poolPlayWins ?? 0);
    return (b.poolPlayPointDiff ?? 0) - (a.poolPlayPointDiff ?? 0);
  });

  // Build set of previous matchups for anti-rematch
  const previousMatchups = new Set<string>();
  for (const m of state.matches) {
    if (m.teamAId && m.teamBId) {
      previousMatchups.add(`${m.teamAId}_${m.teamBId}`);
      previousMatchups.add(`${m.teamBId}_${m.teamAId}`);
    }
  }

  const newMatches: TournamentMatch[] = [];
  const activeMatchIds = state.matches.length;
  const nextRoundNum = state.matches.length > 0 ? Math.max(...state.matches.map(m => m.round)) + 1 : 1;

  // Swiss pairing with anti-rematch: try adjacent, swap if rematch
  const paired = new Set<number>();
  const pairings: [number, number][] = [];
  
  for (let i = 0; i < sortedPairs.length; i++) {
    if (paired.has(i)) continue;
    
    // Find the best opponent (prefer adjacent, avoid rematch)
    let bestJ = -1;
    for (let j = i + 1; j < sortedPairs.length; j++) {
      if (paired.has(j)) continue;
      const key = `${sortedPairs[i].id}_${sortedPairs[j].id}`;
      if (!previousMatchups.has(key)) {
        bestJ = j;
        break;
      }
      if (bestJ === -1) bestJ = j; // fallback to rematch if no other option
    }
    
    if (bestJ !== -1) {
      pairings.push([i, bestJ]);
      paired.add(i);
      paired.add(bestJ);
    }
  }

  // Handle odd pair out: give them a bye with auto-win
  const byePairIndex = Array.from({ length: sortedPairs.length }, (_, i) => i).find(i => !paired.has(i));

  for (let p = 0; p < pairings.length; p++) {
    const [idxA, idxB] = pairings[p];
    newMatches.push({
      id: `pool_match_${activeMatchIds + p + 1}`,
      round: nextRoundNum,
      isLosersBracket: false,
      matchNumber: activeMatchIds + p + 1,
      nextMatchId: null,
      nextLoserMatchId: null,
      teamAId: sortedPairs[idxA].id,
      teamBId: sortedPairs[idxB].id,
      courtId: null,
      status: 'READY',
      startedAtEpochMs: null,
      endedAtEpochMs: null,
      winnerTeamId: null,
      scoreA: null,
      scoreB: null,
      isBestOf3: false,
      games: []
    });
  }

  // Bye match for odd pair
  if (byePairIndex !== undefined) {
    newMatches.push({
      id: `pool_match_${activeMatchIds + pairings.length + 1}`,
      round: nextRoundNum,
      isLosersBracket: false,
      matchNumber: activeMatchIds + pairings.length + 1,
      nextMatchId: null,
      nextLoserMatchId: null,
      teamAId: sortedPairs[byePairIndex].id,
      teamBId: null,
      courtId: null,
      status: 'COMPLETED',
      startedAtEpochMs: Date.now(),
      endedAtEpochMs: Date.now(),
      winnerTeamId: sortedPairs[byePairIndex].id,
      scoreA: null,
      scoreB: null,
      isBestOf3: false,
      games: []
    });
  }

  return newMatches;
}

// ─────────────────────────────────────────────────────────────
//  Bracket Seeding
// ─────────────────────────────────────────────────────────────

function getBracketSeeding(size: number): number[] {
  let seeding = [1, 2];
  while (seeding.length < size) {
    const nextSeeding: number[] = [];
    const currentSize = seeding.length;
    for (const seed of seeding) {
      nextSeeding.push(seed);
      nextSeeding.push(currentSize * 2 + 1 - seed);
    }
    seeding = nextSeeding;
  }
  return seeding;
}

// ─────────────────────────────────────────────────────────────
//  Bracket Generation (Single & Double Elimination)
// ─────────────────────────────────────────────────────────────

/**
 * Transitions from Pool Play to Bracket phase.
 * Idempotent: removes any existing bracket matches before generating.
 */
export function generateBracket(state: TournamentState, type: SessionType): TournamentState {
  // Sort final pool play standings
  const sortedPairs = [...state.pairs].sort((a, b) => {
    if ((a.poolPlayWins ?? 0) !== (b.poolPlayWins ?? 0)) return (b.poolPlayWins ?? 0) - (a.poolPlayWins ?? 0);
    if ((a.poolPlayPointDiff ?? 0) !== (b.poolPlayPointDiff ?? 0)) return (b.poolPlayPointDiff ?? 0) - (a.poolPlayPointDiff ?? 0);
    return (b.poolPlayPointsScored ?? 0) - (a.poolPlayPointsScored ?? 0);
  });

  // Update seeds based on pool standings
  const updatedPairs = state.pairs.map(p => {
    const rank = sortedPairs.findIndex(sp => sp.id === p.id);
    return { ...p, seed: rank >= 0 ? rank + 1 : p.seed };
  });

  const numParticipants = sortedPairs.length;
  if (numParticipants < 2) return state;

  const p = Math.pow(2, Math.ceil(Math.log2(numParticipants)));
  const seeding = getBracketSeeding(p);
  
  // Remove any existing bracket matches (idempotent)
  const poolMatches = state.matches.filter(m => m.id.startsWith('pool_match_'));
  
  const matches: TournamentMatch[] = [];
  let matchCounter = poolMatches.length + 1;

  // ───────── DOUBLE ELIMINATION (The Grand Slam) ─────────
  if (type === SessionType.TOURNAMENT_DOUBLES) {
    const k = Math.log2(p);

    // Special case: 2 teams — just play Grand Finals directly (no LB needed)
    if (numParticipants === 2) {
      const gfMatch: TournamentMatch = {
        id: `gf_m${matchCounter}`,
        round: 1,
        isLosersBracket: false,
        matchNumber: matchCounter++,
        nextMatchId: null,
        nextLoserMatchId: null,
        teamAId: sortedPairs[0].id,
        teamBId: sortedPairs[1].id,
        courtId: null,
        status: 'READY',
        startedAtEpochMs: null,
        endedAtEpochMs: null,
        winnerTeamId: null,
        scoreA: null,
        scoreB: null,
        isBestOf3: true,
        games: []
      };
      matches.push(gfMatch);

      return {
        pairs: updatedPairs,
        phase: 'BRACKET',
        matches: [...poolMatches, ...matches]
      };
    }

    // 1. Winners Bracket matches
    const wbNodes: TournamentMatch[][] = [];
    for (let r = 0; r < k; r++) {
      wbNodes.push([]);
      const matchesInRound = p / Math.pow(2, r + 1);
      for (let i = 0; i < matchesInRound; i++) {
        const m: TournamentMatch = {
          id: `wb_r${r + 1}_m${matchCounter}`,
          round: r + 1,
          isLosersBracket: false,
          matchNumber: matchCounter++,
          nextMatchId: null,
          nextLoserMatchId: null,
          teamAId: null,
          teamBId: null,
          courtId: null,
          status: 'PENDING',
          startedAtEpochMs: null,
          endedAtEpochMs: null,
          winnerTeamId: null,
          scoreA: null,
          scoreB: null,
          isBestOf3: false,
          games: []
        };
        wbNodes[r].push(m);
        matches.push(m);
      }
    }

    // 2. Losers Bracket matches
    const numLbRounds = Math.max(1, 2 * (k - 1));
    const lbNodes: TournamentMatch[][] = [];
    for (let r = 0; r < numLbRounds; r++) {
      lbNodes.push([]);
      const mRound = Math.floor(r / 2) + 1;
      const matchesInRound = Math.max(1, p / Math.pow(2, mRound + 1));
      for (let i = 0; i < matchesInRound; i++) {
        const m: TournamentMatch = {
          id: `lb_r${r + 1}_m${matchCounter}`,
          round: r + 1,
          isLosersBracket: true,
          matchNumber: matchCounter++,
          nextMatchId: null,
          nextLoserMatchId: null,
          teamAId: null,
          teamBId: null,
          courtId: null,
          status: 'PENDING',
          startedAtEpochMs: null,
          endedAtEpochMs: null,
          winnerTeamId: null,
          scoreA: null,
          scoreB: null,
          isBestOf3: false,
          games: []
        };
        lbNodes[r].push(m);
        matches.push(m);
      }
    }

    // 3. Grand Finals match
    const gfMatch: TournamentMatch = {
      id: `gf_m${matchCounter}`,
      round: k + 1,
      isLosersBracket: false,
      matchNumber: matchCounter++,
      nextMatchId: null,
      nextLoserMatchId: null,
      teamAId: null,
      teamBId: null,
      courtId: null,
      status: 'PENDING',
      startedAtEpochMs: null,
      endedAtEpochMs: null,
      winnerTeamId: null,
      scoreA: null,
      scoreB: null,
      isBestOf3: true,
      games: []
    };
    matches.push(gfMatch);

    // 4. Grand Finals Reset match (activated if LB champion wins GF)
    const gfResetMatch: TournamentMatch = {
      id: `gf_reset_m${matchCounter}`,
      round: k + 2,
      isLosersBracket: false,
      matchNumber: matchCounter++,
      nextMatchId: null,
      nextLoserMatchId: null,
      teamAId: null,
      teamBId: null,
      courtId: null,
      status: 'PENDING',
      startedAtEpochMs: null,
      endedAtEpochMs: null,
      winnerTeamId: null,
      scoreA: null,
      scoreB: null,
      isBestOf3: true,
      games: []
    };
    // Link GF -> GF Reset
    gfMatch.nextMatchId = gfResetMatch.id;
    matches.push(gfResetMatch);

    // ─── Link Winners Bracket Internal ───
    for (let r = 0; r < k - 1; r++) {
      for (let i = 0; i < wbNodes[r].length; i++) {
        wbNodes[r][i].nextMatchId = wbNodes[r + 1][Math.floor(i / 2)].id;
      }
    }
    // WB Finals -> Grand Finals
    wbNodes[k - 1][0].nextMatchId = gfMatch.id;

    // ─── Link WB Losers dropping to LB ───
    if (lbNodes.length > 0) {
      // WB R1 losers -> LB R1
      for (let i = 0; i < wbNodes[0].length; i++) {
        if (lbNodes[0] && lbNodes[0][Math.floor(i / 2)]) {
          wbNodes[0][i].nextLoserMatchId = lbNodes[0][Math.floor(i / 2)].id;
        }
      }
      // Subsequent WB losers drop to LB major rounds
      for (let r = 1; r < k - 1; r++) {
        const lbMajorRoundIndex = 2 * r - 1;
        if (lbNodes[lbMajorRoundIndex]) {
          for (let i = 0; i < wbNodes[r].length; i++) {
            const targetLbMatchIndex = Math.min(wbNodes[r].length - 1 - i, lbNodes[lbMajorRoundIndex].length - 1);
            wbNodes[r][i].nextLoserMatchId = lbNodes[lbMajorRoundIndex][targetLbMatchIndex].id;
          }
        }
      }
      // WB Finals loser -> Losers Finals (last LB match)
      wbNodes[k - 1][0].nextLoserMatchId = lbNodes[numLbRounds - 1][0].id;
    }

    // ─── Link Losers Bracket Internal ───
    for (let r = 0; r < numLbRounds - 1; r++) {
      if (r % 2 === 0) {
        // Minor round -> Major round (same number of matches)
        for (let i = 0; i < lbNodes[r].length; i++) {
          if (lbNodes[r + 1] && lbNodes[r + 1][i]) {
            lbNodes[r][i].nextMatchId = lbNodes[r + 1][i].id;
          }
        }
      } else {
        // Major round -> Next minor round (half matches)
        for (let i = 0; i < lbNodes[r].length; i++) {
          if (lbNodes[r + 1] && lbNodes[r + 1][Math.floor(i / 2)]) {
            lbNodes[r][i].nextMatchId = lbNodes[r + 1][Math.floor(i / 2)].id;
          }
        }
      }
    }
    // LB Finals winner -> Grand Finals
    if (lbNodes.length > 0 && lbNodes[numLbRounds - 1][0]) {
      lbNodes[numLbRounds - 1][0].nextMatchId = gfMatch.id;
    }

    // ─── Seed Winners Round 1 ───
    for (let i = 0; i < wbNodes[0].length; i++) {
      const seedA = seeding[i * 2];
      const seedB = seeding[i * 2 + 1];
      const pairA = seedA <= numParticipants ? sortedPairs[seedA - 1] : null;
      const pairB = seedB <= numParticipants ? sortedPairs[seedB - 1] : null;
      wbNodes[0][i].teamAId = pairA ? pairA.id : null;
      wbNodes[0][i].teamBId = pairB ? pairB.id : null;
    }

    // ─── Resolve Byes in WB R1 (and propagate to LB) ───
    for (const m of wbNodes[0]) {
      if ((m.teamAId && !m.teamBId) || (!m.teamAId && m.teamBId)) {
        m.winnerTeamId = m.teamAId || m.teamBId;
        m.status = 'COMPLETED';
        // Advance winner to WB R2
        if (m.nextMatchId) {
          const next = matches.find(x => x.id === m.nextMatchId);
          if (next) {
            if (!next.teamAId) next.teamAId = m.winnerTeamId;
            else if (!next.teamBId && next.teamAId !== m.winnerTeamId) next.teamBId = m.winnerTeamId;
          }
        }
        // CRITICAL FIX: Bye produces no loser, so propagate bye to LB
        // Mark the linked LB match slot as "no opponent" (the other loser fills it)
        // We do NOT route a null loser — instead, we'll resolve LB byes below
      }
    }

    // ─── Resolve Byes in LB R1 ───
    // LB R1 matches receive losers from WB R1. If a WB R1 match was a bye,
    // no loser drops down. Check LB R1 matches: if only one team, auto-advance.
    if (lbNodes[0]) {
      for (const lbm of lbNodes[0]) {
        // Count how many WB R1 matches feed into this LB match
        const feeders = wbNodes[0].filter(wm => wm.nextLoserMatchId === lbm.id);
        const losersForThisMatch: string[] = [];
        for (const feeder of feeders) {
          if (feeder.status === 'COMPLETED' && feeder.teamAId && feeder.teamBId) {
            // Real match completed — has a loser
            const loserId = feeder.winnerTeamId === feeder.teamAId ? feeder.teamBId : feeder.teamAId;
            if (loserId) losersForThisMatch.push(loserId);
          }
          // If bye (only one team), no loser is produced
        }

        if (losersForThisMatch.length >= 2) {
          lbm.teamAId = losersForThisMatch[0];
          lbm.teamBId = losersForThisMatch[1];
          lbm.status = 'READY';
        } else if (losersForThisMatch.length === 1) {
          // Only one loser — auto-advance as bye
          lbm.teamAId = losersForThisMatch[0];
          lbm.teamBId = null;
          lbm.winnerTeamId = losersForThisMatch[0];
          lbm.status = 'COMPLETED';
          lbm.endedAtEpochMs = Date.now();
          // Advance this bye winner to LB R2
          if (lbm.nextMatchId) {
            const nextLb = matches.find(x => x.id === lbm.nextMatchId);
            if (nextLb) {
              if (!nextLb.teamAId) nextLb.teamAId = losersForThisMatch[0];
              else if (!nextLb.teamBId && nextLb.teamAId !== losersForThisMatch[0]) nextLb.teamBId = losersForThisMatch[0];
            }
          }
        }
        // If 0 losers (both feeders were byes), LB match stays empty — will be
        // auto-resolved when other paths fill it
      }
    }

    // Set READY status for any WB/LB match that now has both teams
    for (const m of matches) {
      if (m.status === 'PENDING' && m.teamAId && m.teamBId) {
        m.status = 'READY';
      }
    }

    return {
      pairs: updatedPairs,
      phase: 'BRACKET',
      matches: [...poolMatches, ...matches]
    };
  }

  // ───────── SINGLE ELIMINATION (Knockout Sprint & Chaos) ─────────
  const numRounds = Math.log2(p);
  const matchNodes: TournamentMatch[][] = [];
  
  // Create match nodes
  for (let r = 0; r < numRounds; r++) {
    matchNodes.push([]);
    const matchesInRound = p / Math.pow(2, r + 1);
    for (let i = 0; i < matchesInRound; i++) {
      const m: TournamentMatch = {
        id: `bracket_m${matchCounter}`,
        round: r + 1,
        isLosersBracket: false,
        matchNumber: matchCounter,
        nextMatchId: null,
        nextLoserMatchId: null,
        teamAId: null,
        teamBId: null,
        courtId: null,
        status: 'PENDING',
        startedAtEpochMs: null,
        endedAtEpochMs: null,
        winnerTeamId: null,
        scoreA: null,
        scoreB: null,
        isBestOf3: type === SessionType.TOURNAMENT_SINGLE_ELIM && matchesInRound <= 2,
        games: []
      };
      matchNodes[r].push(m);
      matches.push(m);
      matchCounter++;
    }
  }

  // Link matches
  for (let r = 0; r < numRounds - 1; r++) {
    for (let i = 0; i < matchNodes[r].length; i++) {
      const nextMatch = matchNodes[r+1][Math.floor(i / 2)];
      matchNodes[r][i].nextMatchId = nextMatch.id;
    }
  }

  // Populate first round
  for (let i = 0; i < matchNodes[0].length; i++) {
    const seedA = seeding[i * 2];
    const seedB = seeding[i * 2 + 1];
    const pairA = seedA <= numParticipants ? sortedPairs[seedA - 1] : null;
    const pairB = seedB <= numParticipants ? sortedPairs[seedB - 1] : null;
    
    matchNodes[0][i].teamAId = pairA ? pairA.id : null;
    matchNodes[0][i].teamBId = pairB ? pairB.id : null;
  }
  
  // Resolve Byes
  for (const m of matchNodes[0]) {
    if ((m.teamAId && !m.teamBId) || (!m.teamAId && m.teamBId)) {
      m.winnerTeamId = m.teamAId || m.teamBId;
      m.status = 'COMPLETED';
      if (m.nextMatchId) {
        const next = matches.find(x => x.id === m.nextMatchId);
        if (next) {
          if (!next.teamAId) next.teamAId = m.winnerTeamId;
          else if (!next.teamBId && next.teamAId !== m.winnerTeamId) next.teamBId = m.winnerTeamId;
        }
      }
    }
  }

  // Set READY status for matches with both teams
  for (const m of matches) {
    if (m.status === 'PENDING' && m.teamAId && m.teamBId) {
      m.status = 'READY';
    }
  }

  return {
    pairs: updatedPairs,
    phase: 'BRACKET',
    matches: [...poolMatches, ...matches]
  };
}

// ─────────────────────────────────────────────────────────────
//  Advance Match Winner (with completion detection & GF reset)
// ─────────────────────────────────────────────────────────────

/**
 * Advances a winner in the bracket (and routes loser in double elimination).
 * Also supports reversing/swapping a winner on an already-completed match.
 * Automatically detects tournament completion.
 * Handles Grand Finals bracket reset for double elimination.
 */
export function advanceMatchWinner(
  state: TournamentState, 
  matchId: string, 
  winnerTeamId: string,
  scoreA?: number | null,
  scoreB?: number | null
): TournamentState {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return state;

  // Validate winnerTeamId
  if (winnerTeamId !== match.teamAId && winnerTeamId !== match.teamBId) {
    return state;
  }

  // Reject tied scores
  if (scoreA !== undefined && scoreA !== null && scoreB !== undefined && scoreB !== null) {
    if (scoreA === scoreB) return state;
  }

  const oldWinnerId = match.winnerTeamId;
  const newLoserId = winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;

  // Handle Best-of-3: append to games array, only complete when 2 wins reached
  let matchCompleted = true;
  let updatedGames = [...(match.games || [])];
  if (match.isBestOf3 && scoreA !== undefined && scoreA !== null && scoreB !== undefined && scoreB !== null) {
    const gameWinnerId = scoreA > scoreB ? match.teamAId! : match.teamBId!;
    updatedGames.push({ winnerId: gameWinnerId, scoreA, scoreB });
    
    const teamAGameWins = updatedGames.filter(g => g.winnerId === match.teamAId).length;
    const teamBGameWins = updatedGames.filter(g => g.winnerId === match.teamBId).length;
    
    if (teamAGameWins < 2 && teamBGameWins < 2) {
      // Series not yet decided
      matchCompleted = false;
    }
  }

  let updatedMatches = state.matches.map(m => {
    if (m.id === matchId) {
      return { 
        ...m, 
        winnerTeamId: matchCompleted ? winnerTeamId : m.winnerTeamId, 
        status: matchCompleted ? 'COMPLETED' as const : 'IN_PROGRESS' as const,
        scoreA: scoreA !== undefined ? scoreA : m.scoreA,
        scoreB: scoreB !== undefined ? scoreB : m.scoreB,
        endedAtEpochMs: matchCompleted ? (m.endedAtEpochMs || Date.now()) : m.endedAtEpochMs,
        games: updatedGames
      };
    }
    return m;
  });

  // If Bo3 series not decided yet, return early
  if (!matchCompleted) {
    return { ...state, matches: updatedMatches };
  }

  // ─── Handle Grand Finals Reset Logic ───
  const isGrandFinals = match.id.startsWith('gf_') && !match.id.startsWith('gf_reset_');
  if (isGrandFinals && match.nextMatchId) {
    const gfResetMatch = updatedMatches.find(m => m.id === match.nextMatchId);
    if (gfResetMatch) {
      // Determine which team came from Winners Bracket vs Losers Bracket
      // WB champion is teamA (placed first by WB Finals advancement)
      const wbChampion = match.teamAId;
      
      if (winnerTeamId !== wbChampion && wbChampion) {
        // LB champion won GF — need a bracket reset match!
        updatedMatches = updatedMatches.map(m => {
          if (m.id === gfResetMatch.id) {
            return {
              ...m,
              teamAId: wbChampion,
              teamBId: winnerTeamId,
              status: 'READY' as const
            };
          }
          return m;
        });
        return { ...state, matches: updatedMatches };
      } else {
        // WB champion won — no reset needed, tournament is over
        return { ...state, matches: updatedMatches, phase: 'COMPLETED' };
      }
    }
  }

  // ─── Handle GF Reset match completion ───
  if (match.id.startsWith('gf_reset_')) {
    return { ...state, matches: updatedMatches, phase: 'COMPLETED' };
  }

  // Advance winner to nextMatchId (skip GF reset handling — already done above)
  if (match.nextMatchId && !isGrandFinals) {
    updatedMatches = updatedMatches.map(m => {
      if (m.id === match.nextMatchId) {
        const nextM = { ...m };
        if (oldWinnerId && (nextM.teamAId === oldWinnerId || nextM.teamBId === oldWinnerId)) {
          // Replacing previous winner
          if (nextM.teamAId === oldWinnerId) nextM.teamAId = winnerTeamId;
          else nextM.teamBId = winnerTeamId;
          
          // If next match was already completed, cascade reset downstream
          if (nextM.status === 'COMPLETED') {
            nextM.status = 'READY';
            nextM.winnerTeamId = null;
            nextM.scoreA = null;
            nextM.scoreB = null;
            nextM.endedAtEpochMs = null;
            nextM.games = [];
          }
        } else {
          if (!nextM.teamAId) nextM.teamAId = winnerTeamId;
          else if (!nextM.teamBId && nextM.teamAId !== winnerTeamId) nextM.teamBId = winnerTeamId;
        }
        // Set READY if both teams present
        if (nextM.teamAId && nextM.teamBId && nextM.status === 'PENDING') {
          nextM.status = 'READY';
        }
        return nextM;
      }
      return m;
    });
  }

  // Drop loser to nextLoserMatchId (for Double Elimination)
  if (match.nextLoserMatchId && newLoserId) {
    const oldLoserId = oldWinnerId ? (oldWinnerId === match.teamAId ? match.teamBId : match.teamAId) : null;
    updatedMatches = updatedMatches.map(m => {
      if (m.id === match.nextLoserMatchId) {
        const loserM = { ...m };
        if (oldLoserId && (loserM.teamAId === oldLoserId || loserM.teamBId === oldLoserId)) {
          if (loserM.teamAId === oldLoserId) loserM.teamAId = newLoserId;
          else loserM.teamBId = newLoserId;
          
          // Cascade reset if already completed
          if (loserM.status === 'COMPLETED') {
            loserM.status = 'READY';
            loserM.winnerTeamId = null;
            loserM.scoreA = null;
            loserM.scoreB = null;
            loserM.endedAtEpochMs = null;
            loserM.games = [];
          }
        } else {
          if (!loserM.teamAId) loserM.teamAId = newLoserId;
          else if (!loserM.teamBId && loserM.teamAId !== newLoserId) loserM.teamBId = newLoserId;
        }
        // Set READY if both teams present
        if (loserM.teamAId && loserM.teamBId && loserM.status === 'PENDING') {
          loserM.status = 'READY';
        }
        return loserM;
      }
      return m;
    });
  }

  // ─── Tournament Completion Detection ───
  // If this match has no nextMatchId (it's the final), tournament is done
  if (!match.nextMatchId && !match.nextLoserMatchId) {
    // Single elimination final or last chaos match
    const allBracketMatches = updatedMatches.filter(m => !m.id.startsWith('pool_match_'));
    const allDone = allBracketMatches.every(m => m.status === 'COMPLETED');
    if (allDone && allBracketMatches.length > 0) {
      return { ...state, matches: updatedMatches, phase: 'COMPLETED' };
    }
  }

  return {
    ...state,
    matches: updatedMatches
  };
}

// ─────────────────────────────────────────────────────────────
//  Update Pool Play Match Score
// ─────────────────────────────────────────────────────────────

/**
 * Updates or edits a completed pool play match score.
 * Safely recalculates pair stats (poolPlayWins, poolPlayPointsScored, poolPlayPointDiff).
 * Rejects tied scores.
 */
export function updatePoolMatchScore(
  state: TournamentState,
  matchId: string,
  scoreA: number,
  scoreB: number
): TournamentState {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return state;

  // Reject tied scores — pickleball has no ties
  if (scoreA === scoreB) return state;

  const newWinnerTeamId = scoreA > scoreB ? match.teamAId : match.teamBId;
  const newLoserTeamId = scoreA > scoreB ? match.teamBId : match.teamAId;

  let updatedPairs = state.pairs.map(p => ({ ...p }));

  // If match was already completed, REVERSE its previous contribution first
  if (match.status === 'COMPLETED' && match.winnerTeamId && match.scoreA !== null && match.scoreB !== null) {
    const oldWinnerId = match.winnerTeamId;
    const oldLoserId = match.winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
    const oldMaxScore = Math.max(match.scoreA, match.scoreB);
    const oldMinScore = Math.min(match.scoreA, match.scoreB);
    const oldDiff = Math.abs(match.scoreA - match.scoreB);

    updatedPairs = updatedPairs.map(p => {
      if (p.id === oldWinnerId) {
        return {
          ...p,
          poolPlayWins: Math.max(0, p.poolPlayWins - 1),
          poolPlayPointsScored: Math.max(0, p.poolPlayPointsScored - oldMaxScore),
          poolPlayPointDiff: p.poolPlayPointDiff - oldDiff
        };
      }
      if (p.id === oldLoserId) {
        return {
          ...p,
          poolPlayPointsScored: Math.max(0, p.poolPlayPointsScored - oldMinScore),
          poolPlayPointDiff: p.poolPlayPointDiff + oldDiff
        };
      }
      return p;
    });
  }

  // Now apply the new contribution
  const newMaxScore = Math.max(scoreA, scoreB);
  const newMinScore = Math.min(scoreA, scoreB);
  const newDiff = Math.abs(scoreA - scoreB);

  updatedPairs = updatedPairs.map(p => {
    if (p.id === newWinnerTeamId) {
      return {
        ...p,
        poolPlayWins: p.poolPlayWins + 1,
        poolPlayPointsScored: p.poolPlayPointsScored + newMaxScore,
        poolPlayPointDiff: p.poolPlayPointDiff + newDiff
      };
    }
    if (p.id === newLoserTeamId) {
      return {
        ...p,
        poolPlayPointsScored: p.poolPlayPointsScored + newMinScore,
        poolPlayPointDiff: p.poolPlayPointDiff - newDiff
      };
    }
    return p;
  });

  const updatedMatches = state.matches.map(m => {
    if (m.id === matchId) {
      return {
        ...m,
        scoreA,
        scoreB,
        winnerTeamId: newWinnerTeamId,
        status: 'COMPLETED' as const,
        endedAtEpochMs: m.endedAtEpochMs || Date.now()
      };
    }
    return m;
  });

  return {
    ...state,
    matches: updatedMatches,
    pairs: updatedPairs
  };
}

// ─────────────────────────────────────────────────────────────
//  Chaos Roulette Round Advancement
// ─────────────────────────────────────────────────────────────

export function advanceChaosRound(state: TournamentState, players: Player[]): TournamentState {
  const currentRound = Math.max(0, ...state.matches.map(m => m.round));
  if (currentRound === 0) return state;

  const currentRoundMatches = state.matches.filter(m => m.round === currentRound);
  
  // If not all matches in this round are completed, we can't advance yet.
  if (currentRoundMatches.some(m => m.status !== 'COMPLETED')) {
    return state;
  }

  // Gather surviving pairs
  const survivingPairIds = currentRoundMatches.map(m => m.winnerTeamId).filter(Boolean) as string[];
  
  // Extract the individual players who survived
  const survivingPlayerIds: string[] = [];
  for (const pairId of survivingPairIds) {
    const pair = state.pairs.find(p => p.id === pairId);
    if (pair) {
      survivingPlayerIds.push(pair.player1Id, pair.player2Id);
    }
  }

  // If there are 2 or fewer players left, the tournament is over!
  if (survivingPlayerIds.length <= 2) {
    return { ...state, phase: 'COMPLETED' };
  }

  // Track previous partners to avoid re-pairing
  const previousPartners = new Map<string, Set<string>>();
  for (const pair of state.pairs) {
    if (!previousPartners.has(pair.player1Id)) previousPartners.set(pair.player1Id, new Set());
    if (!previousPartners.has(pair.player2Id)) previousPartners.set(pair.player2Id, new Set());
    previousPartners.get(pair.player1Id)!.add(pair.player2Id);
    previousPartners.get(pair.player2Id)!.add(pair.player1Id);
  }

  // Shuffle surviving players using Fisher-Yates, then pair with anti-repeat
  const shuffledPlayers = shuffle(survivingPlayerIds);
  
  const newPairs: TournamentPair[] = [];
  const startPairId = state.pairs.length + 1;
  const used = new Set<string>();

  for (let i = 0; i < shuffledPlayers.length; i++) {
    if (used.has(shuffledPlayers[i])) continue;
    
    // Find the best partner (first unused player who wasn't a previous partner)
    let bestPartner = -1;
    for (let j = i + 1; j < shuffledPlayers.length; j++) {
      if (used.has(shuffledPlayers[j])) continue;
      const prevPartners = previousPartners.get(shuffledPlayers[i]);
      if (!prevPartners || !prevPartners.has(shuffledPlayers[j])) {
        bestPartner = j;
        break;
      }
      if (bestPartner === -1) bestPartner = j; // fallback
    }
    
    if (bestPartner !== -1) {
      const p1 = players.find(p => p.id === shuffledPlayers[i]);
      const p2 = players.find(p => p.id === shuffledPlayers[bestPartner]);
      newPairs.push({
        id: `chaos_pair_${startPairId + newPairs.length}`,
        player1Id: shuffledPlayers[i],
        player2Id: shuffledPlayers[bestPartner],
        name: `${p1?.name || 'Unknown'} & ${p2?.name || 'Unknown'}`,
        seed: startPairId + newPairs.length,
        poolPlayWins: 0,
        poolPlayPointDiff: 0,
        poolPlayPointsScored: 0
      });
      used.add(shuffledPlayers[i]);
      used.add(shuffledPlayers[bestPartner]);
    }
  }

  const newMatches: TournamentMatch[] = [];
  const startMatchNum = state.matches.length + 1;
  const nextRound = currentRound + 1;

  for (let i = 0; i < newPairs.length; i += 2) {
    const hasBye = i + 1 >= newPairs.length;
    newMatches.push({
      id: `chaos_match_${startMatchNum + (i/2)}`,
      round: nextRound,
      isLosersBracket: false,
      matchNumber: startMatchNum + (i/2),
      nextMatchId: null,
      nextLoserMatchId: null,
      teamAId: newPairs[i].id,
      teamBId: hasBye ? null : newPairs[i + 1].id,
      courtId: null,
      status: hasBye ? 'COMPLETED' : 'READY',
      startedAtEpochMs: null,
      endedAtEpochMs: hasBye ? Date.now() : null,
      winnerTeamId: hasBye ? newPairs[i].id : null,
      scoreA: null,
      scoreB: null,
      isBestOf3: false,
      games: []
    });
  }

  // Check if tournament ends: only 1 match and it's the final (or only 1 pair)
  const isFinalRound = newMatches.length === 1 && newMatches[0].status === 'COMPLETED';

  return {
    ...state,
    pairs: [...state.pairs, ...newPairs],
    matches: [...state.matches, ...newMatches],
    phase: isFinalRound ? 'COMPLETED' : 'BRACKET'
  };
}

// ─────────────────────────────────────────────────────────────
//  Helper: Get Tournament Placement (for podium/leaderboard)
// ─────────────────────────────────────────────────────────────

/**
 * Returns an ordered array of pair IDs from 1st to last based on
 * bracket-aware placement (not round numbers).
 */
export function getTournamentPlacements(state: TournamentState): string[] {
  const matches = state.matches.filter(m => !m.id.startsWith('pool_match_'));
  if (matches.length === 0) return state.pairs.map(p => p.id);

  const placements: string[] = [];
  const placed = new Set<string>();

  // 1. Find Grand Finals (or GF Reset) winner = Champion
  const gfResetMatch = matches.find(m => m.id.startsWith('gf_reset_') && m.status === 'COMPLETED');
  const gfMatch = matches.find(m => m.id.startsWith('gf_') && !m.id.startsWith('gf_reset_') && m.status === 'COMPLETED');
  
  if (gfResetMatch && gfResetMatch.winnerTeamId) {
    // GF Reset was played — that winner is champion
    placements.push(gfResetMatch.winnerTeamId);
    placed.add(gfResetMatch.winnerTeamId);
    const loserId = gfResetMatch.winnerTeamId === gfResetMatch.teamAId ? gfResetMatch.teamBId : gfResetMatch.teamAId;
    if (loserId) { placements.push(loserId); placed.add(loserId); }
  } else if (gfMatch && gfMatch.winnerTeamId) {
    // GF completed (WB champion won, no reset needed)
    placements.push(gfMatch.winnerTeamId);
    placed.add(gfMatch.winnerTeamId);
    const loserId = gfMatch.winnerTeamId === gfMatch.teamAId ? gfMatch.teamBId : gfMatch.teamAId;
    if (loserId) { placements.push(loserId); placed.add(loserId); }
  }

  // 2. Find LB Finals loser = 3rd place
  const lbMatches = matches.filter(m => m.isLosersBracket && m.status === 'COMPLETED');
  if (lbMatches.length > 0) {
    const lbFinals = lbMatches.reduce((a, b) => a.round > b.round ? a : b);
    if (lbFinals.winnerTeamId) {
      const lbFinalsLoserId = lbFinals.winnerTeamId === lbFinals.teamAId ? lbFinals.teamBId : lbFinals.teamAId;
      if (lbFinalsLoserId && !placed.has(lbFinalsLoserId)) {
        placements.push(lbFinalsLoserId);
        placed.add(lbFinalsLoserId);
      }
    }
  }

  // 3. Single elimination: final match winner = champion
  if (placements.length === 0) {
    // No GF found — try single elimination final (match with no nextMatchId)
    const finalMatch = matches.find(m => !m.nextMatchId && m.status === 'COMPLETED');
    if (finalMatch && finalMatch.winnerTeamId) {
      placements.push(finalMatch.winnerTeamId);
      placed.add(finalMatch.winnerTeamId);
      const loserId = finalMatch.winnerTeamId === finalMatch.teamAId ? finalMatch.teamBId : finalMatch.teamAId;
      if (loserId) { placements.push(loserId); placed.add(loserId); }
    }

    // Semi-final losers = T-3rd
    const semiFinals = matches.filter(m => m.nextMatchId === finalMatch?.id && m.status === 'COMPLETED');
    for (const sf of semiFinals) {
      if (sf.winnerTeamId) {
        const sfLoserId = sf.winnerTeamId === sf.teamAId ? sf.teamBId : sf.teamAId;
        if (sfLoserId && !placed.has(sfLoserId)) {
          placements.push(sfLoserId);
          placed.add(sfLoserId);
        }
      }
    }
  }

  // 4. Remaining teams: sort by round eliminated (higher = better) and pool play
  const remainingPairs = state.pairs.filter(p => !placed.has(p.id));
  const pairLastRound = new Map<string, number>();
  for (const pair of remainingPairs) {
    const pairMatches = matches.filter(m => 
      (m.teamAId === pair.id || m.teamBId === pair.id) && m.status === 'COMPLETED'
    );
    const maxRound = pairMatches.length > 0 ? Math.max(...pairMatches.map(m => m.round)) : 0;
    pairLastRound.set(pair.id, maxRound);
  }

  remainingPairs.sort((a, b) => {
    const roundDiff = (pairLastRound.get(b.id) ?? 0) - (pairLastRound.get(a.id) ?? 0);
    if (roundDiff !== 0) return roundDiff;
    if ((a.poolPlayWins ?? 0) !== (b.poolPlayWins ?? 0)) return (b.poolPlayWins ?? 0) - (a.poolPlayWins ?? 0);
    return (b.poolPlayPointDiff ?? 0) - (a.poolPlayPointDiff ?? 0);
  });

  for (const p of remainingPairs) {
    placements.push(p.id);
  }

  return placements;
}
