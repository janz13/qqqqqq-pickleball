import { Player, SessionType, TournamentState, createPlayer } from '../src/types/models';
import { initializeTournament, buildPoolPlayRound, generateBracket, advanceMatchWinner, advanceChaosRound } from '../src/engine/tournament-engine';

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
    const counts = [24, 36, 48];
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
});

