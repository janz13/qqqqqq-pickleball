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

try {
  const counts = [24, 36, 48];
  for (const count of counts) {
    runSimulation(count, SessionType.TOURNAMENT_DOUBLES);
    runSimulation(count, SessionType.TOURNAMENT_SINGLE_ELIM);
    runSimulation(count, SessionType.TOURNAMENT_CHAOS);
  }
} catch (error) {
  console.error("SIMULATION ERROR:", error);
}
