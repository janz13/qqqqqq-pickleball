import { Player, TournamentState, TournamentPair, TournamentMatch, SessionType, Team } from '@/types/models';

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
            id: `pair_${pairs.length + 1}`,
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
    
    // Then randomly pair the rest
    const remaining = availablePlayers.filter(p => !pairedIds.has(p.id)).sort(() => Math.random() - 0.5);
    for (let i = 0; i < remaining.length; i += 2) {
      if (i + 1 < remaining.length) {
        pairs.push({
          id: `pair_${pairs.length + 1}`,
          player1Id: remaining[i].id,
          player2Id: remaining[i + 1].id,
          name: `${remaining[i].name} & ${remaining[i + 1].name}`,
          seed: pairs.length + 1,
          poolPlayWins: 0,
          poolPlayPointDiff: 0,
          poolPlayPointsScored: 0
        });
      }
    }
  } else {
    // Completely random
    const shuffled = [...availablePlayers].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        pairs.push({
          id: `pair_${pairs.length + 1}`,
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
  }

  let phase: 'REGISTRATION' | 'POOL_PLAY' | 'BRACKET' | 'COMPLETED' = 'BRACKET';
  if (type === SessionType.TOURNAMENT_DOUBLES) phase = 'POOL_PLAY';

  const matches: TournamentMatch[] = [];

  // For Chaos Roulette, build the first round immediately as "BRACKET" phase.
  if (type === SessionType.TOURNAMENT_CHAOS) {
    // Generate Round 1 matches for the initial pairs
    for (let i = 0; i < pairs.length; i += 2) {
      matches.push({
        id: `chaos_match_${(i/2) + 1}`,
        round: 1,
        isLosersBracket: false,
        matchNumber: (i/2) + 1,
        nextMatchId: null,
        nextLoserMatchId: null,
        teamAId: pairs[i].id,
        teamBId: (i + 1 < pairs.length) ? pairs[i + 1].id : null, // Bye if odd number of pairs
        courtId: null,
        status: (i + 1 < pairs.length) ? 'PENDING' : 'COMPLETED',
        startedAtEpochMs: null,
        endedAtEpochMs: (i + 1 < pairs.length) ? null : Date.now(),
        winnerTeamId: (i + 1 < pairs.length) ? null : pairs[i].id,
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

/**
 * Builds the next round of pool play matches using a simple Swiss system.
 */
export function buildPoolPlayRound(state: TournamentState, courtsCount: number): TournamentMatch[] {
  // Sort pairs by wins, then point diff
  const sortedPairs = [...state.pairs].sort((a, b) => {
    if (a.poolPlayWins !== b.poolPlayWins) return b.poolPlayWins - a.poolPlayWins;
    return b.poolPlayPointDiff - a.poolPlayPointDiff;
  });

  const newMatches: TournamentMatch[] = [];
  const activeMatchIds = state.matches.length;

  const nextRoundNum = state.matches.length > 0 ? Math.max(...state.matches.map(m => m.round)) + 1 : 1;

  for (let i = 0; i < sortedPairs.length; i += 2) {
    if (i + 1 < sortedPairs.length) {
      newMatches.push({
        id: `pool_match_${activeMatchIds + (i/2) + 1}`,
        round: nextRoundNum,
        isLosersBracket: false,
        matchNumber: activeMatchIds + (i/2) + 1,
        nextMatchId: null,
        nextLoserMatchId: null,
        teamAId: sortedPairs[i].id,
        teamBId: sortedPairs[i + 1].id,
        courtId: null,
        status: 'PENDING',
        startedAtEpochMs: null,
        endedAtEpochMs: null,
        winnerTeamId: null,
        scoreA: null,
        scoreB: null,
        isBestOf3: false,
        games: []
      });
    }
  }

  return newMatches;
}

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

/**
 * Transitions from Pool Play to Bracket phase.
 */
export function generateBracket(state: TournamentState, type: SessionType): TournamentState {
  // Sort final pool play standings
  const sortedPairs = [...state.pairs].sort((a, b) => {
    if (a.poolPlayWins !== b.poolPlayWins) return b.poolPlayWins - a.poolPlayWins;
    if (a.poolPlayPointDiff !== b.poolPlayPointDiff) return b.poolPlayPointDiff - a.poolPlayPointDiff;
    return b.poolPlayPointsScored - a.poolPlayPointsScored;
  });

  const numParticipants = sortedPairs.length;
  if (numParticipants < 2) return state;

  const p = Math.pow(2, Math.ceil(Math.log2(numParticipants)));
  const seeding = getBracketSeeding(p);
  const matches: TournamentMatch[] = [];
  const startMatchNum = state.matches.length + 1;

  // ───────── DOUBLE ELIMINATION (The Grand Slam) ─────────
  if (type === SessionType.TOURNAMENT_DOUBLES) {
    const k = Math.log2(p);
    let matchCounter = startMatchNum;

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

    // ─── Resolve Byes in WB R1 ───
    for (const m of wbNodes[0]) {
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

    return {
      ...state,
      phase: 'BRACKET',
      matches: [...state.matches, ...matches]
    };
  }

  // ───────── SINGLE ELIMINATION (Knockout Sprint & Chaos) ─────────
  const numRounds = Math.log2(p);
  const matchNodes: TournamentMatch[][] = [];
  let matchCounter = startMatchNum;
  
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

  return {
    ...state,
    phase: 'BRACKET',
    matches: [...state.matches, ...matches]
  };
}

/**
 * Advances a winner in the bracket (and routes loser in double elimination).
 * Also supports reversing/swapping a winner on an already-completed match.
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

  const oldWinnerId = match.winnerTeamId;
  const oldLoserId = match.winnerTeamId ? (match.winnerTeamId === match.teamAId ? match.teamBId : match.teamAId) : null;
  const newLoserId = winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;

  let updatedMatches = state.matches.map(m => {
    if (m.id === matchId) {
      return { 
        ...m, 
        winnerTeamId, 
        status: 'COMPLETED' as const,
        scoreA: scoreA !== undefined ? scoreA : m.scoreA,
        scoreB: scoreB !== undefined ? scoreB : m.scoreB,
        endedAtEpochMs: m.endedAtEpochMs || Date.now()
      };
    }
    return m;
  });

  // Advance winner to nextMatchId
  if (match.nextMatchId) {
    updatedMatches = updatedMatches.map(m => {
      if (m.id === match.nextMatchId) {
        const nextM = { ...m };
        if (oldWinnerId && (nextM.teamAId === oldWinnerId || nextM.teamBId === oldWinnerId)) {
          if (nextM.teamAId === oldWinnerId) nextM.teamAId = winnerTeamId;
          else nextM.teamBId = winnerTeamId;
        } else {
          if (!nextM.teamAId) nextM.teamAId = winnerTeamId;
          else if (!nextM.teamBId && nextM.teamAId !== winnerTeamId) nextM.teamBId = winnerTeamId;
        }
        return nextM;
      }
      return m;
    });
  }

  // Drop loser to nextLoserMatchId (for Double Elimination)
  if (match.nextLoserMatchId && newLoserId) {
    updatedMatches = updatedMatches.map(m => {
      if (m.id === match.nextLoserMatchId) {
        const loserM = { ...m };
        if (oldLoserId && (loserM.teamAId === oldLoserId || loserM.teamBId === oldLoserId)) {
          if (loserM.teamAId === oldLoserId) loserM.teamAId = newLoserId;
          else loserM.teamBId = newLoserId;
        } else {
          if (!loserM.teamAId) loserM.teamAId = newLoserId;
          else if (!loserM.teamBId && loserM.teamAId !== newLoserId) loserM.teamBId = newLoserId;
        }
        return loserM;
      }
      return m;
    });
  }

  return {
    ...state,
    matches: updatedMatches
  };
}

/**
 * Updates or edits a completed pool play match score.
 * Safely recalculates pair stats (poolPlayWins, poolPlayPointsScored, poolPlayPointDiff).
 */
export function updatePoolMatchScore(
  state: TournamentState,
  matchId: string,
  scoreA: number,
  scoreB: number
): TournamentState {
  const match = state.matches.find(m => m.id === matchId);
  if (!match) return state;

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
  // Wait, if it's 4 players, they form 2 pairs, and play 1 match (Finals).
  if (survivingPlayerIds.length <= 2) {
    return { ...state, phase: 'COMPLETED' };
  }

  // Shuffle the surviving individual players to form new pairs!
  const shuffledPlayers = [...survivingPlayerIds].sort(() => Math.random() - 0.5);
  
  const newPairs: TournamentPair[] = [];
  const startPairId = state.pairs.length + 1;
  for (let i = 0; i < shuffledPlayers.length; i += 2) {
    if (i + 1 < shuffledPlayers.length) {
      const p1 = players.find(p => p.id === shuffledPlayers[i]);
      const p2 = players.find(p => p.id === shuffledPlayers[i + 1]);
      newPairs.push({
        id: `chaos_pair_${startPairId + (i/2)}`,
        player1Id: shuffledPlayers[i],
        player2Id: shuffledPlayers[i + 1],
        name: `${p1?.name || 'Unknown'} & ${p2?.name || 'Unknown'}`,
        seed: startPairId + (i/2),
        poolPlayWins: 0,
        poolPlayPointDiff: 0,
        poolPlayPointsScored: 0
      });
    }
  }

  const newMatches: TournamentMatch[] = [];
  const startMatchNum = state.matches.length + 1;
  const nextRound = currentRound + 1;

  for (let i = 0; i < newPairs.length; i += 2) {
    newMatches.push({
      id: `chaos_match_${startMatchNum + (i/2)}`,
      round: nextRound,
      isLosersBracket: false,
      matchNumber: startMatchNum + (i/2),
      nextMatchId: null,
      nextLoserMatchId: null,
      teamAId: newPairs[i].id,
      teamBId: (i + 1 < newPairs.length) ? newPairs[i + 1].id : null,
      courtId: null,
      status: (i + 1 < newPairs.length) ? 'PENDING' : 'COMPLETED',
      startedAtEpochMs: null,
      endedAtEpochMs: (i + 1 < newPairs.length) ? null : Date.now(),
      winnerTeamId: (i + 1 < newPairs.length) ? null : newPairs[i].id,
      scoreA: null,
      scoreB: null,
      isBestOf3: false,
      games: []
    });
  }

  return {
    ...state,
    pairs: [...state.pairs, ...newPairs],
    matches: [...state.matches, ...newMatches],
    phase: newMatches.length === 1 && newMatches[0].status === 'COMPLETED' ? 'COMPLETED' : 'BRACKET' // if the final match was a bye, which is weird but possible
  };
}
