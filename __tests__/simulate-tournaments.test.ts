import { Player, SessionType, TournamentState, createPlayer } from '../src/types/models';
import { initializeTournament, buildPoolPlayRound, generateBracket, advanceMatchWinner, advanceChaosRound, checkPoolTiebreakers, buildTiebreakerMatches, hasDownstreamBracketMatchStarted } from '../src/engine/tournament-engine';

function runSimulation(playerCount: number, mode: SessionType) {
  console.log(`\n===========================================`);
  console.log(`SIMULATING ${mode} with ${playerCount} players`);
  console.log(`===========================================`);

  // Create players
  const players: Player[] = [];
  for (let i = 1; i <= playerCount; i++) {
    players.push(createPlayer({ id: `p${i}`, name: `Player ${i}` }));
  }

  let state = initializeTournament(players, mode);
  console.log(`Initial Phase: ${state.phase}`);
  console.log(`Initial Pairs created: ${state.pairs.length}`);

  let roundCount = 1;

  if (state.phase === 'POOL_PLAY') {
    console.log(`\n--- POOL PLAY ---`);
    for (let r = 1; r <= 4; r++) { // 4 rounds of pool play
      const matches = buildPoolPlayRound(state, 4);
      state = { ...state, matches: [...state.matches, ...matches] };
      
      const currentMatches = state.matches.filter(m => m.round === r);
      console.log(`Pool Round ${r}: Generated ${currentMatches.length} matches.`);
      
      // Complete them
      for (const m of currentMatches) {
        state = advanceMatchWinner(state, m.id, m.teamAId || m.teamBId!);
      }
    }
    state = generateBracket(state, mode);
    console.log(`\n--- TRANSITION TO BRACKET ---`);
    console.log(`Bracket matches generated: ${state.matches.filter(m => m.round > 0).length}`);
  }

  if (state.phase === 'BRACKET') {
    let iteration = 0;
    while (state.phase !== 'COMPLETED' && iteration < 20) {
      iteration++;
      const activeMatches = state.matches.filter(m => m.status === 'PENDING' || m.status === 'READY');
      
      if (activeMatches.length === 0) {
        // If it's chaos, advance round
        if (mode === SessionType.TOURNAMENT_CHAOS) {
          state = advanceChaosRound(state, players);
          if (state.phase === 'COMPLETED') break;
          const newMatches = state.matches.filter(m => m.status === 'PENDING');
          console.log(`Chaos Round advanced. Generated ${newMatches.length} new matches. Total pairs: ${state.pairs.length}`);
          if (newMatches.length === 0) break;
        } else {
          // Standard bracket might need resolution for next matches if nextMatchId was not updated?
          // No, advanceMatchWinner handles it.
          // Let's just find the matches that are PENDING but have both teams populated.
          // Wait, advanceMatchWinner sets nextMatch's teamAId/teamBId but doesn't change status to READY?
          // Ah, we might need to manually check. Let's just filter for matches that have at least one team and aren't completed.
        }
      }

      // Find matches we can play (has at least one team, is PENDING)
      const playableMatches = state.matches.filter(m => m.status !== 'COMPLETED' && (m.teamAId || m.teamBId));
      if (playableMatches.length === 0) {
        break; // Deadlock or finished
      }

      console.log(`Playing ${playableMatches.length} playable matches...`);
      for (const m of playableMatches) {
        if (m.teamAId && m.teamBId) {
          // Play the match!
          const winnerId = Math.random() > 0.5 ? m.teamAId : m.teamBId;
          state = advanceMatchWinner(state, m.id, winnerId);
        } else if (m.teamAId || m.teamBId) {
          // Bye
          const winnerId = m.teamAId || m.teamBId;
          state = advanceMatchWinner(state, m.id, winnerId!);
        }
      }

      // Re-evaluate phase for standard brackets
      if (mode !== SessionType.TOURNAMENT_CHAOS) {
        const remaining = state.matches.filter(m => m.status !== 'COMPLETED');
        if (remaining.length === 0) {
          state.phase = 'COMPLETED';
        }
      }
    }
  }

  console.log(`\nTournament Completed! Final total matches: ${state.matches.length}`);
  return state;
}

describe('Tournament Simulation', () => {
  it('simulates tournaments without errors', () => {
    const counts = [24, 36, 48, 64];
    for (const count of counts) {
      runSimulation(count, SessionType.TOURNAMENT_DOUBLES);
      runSimulation(count, SessionType.TOURNAMENT_SINGLE_ELIM);
      runSimulation(count, SessionType.TOURNAMENT_CHAOS);
    }
  });

  it('generates 3rd place match for Single Elimination (Knockout Sprint) with proper links', () => {
    const players: Player[] = [];
    for (let i = 1; i <= 8; i++) {
      players.push(createPlayer({ id: `p${i}`, name: `Player ${i}` }));
    }

    let state = initializeTournament(players, SessionType.TOURNAMENT_SINGLE_ELIM);
    expect(state.phase).toBe('BRACKET');

    const thirdPlaceMatch = state.matches.find(m => m.is3rdPlaceMatch);
    expect(thirdPlaceMatch).toBeDefined();
    expect(thirdPlaceMatch!.id).toMatch(/^3rd_place_/);
    expect(thirdPlaceMatch!.isBestOf3).toBe(true);
    expect(thirdPlaceMatch!.nextMatchId).toBeNull();

    // Check semifinal matches have nextLoserMatchId pointing to 3rd place match
    const semiMatches = state.matches.filter(m => m.nextLoserMatchId === thirdPlaceMatch!.id);
    expect(semiMatches.length).toBe(2);

    // Play semifinal 1
    const semi1 = semiMatches[0];
    state = advanceMatchWinner(state, semi1.id, semi1.teamAId!);
    let updated3rd = state.matches.find(m => m.id === thirdPlaceMatch!.id)!;
    expect(updated3rd.teamAId).toBe(semi1.teamBId);
    expect(updated3rd.status).toBe('PENDING');

    // Play semifinal 2
    const semi2 = semiMatches[1];
    state = advanceMatchWinner(state, semi2.id, semi2.teamAId!);
    updated3rd = state.matches.find(m => m.id === thirdPlaceMatch!.id)!;
    expect(updated3rd.teamBId).toBe(semi2.teamBId);
    expect(updated3rd.status).toBe('READY');

    // Finals match
    const finalsMatch = state.matches.find(m => m.round === updated3rd.round && !m.is3rdPlaceMatch)!;
    expect(finalsMatch).toBeDefined();

    // Complete finals first
    state = advanceMatchWinner(state, finalsMatch.id, finalsMatch.teamAId!);
    expect(state.phase).toBe('BRACKET'); // Not completed yet because 3rd place is pending!

    // Complete 3rd place match
    state = advanceMatchWinner(state, updated3rd.id, updated3rd.teamAId!);
    expect(state.phase).toBe('COMPLETED'); // Both finished -> COMPLETED
  });

  it('handles Best of 3 game progression correctly', () => {
    const players: Player[] = [];
    for (let i = 1; i <= 8; i++) {
      players.push(createPlayer({ id: `p${i}`, name: `Player ${i}` }));
    }

    let state = initializeTournament(players, SessionType.TOURNAMENT_SINGLE_ELIM);
    const semiMatch = state.matches.find(m => m.round === 1 && m.isBestOf3)!;
    expect(semiMatch).toBeDefined();
    const teamA = semiMatch.teamAId!;
    const teamB = semiMatch.teamBId!;

    // Game 1: Team A wins (11-9)
    state = advanceMatchWinner(state, semiMatch.id, teamA, 11, 9);
    let m = state.matches.find(x => x.id === semiMatch.id)!;
    expect(m.status).toBe('IN_PROGRESS');
    expect(m.games.length).toBe(1);
    expect(m.games[0]).toEqual({ winnerId: teamA, scoreA: 11, scoreB: 9 });

    // Game 2: Team B wins (8-11)
    state = advanceMatchWinner(state, semiMatch.id, teamB, 8, 11);
    m = state.matches.find(x => x.id === semiMatch.id)!;
    expect(m.status).toBe('IN_PROGRESS');
    expect(m.games.length).toBe(2);

    // Game 3: Team A wins (11-7) -> Series decided 2-1
    state = advanceMatchWinner(state, semiMatch.id, teamA, 11, 7);
    m = state.matches.find(x => x.id === semiMatch.id)!;
    expect(m.status).toBe('COMPLETED');
    expect(m.winnerTeamId).toBe(teamA);
    expect(m.games.length).toBe(3);
  });

  it('does NOT create a 3rd place match for Chaos Roulette', () => {
    const players: Player[] = [];
    for (let i = 1; i <= 8; i++) {
      players.push(createPlayer({ id: `p${i}`, name: `Player ${i}` }));
    }

    const state = initializeTournament(players, SessionType.TOURNAMENT_CHAOS);
    const thirdPlaceMatch = state.matches.find(m => m.is3rdPlaceMatch);
    expect(thirdPlaceMatch).toBeUndefined();
  });

  it('correctly implements Grand Slam UB/LB split seeding', () => {
    // 16 players = 8 pairs
    const players: Player[] = [];
    for (let i = 1; i <= 16; i++) {
      players.push(createPlayer({ id: `p${i}`, name: `Player ${i}` }));
    }

    let state = initializeTournament(players, SessionType.TOURNAMENT_DOUBLES);
    expect(state.pairs.length).toBe(8);

    // Set up clear standings: Pairs 1..4 have high wins (UB), Pairs 5..8 have low wins (LB)
    state.pairs = state.pairs.map((pair, idx) => ({
      ...pair,
      poolPlayWins: 8 - idx,
      poolPlayPointDiff: (8 - idx) * 5,
      poolPlayPointsScored: (8 - idx) * 11
    }));

    // Transition to bracket
    state = generateBracket(state, SessionType.TOURNAMENT_DOUBLES);
    expect(state.phase).toBe('BRACKET');

    const top4PairIds = state.pairs.slice(0, 4).map(p => p.id);
    const bottom4PairIds = state.pairs.slice(4).map(p => p.id);

    // Check WB Round 1 matches contain only UB teams (top 4)
    const wbR1Matches = state.matches.filter(m => m.id.startsWith('wb_r1_'));
    expect(wbR1Matches.length).toBe(2);
    for (const m of wbR1Matches) {
      expect(m.isLosersBracket).toBe(false);
      expect(m.nextLoserMatchId).not.toBeNull(); // Double elim advantage: drop on loss
      if (m.teamAId) expect(top4PairIds).toContain(m.teamAId);
      if (m.teamBId) expect(top4PairIds).toContain(m.teamBId);
    }

    // Check LB Direct Round 1 matches contain only LB teams (bottom 4)
    const lbDirectMatches = state.matches.filter(m => m.id.startsWith('lb_r1_'));
    expect(lbDirectMatches.length).toBe(2);
    for (const m of lbDirectMatches) {
      expect(m.isLosersBracket).toBe(true);
      expect(m.nextLoserMatchId).toBeNull(); // LB direct teams have single elimination
      if (m.teamAId) expect(bottom4PairIds).toContain(m.teamAId);
      if (m.teamBId) expect(bottom4PairIds).toContain(m.teamBId);
    }
  });

  it('detects ties at the UB/LB cutline and generates tiebreaker matches', () => {
    // 8 pairs (cutline is between pair 4 and pair 5)
    const pairs = Array.from({ length: 8 }, (_, i) => ({
      id: `pair_${i + 1}`,
      player1Id: `p${i * 2 + 1}`,
      player2Id: `p${i * 2 + 2}`,
      name: `Team ${i + 1}`,
      seed: i + 1,
      poolPlayWins: i < 3 ? 3 : (i === 3 || i === 4 ? 2 : 1), // pair 4 & 5 tied at 2 wins
      poolPlayPointDiff: i < 3 ? 10 : (i === 3 || i === 4 ? 4 : 0), // pair 4 & 5 tied at +4 diff
      poolPlayPointsScored: i < 3 ? 33 : (i === 3 || i === 4 ? 28 : 20) // pair 4 & 5 tied at 28 pts
    }));

    const state: TournamentState = {
      pairs,
      matches: [],
      phase: 'POOL_PLAY',
      maxPoolRounds: 3,
      currentPoolRound: 3
    };

    // Cutline is at index 3 (4th team) vs index 4 (5th team)
    const { needsTiebreaker, tiedPairIds } = checkPoolTiebreakers(state);
    expect(needsTiebreaker).toBe(true);
    expect(tiedPairIds).toContain('pair_4');
    expect(tiedPairIds).toContain('pair_5');

    // Build tiebreaker matches
    const tiebreakerMatches = buildTiebreakerMatches(state, tiedPairIds);
    expect(tiebreakerMatches.length).toBe(1);
    expect(tiebreakerMatches[0].id).toMatch(/^pool_tiebreaker_/);
    expect(tiebreakerMatches[0].status).toBe('READY');
    expect(tiebreakerMatches[0].teamAId).toBe('pair_4');
    expect(tiebreakerMatches[0].teamBId).toBe('pair_5');
  });

  it('correctly links 16-pair Double Elimination (8 UB + 8 LB) without match feed collisions', () => {
    // 32 players = 16 pairs
    const players: Player[] = [];
    for (let i = 1; i <= 32; i++) {
      players.push(createPlayer({ id: `p${i}`, name: `Player ${i}` }));
    }

    let state = initializeTournament(players, SessionType.TOURNAMENT_DOUBLES);
    expect(state.pairs.length).toBe(16);

    // Standings: 1..8 UB, 9..16 LB
    state.pairs = state.pairs.map((pair, idx) => ({
      ...pair,
      poolPlayWins: 16 - idx,
      poolPlayPointDiff: (16 - idx) * 5,
      poolPlayPointsScored: (16 - idx) * 11
    }));

    state = generateBracket(state, SessionType.TOURNAMENT_DOUBLES);

    // UB structure
    const wbR1 = state.matches.filter(m => m.id.startsWith('wb_r1_'));
    const wbR2 = state.matches.filter(m => m.id.startsWith('wb_r2_'));
    const wbR3 = state.matches.filter(m => m.id.startsWith('wb_r3_'));
    expect(wbR1.length).toBe(4);
    expect(wbR2.length).toBe(2);
    expect(wbR3.length).toBe(1);

    // LB structure: 6 rounds
    const lbR1 = state.matches.filter(m => m.id.startsWith('lb_r1_'));
    const lbR2 = state.matches.filter(m => m.id.startsWith('lb_r2_'));
    const lbR3 = state.matches.filter(m => m.id.startsWith('lb_r3_'));
    const lbR4 = state.matches.filter(m => m.id.startsWith('lb_r4_'));
    const lbR5 = state.matches.filter(m => m.id.startsWith('lb_r5_'));
    const lbR6 = state.matches.filter(m => m.id.startsWith('lb_r6_'));

    expect(lbR1.length).toBe(4);
    expect(lbR2.length).toBe(4);
    expect(lbR3.length).toBe(2);
    expect(lbR4.length).toBe(2);
    expect(lbR5.length).toBe(1);
    expect(lbR6.length).toBe(1);

    // Verify WB R1 losers drop into LB R2 (NOT LB R4)
    for (const m of wbR1) {
      expect(m.nextLoserMatchId).toMatch(/^lb_r2_/);
    }

    // Verify LB R1 winners advance to LB R2
    for (const m of lbR1) {
      expect(m.nextMatchId).toMatch(/^lb_r2_/);
    }

    // Verify WB R2 losers drop into LB R4
    for (const m of wbR2) {
      expect(m.nextLoserMatchId).toMatch(/^lb_r4_/);
    }

    // Verify LB R3 winners advance to LB R4
    for (const m of lbR3) {
      expect(m.nextMatchId).toMatch(/^lb_r4_/);
    }

    // Verify WB R3 (UB Final) loser drops into LB R6 (LB Final)
    expect(wbR3[0].nextLoserMatchId).toMatch(/^lb_r6_/);

    // Verify LB R5 winner advances to LB R6 (LB Final)
    expect(lbR5[0].nextMatchId).toMatch(/^lb_r6_/);

    // Verify GF feeders: WB R3 winner and LB R6 winner both feed to GF
    const gf = state.matches.find(m => m.id.startsWith('gf_m'));
    expect(wbR3[0].nextMatchId).toBe(gf?.id);
    expect(lbR6[0].nextMatchId).toBe(gf?.id);

    // Complete WB R1 and LB R1
    for (const m of wbR1) {
      state = advanceMatchWinner(state, m.id, m.teamAId!, 11, 9);
    }
    for (const m of lbR1) {
      state = advanceMatchWinner(state, m.id, m.teamAId!, 11, 9);
    }

    // Now all 4 LB R2 matches should be READY with 1 LB winner and 1 WB loser
    const updatedLbR2 = state.matches.filter(m => m.id.startsWith('lb_r2_'));
    for (const m of updatedLbR2) {
      expect(m.status).toBe('READY');
      expect(m.teamAId).toBeTruthy();
      expect(m.teamBId).toBeTruthy();
      expect(m.teamAId).not.toBe(m.teamBId);
    }
  });

  it('detects when downstream bracket or Chaos matches have started and blocks unsafe reversals', () => {
    // 16 players = 8 teams in Single Elim (R1 = QF, R2 = Bo3 SF, R3 = Bo3 Final + 3rd place)
    const players: Player[] = [];
    for (let i = 1; i <= 16; i++) {
      players.push(createPlayer({ id: `p${i}`, name: `Player ${i}` }));
    }

    let state = initializeTournament(players, SessionType.TOURNAMENT_SINGLE_ELIM);
    const qfMatches = state.matches.filter(m => m.round === 1);
    expect(qfMatches.length).toBe(4);

    // Complete QF1 and QF2 so SF1 becomes READY (not yet started)
    state = advanceMatchWinner(state, qfMatches[0].id, qfMatches[0].teamAId!, 11, 8);
    state = advanceMatchWinner(state, qfMatches[1].id, qfMatches[1].teamAId!, 11, 7);

    // SF1 is READY with 0 games played -> reversal of QF1 is still safe
    expect(hasDownstreamBracketMatchStarted(state, qfMatches[0].id, false)).toBe(false);

    // Play Game 1 of Bo3 SF1 -> SF1 becomes IN_PROGRESS -> QF1 reversal must now be blocked!
    const sf1 = state.matches.find(m => m.id === qfMatches[0].nextMatchId)!;
    expect(sf1.isBestOf3).toBe(true);
    state = advanceMatchWinner(state, sf1.id, sf1.teamAId!, 11, 9);
    expect(hasDownstreamBracketMatchStarted(state, qfMatches[0].id, false)).toBe(true);

    // Complete Game 2 of Bo3 SF1 -> SF1 COMPLETED -> reversing SF1 while Final/3rd-place unstarted is allowed
    state = advanceMatchWinner(state, sf1.id, sf1.teamAId!, 11, 6);
    expect(hasDownstreamBracketMatchStarted(state, sf1.id, false)).toBe(false);

    // Reversing a completed Bo3 match updates series cleanly to 2-0 for the new winner
    state = advanceMatchWinner(state, sf1.id, sf1.teamBId!, 9, 11);
    const reversedSf1 = state.matches.find(m => m.id === sf1.id)!;
    expect(reversedSf1.winnerTeamId).toBe(sf1.teamBId);
    expect(reversedSf1.games.length).toBe(2);
    expect(reversedSf1.games.every(g => g.winnerId === sf1.teamBId)).toBe(true);

    // Chaos Roulette: once Round 2 is generated, Round 1 matches report downstream started
    let chaosState = initializeTournament(players, SessionType.TOURNAMENT_CHAOS);
    const r1Chaos = chaosState.matches.filter(m => m.round === 1);
    for (const m of r1Chaos) {
      chaosState = advanceMatchWinner(chaosState, m.id, m.teamAId!, 11, 5);
    }
    expect(hasDownstreamBracketMatchStarted(chaosState, r1Chaos[0].id, true)).toBe(false);
    chaosState = advanceChaosRound(chaosState, players);
    expect(hasDownstreamBracketMatchStarted(chaosState, r1Chaos[0].id, true)).toBe(true);
  });
});

